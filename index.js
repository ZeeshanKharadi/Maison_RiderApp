/**
 * @format
 */

import 'react-native-gesture-handler';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Reference: background handler registered at entry (no-op — system tray handles background).
setBackgroundMessageHandler(getMessaging(), async () => Promise.resolve());

AppRegistry.registerComponent(appName, () => App);
