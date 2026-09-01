import 'react-native-gesture-handler';
import {
  getMessaging,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

setBackgroundMessageHandler(getMessaging(), async () => {
  // System tray notification is shown by FCM when a notification payload is sent.
});

AppRegistry.registerComponent(appName, () => App);
