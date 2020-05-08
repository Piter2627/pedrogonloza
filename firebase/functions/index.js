const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const messaging = admin.messaging();
const firestore = admin.firestore();

const LH_HOST = 'https://lighthouse-dot-webdotdevsite.appspot.com/';

async function runLighthouse(url) {
  const resp = await fetch(`${LH_HOST}/lh/newaudit`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({url, save: true}),
  });
  const r = await resp.json();

  if (!resp.ok) {
    throw new Error(r['errors']);
  } else if (!r['lhrSlim']) {
    throw new Error('unexpected result, no lhrSlim key');
  }

  return r;
}

function renderResult(result) {
  if (!result.lhrSlim || !result.lhrSlim.length) {
    return '?';
  }
  return result.lhrSlim
    .map(({title, score}) => `${title}: ${score}\n`)
    .join('');
}

exports.runCronLighthouse = functions.https.onRequest(
  async (request, response) => {
    const start = admin.firestore.Timestamp.fromDate(new Date('2020-01-01'));
    const queryResult = await firestore
      .collection('users')
      .where('subscription', '>', start)
      .get();

    const all = [];
    queryResult.forEach((snapshot) => {
      const data = snapshot.data();
      if (data.currentUrl) {
        all.push(data);
      }
    });

    // This isn't even close to what we want in production. Just a quick hack to prove it's possible.
    const urlsToRun = {};
    all.map((data) => {
      if (data.currentUrl) {
        urlsToRun[data.currentUrl] = true;
      }
    });
    const uniques = Object.keys(urlsToRun).length;
    console.info('Found', all.length, 'subscribers,', uniques, 'unique URLs');

    const lighthouseResults = {};
    await Promise.all(
      Object.keys(urlsToRun).map(async (url) => {
        console.debug('Checking', url);
        const result = await runLighthouse(url);
        lighthouseResults[url] = renderResult(result);
      }),
    );

    let notificationsSent = 0;

    // gross
    const work = Promise.all(
      all.map(async (data) => {
        data.tokens = data.tokens || {};
        const tokens = Object.keys(data.tokens);
        if (!tokens.length) {
          // TODO: clear invalid subscription bit
          return null;
        }

        return Promise.all(
          tokens.map(async (token) => {
            const message = {
              notification: {
                title: data.currentUrl,
                body: lighthouseResults[data.currentUrl],
              },
              token,
            };
            try {
              await messaging.send(message);
              notificationsSent++;
            } catch (e) {
              // TODO: nuke this ID
              console.warn(
                "couldn't notify user about URL",
                data.currentUrl,
                'err',
                e,
              );
            }
          }),
        );
      }),
    );
    // TODO: if a notification fails, nuke its ID

    await work;
    response.send('Sent notifications: ' + notificationsSent);
  },
);
