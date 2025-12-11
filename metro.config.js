// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Explicitly set the entry point to App.js (not app/ directory)
config.resolver.sourceExts = [...config.resolver.sourceExts, 'js', 'jsx', 'ts', 'tsx'];

// Disable Expo Router if app directory exists but we want to use App.js
config.resolver.platforms = ['ios', 'android', 'native', 'web'];

module.exports = config;

