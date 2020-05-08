import {firebaseConfig} from 'webdev_config';
import {store} from './store';
import {clearSignedInState, configureMessagingSubscription} from './actions';
import {buildLoader} from './utils/firebase-loader';
import {trackError} from './analytics';
import {serviceWorker} from './app';

const firebasePromise = buildLoader(['app', 'auth', 'performance'], () => {
  return window.firebase;
})();
firebasePromise.then(initialize).catch((err) => {
  console.error('failed to load Firebase', err);
  trackError(err, 'firebase load');
});

const firestorePromiseLoader = buildLoader(['firestore'], () => {
  return window.firebase.firestore();
});

export const messagingPromiseLoader = buildLoader(['messaging'], async () => {
  if (!window.firebase.messaging.isSupported()) {
    return null;
  }
  const registration = await serviceWorker;
  if (!registration) {
    return null; // messaging makes no sense without a registered SW
  }

  const messaging = window.firebase.messaging();

  messaging.useServiceWorker(registration);
  messaging.usePublicVapidKey(firebaseConfig.vapidKey);

  messaging.onTokenRefresh(() => {
    // This should always succeed, because we've literally just been told there's a new token.
    // TODO(samthor): This is racey. If a previous update is in progress right now, this will
    // return immediately and never update the token.
    const {hasRegisteredMessaging} = store.getState();
    configureMessagingSubscription(hasRegisteredMessaging).catch((err) => {
      // A failure in the action _should_ result in messaging just being disabled.
      console.error('token refresh failed to update', err);
      trackError(err, 'token refresh');
    });
  });

  return messaging;
});

// If the initial state indicates messaging was already configured, fetch the library and subscribe
// to token changes. This could just look at `Notification.permission`, but we don't want to fetch
// this if the user has e.g. enabled then disabled notifications.
if (store.getState().hasRegisteredMessaging) {
  messagingPromiseLoader();
}
// TODO(samthor): We should ask for `silentGetMessagingToken()` here to confirm 'hasRegisteredMessaging'.
// We can match it against the user's snapshot to confirm whether it's correct.

function initialize(firebase) {
  firebase.initializeApp(firebaseConfig);
  firebase.performance(); // initialize performance monitoring

  let firestoreUserUnsubscribe = () => {};
  let lastSavedUrl = null;

  const onUserSnapshot = (snapshot) => {
    let saveNewUrlToState = false;

    // We expect the user snapshot to look like:
    // {
    //   currentUrl: String,          # current URL saved to Firestore
    //   urls: {String: Timestamp},   # URL to first time used (including current URL)
    //   cron: boolean,               # whether the user wants notifications
    //   tokens: {String: Timestamp}, # token to last time used
    // }
    const data = snapshot.data() || {}; // is empty on new user

    // TODO(samthor): Use PushSubscription (rather than the _whole_ messaging library) to work out
    // whether we had a previous subscription.

    const savedUrl = data.currentUrl || '';

    const {userUrl, userUrlSeen, activeLighthouseUrl} = store.getState();
    if (activeLighthouseUrl !== null) {
      // Do nothing, as the active URL action will eventually write its results.
      // This will also trigger a write to Firestore.
    } else if (lastSavedUrl && lastSavedUrl !== savedUrl) {
      // The user changed their target URL in another browser. Update it.
      // This doesn't fire on the first snapshot as |lastSavedUrl| begins
      // as null.
      saveNewUrlToState = true;
    } else if (!userUrl) {
      // Update to remote if there was no URL run before signin.
      saveNewUrlToState = true;
    } else if (!lastSavedUrl && userUrl) {
      // This is the first snapshot from Firebase, but the user has a local URL.
      // The user has run Lighthouse, but then signed in. Save the new run
      // to Firebase.
      saveUserUrl(userUrl, userUrlSeen);
      lastSavedUrl = userUrl;
      // Return early as we preempt the Firestore snapshot via lastSavedUrl
      return;
    } else {
      // Do nothing, as the last remote URL is already up-to-date. This occurs
      // if a snapshot was triggered for a field we don't care about.
    }
    lastSavedUrl = savedUrl;

    // The URL changed, so record it from remote, and optionally indicate that
    // <web-lighthouse-scores-container> should request new content when it
    // appears on the page.
    if (saveNewUrlToState) {
      const seen = (data.urls && data.urls[savedUrl]) || null;
      const userUrlSeen = seen ? seen.toDate() : null;
      const userUrlResultsPending = Boolean(savedUrl); // only fetch results if the URL was set

      store.setState({
        userUrl: savedUrl,
        userUrlSeen,
        userUrlResultsPending,
      });
    }
  };

  // Listen for the user's signed in state and update the store.
  firebase.auth().onAuthStateChanged((user) => {
    store.setState({checkingSignedInState: false});
    firestoreUserUnsubscribe();

    if (!user) {
      clearSignedInState();
      return;
    }

    // Don't clear userUrl, as the user might have requested a Lighthouse prior to signing in, and
    // there's an active action.
    store.setState({
      isSignedIn: true,
      user,
    });
    lastSavedUrl = null;

    // This unsubscribe function is used if the user signs out. However, the user's row cannot be
    // watched until the Firestore library is ready, so wrap the actual internal unsubscribe call.
    firestoreUserUnsubscribe = (function() {
      let internalUnsubscribe = null;
      let unsubscribed = false;

      userRef()
        .then((ref) => {
          if (!unsubscribed) {
            internalUnsubscribe = ref.onSnapshot(onUserSnapshot);
          }
        })
        .catch((err) => {
          console.warn('failed to load Firestore library', err);
          trackError(err, 'firestore load');
        });

      return () => {
        unsubscribed = true;
        if (internalUnsubscribe) {
          internalUnsubscribe();
          internalUnsubscribe = null;
        }
      };
    })();
  });
}

/**
 * Gets the Firestore reference to the user's document.
 *
 * @return {?Object}
 */
async function userRef() {
  const state = store.getState();
  if (!state.user) {
    return null;
  }

  const firestore = await firestorePromiseLoader();
  return firestore.collection('users').doc(state.user.uid);
}

/**
 * Updates the user's row in Firestore with a new subscription token for this device. This may
 * optionally also delete the user's previous token.
 *
 * @param {?string} token
 * @param {?string=} existingToken
 * @return {boolean} whether a change was made
 */
export async function updateSubscription(token, existingToken = null) {
  const ref = await userRef();
  if (!ref) {
    return false;
  }
  token = token || null;
  existingToken = existingToken || null;

  const updates = [];

  if (token) {
    updates.push(
      new firebase.firestore.FieldPath('tokens', token),
      firebase.firestore.FieldValue.serverTimestamp(),
    );
  }
  if (existingToken && existingToken !== token) {
    // Firestore won't let us pass e.g. {tokens: {[token]: deleteFieldValue}}.
    updates.push(
      new firebase.firestore.FieldPath('tokens', existingToken),
      firebase.firestore.FieldValue.delete(),
    );
  }

  if (!updates.length) {
    return false;
  }

  // We need to write something globally helpful that can be indexed on, so ensure that the
  // 'subscriptions' field is set if the user has any.
  const firestore = await firestorePromiseLoader();
  await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    data.tokens = data.tokens || {};

    if (existingToken && existingToken !== token) {
      delete data.tokens[existingToken];
    }
    const hasSubscriptions =
      Boolean(token) || Object.keys(data.tokens).length > 0;
    if (data.hasSubscriptions !== hasSubscriptions) {
      updates.push(
        'subscription',
        hasSubscriptions
          ? firebase.firestore.FieldValue.serverTimestamp()
          : firebase.firestore.FieldValue.delete(),
      );
    }

    return transaction.update(ref, ...updates);
  });
  return true;
}

/**
 * Updates the user's row in Firestore (if signed in) with an updated URL and optional audit time.
 *
 * @param {string} url to update the user's row with
 * @param {!Date} auditedOn of the most recent Lighthouse run
 * @return {!Date} the earliest audit seen for this URL
 */
export async function saveUserUrl(url, auditedOn = null) {
  const ref = await userRef();
  if (!ref) {
    return null; // not signed in so user has never seen this site
  }

  // This must exist, as userRef() forces Firestore to be loaded.
  const firestore = await firestorePromiseLoader();
  const p = firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};

    // nb. If the userUrl matches, we can't actually just return, because Firestore demands that
    // every document read during a transaction is written again.

    const update = {
      currentUrl: url,
    };

    const prevSeen = (data.urls && data.urls[url]) || null;
    if (prevSeen) {
      // nb. There's already a valid timestamp here, so don't replace it with a future time,
      // but grab it so we can inform a signed-in caller.
      const cand = prevSeen.toDate();
      if (cand.getTime() && cand.getTime() < auditedOn.getTime()) {
        auditedOn = cand; // take earliest date
      }
    } else if (auditedOn && auditedOn.getTime()) {
      // Set the timestamp of this run, so the user gets runs from it and forward in future.
      update.urls = {
        [url]: auditedOn,
      };
    }

    return transaction.set(ref, update, {merge: true});
  });

  try {
    await p;
  } catch (err) {
    // Note: We don't plan to do anything here. If we can't write to Firebase, we can still
    // try to invoke Lighthouse with the new URL.
    console.warn('could not write URL to Firestore', err);
    trackError(err, 'write URL');
  }

  return auditedOn;
}

/**
 * Gets the Firebase Messaging Token, but avoids prompting the user if Notification is not allowed.
 *
 * @return {?string}
 */
export async function silentGetMessagingToken() {
  if (Notification.permission !== 'granted') {
    return null;
  }
  const messaging = await messagingPromiseLoader();
  try {
    return await messaging.getToken();
  } catch (e) {
    // catch error
    return null;
  }
}

/**
 * Request that the user signs in. Resolves on completion.
 *
 * @return {?Object} the auth user
 */
export async function signIn() {
  let user = null;
  try {
    await firebasePromise;
    const provider = new firebase.auth.GoogleAuthProvider();
    const res = await firebase.auth().signInWithPopup(provider);
    user = res.user;
  } catch (err) {
    console.error('signIn error', err);
    trackError(err, 'signIn');
  }

  return user;
}

/**
 * Requests that the user signs out.
 */
export async function signOut() {
  try {
    await firebasePromise;
    await firebase.auth().signOut();
  } catch (err) {
    console.error('signOut error', err);
    trackError(err, 'signOut');
  }
}
