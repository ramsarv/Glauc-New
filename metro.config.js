const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Exclude server-only packages from the mobile bundle.
// These were added to root package.json for Vercel, but Metro
// must not try to bundle them into the Android/iOS app.
config.resolver.blockList = [
  /node_modules\/@libsql\/.*/,
  /node_modules\/better-sqlite3\/.*/,
  /node_modules\/express\/.*/,
  /node_modules\/sharp\/.*/,
  /node_modules\/helmet\/.*/,
  /node_modules\/multer\/.*/,
  /node_modules\/bcryptjs\/.*/,
  /node_modules\/jose\/.*/,
  /node_modules\/stripe\/.*/,
  /node_modules\/node-fetch\/.*/,
  /node_modules\/form-data\/.*/,
  /node_modules\/dotenv\/.*/,
  /node_modules\/express-rate-limit\/.*/,
];

module.exports = config;
