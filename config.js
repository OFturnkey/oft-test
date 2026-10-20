// Settings for the TEST site (ofturnkey.github.io/oft-test). The live site has its own copy of this file.
// The publish script fills in 2026-10-21 02:16.
var CONFIG = {
  env: 'test',
  version: '2026-10-21 02:16',
  // The test Apps Script web app (data only; it never serves screens).
  api: 'https://script.google.com/macros/s/AKfycbz2P0G5dOAN5jTFEa7UOEntbASpUndzLT40vQ9DdWQY56hyqqNlOAqagscpfLqp1Q599A/exec',
  // "O F Turnkey launcher" OAuth client (Sign in with Google). Not a secret.
  clientId: '174226011711-g53cncop1stgb4vsmt5ia4j0qfsluc25.apps.googleusercontent.com',
  // Where "Turn on alerts on this device" leads. Empty: no Morning alerts panel (the test app sends no alerts).
  alerts: ''
};
