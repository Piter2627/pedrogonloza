import {firebaseVersion, firebaseConfig} from 'webdev_config';

const firebasePrefix = '//www.gstatic.com/firebasejs/' + firebaseVersion;

export function configureFirebase() {
  importScripts(firebasePrefix + '/firebase-app.js');
  importScripts(firebasePrefix + '/firebase-messaging.js');

  firebase.initializeApp(firebaseConfig);

  // This forces messaging to be initialized. We don't set a custom handler,
  // instead just allowing Firebase to run its default Notification prompt.
  firebase.messaging();
}
