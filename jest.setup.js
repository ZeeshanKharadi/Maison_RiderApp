/* Jest setup — mocks for native / navigation deps used by App.test.tsx */
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: ({ children, style }) =>
      React.createElement(View, { style }, children),
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    PanGestureHandler: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    Directions: {},
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 390, height: 844 };
  const SafeAreaInsetsContext = React.createContext(inset);
  const SafeAreaFrameContext = React.createContext(frame);
  return {
    SafeAreaProvider: ({ children }) => React.createElement(View, null, children),
    SafeAreaConsumer: SafeAreaInsetsContext.Consumer,
    SafeAreaView: View,
    SafeAreaInsetsContext,
    SafeAreaFrameContext,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { frame, insets: inset },
  };
});

jest.mock('react-native-screens', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    enableScreens: jest.fn(),
    enableFreeze: jest.fn(),
    screensEnabled: () => false,
    Screen: View,
    ScreenContainer: View,
    NativeScreen: View,
    NativeScreenContainer: View,
    ScreenStack: View,
    ScreenStackHeaderConfig: View,
    FullWindowOverlay: View,
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

jest.mock('react-native-vector-icons/MaterialCommunityIcons', () => 'Icon');

jest.mock('@react-native-firebase/messaging', () => {
  const messagingInstance = {};
  const AuthorizationStatus = { AUTHORIZED: 1, PROVISIONAL: 2, DENIED: 0 };
  return {
    __esModule: true,
    AuthorizationStatus,
    getMessaging: jest.fn(() => messagingInstance),
    getToken: jest.fn(async () => null),
    requestPermission: jest.fn(async () => AuthorizationStatus.AUTHORIZED),
    registerDeviceForRemoteMessages: jest.fn(async () => undefined),
    onMessage: jest.fn(() => jest.fn()),
    onNotificationOpenedApp: jest.fn(() => jest.fn()),
    getInitialNotification: jest.fn(async () => null),
    onTokenRefresh: jest.fn(() => jest.fn()),
    default: () => ({
      getToken: jest.fn(async () => null),
      requestPermission: jest.fn(async () => AuthorizationStatus.AUTHORIZED),
      onMessage: jest.fn(() => jest.fn()),
      onNotificationOpenedApp: jest.fn(() => jest.fn()),
      getInitialNotification: jest.fn(async () => null),
      onTokenRefresh: jest.fn(() => jest.fn()),
    }),
  };
});

jest.mock('@react-native-firebase/app', () => ({
  __esModule: true,
  default: () => ({}),
  getApp: jest.fn(() => ({})),
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(async () => 'channel'),
    displayNotification: jest.fn(async () => undefined),
    onForegroundEvent: jest.fn(() => jest.fn()),
  },
  AndroidImportance: { HIGH: 4 },
  EventType: { PRESS: 1, DISMISS: 0, DELIVERED: 3 },
}));

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    requestAuthorization: jest.fn(async () => 'granted'),
    getCurrentPosition: jest.fn(),
    watchPosition: jest.fn(() => 1),
    clearWatch: jest.fn(),
    stopObserving: jest.fn(),
  },
}));

jest.mock('react-native-maps', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Mock = (props) => React.createElement(View, props);
  Mock.Marker = View;
  Mock.Polyline = View;
  return { __esModule: true, default: Mock, Marker: View, Polyline: View };
});

jest.mock('@react-native-community/netinfo', () => {
  const listeners = new Set();
  return {
    __esModule: true,
    default: {
      fetch: jest.fn(async () => ({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      })),
      addEventListener: jest.fn(listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }),
    },
  };
});

jest.mock('react-native-linear-gradient', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children, style, ...rest }) =>
      React.createElement(View, { style, ...rest }, children),
  };
});
