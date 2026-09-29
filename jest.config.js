module.exports = {
  preset: '@react-native/jest-preset',
  testMatch: ['<rootDir>/__tests__/**/*.[jt]s?(x)'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/android/',
    '<rootDir>/ios/',
    '<rootDir>/AdminPortal/',
    '<rootDir>/Backend/',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-vector-icons|@react-native-async-storage|@react-native-firebase|@notifee)/)',
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
