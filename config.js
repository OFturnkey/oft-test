// Settings for the TEST site (ofturnkey.github.io/oft-test). The live site has its own copy of this file.
// The publish script fills in 2026-10-27 22:50.
var CONFIG = {
  env: 'test',
  version: '2026-10-27 22:50',
  // The test Apps Script web app (data only; it never serves screens).
  api: 'https://script.google.com/macros/s/AKfycbz2P0G5dOAN5jTFEa7UOEntbASpUndzLT40vQ9DdWQY56hyqqNlOAqagscpfLqp1Q599A/exec',
  // "O F Turnkey launcher" OAuth client (Sign in with Google). Not a secret.
  clientId: '174226011711-g53cncop1stgb4vsmt5ia4j0qfsluc25.apps.googleusercontent.com',
  // Where "Turn on alerts on this device" leads. Empty: no Morning alerts panel (the test app sends no alerts).
  alerts: '',
  // Firebase web settings (public, same project as the live launcher's alerts-config.js). In the test app they are
  // used only for an owner's "Send me a test alert", which reaches only the device it was pressed on.
  firebase: {
    app: {
      apiKey: 'AIzaSyCUquW64i4MiQou2uGk_v_FTZaqmcHWNZ8', authDomain: 'of-ledger.firebaseapp.com', projectId: 'of-ledger',
      storageBucket: 'of-ledger.firebasestorage.app', messagingSenderId: '174226011711', appId: '1:174226011711:web:e9b45be7d2f722eec36a8a'
    },
    vapidKey: 'BNxkLkltqCRc29rCemny0eRNwYlXQgeCiM96zpBVLCf8xtiFBg05JJCubNSJauPfSLmBMVb80khzhpW-mh1iNMo'
  }
};
