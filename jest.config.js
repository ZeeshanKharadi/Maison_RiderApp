module.exports = {
  preset: '@react-native/jest-preset',
  testPathIgnorePatterns: ['/node_modules/', '/android/', '/ios/', '/AdminPortal/', '/Backend/'],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-vector-icons|@react-native-async-storage|@react-native-firebase|@notifee)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
