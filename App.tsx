import React from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from './src/services/AuthContext';
import { navigationRef } from './src/navigation/RootNavigation';
import SplashScreen from './src/screens/SplashScreen';
import LoginScreen from './src/screens/LoginScreen';
import CreateAccountScreen from './src/screens/CreateAccountScreen';
import ForgetPasswordScreen from './src/screens/ForgetPasswordScreen';
import VerifyOTPScreen from './src/screens/VerifyOTPScreen';
import ResetPasswordScreen from './src/screens/ResetPasswordScreen';
import AuthenticatedApp from './src/navigation/MainNavigator';
import { colors, BRAND_RED } from './src/theme/colors';

const Stack = createStackNavigator();

const STACK_SCREEN_OPTIONS = {
  headerShown: false,
  animation: 'fade' as const,
  cardStyle: { backgroundColor: colors.surface },
};

function MainNavigator() {
  const { user, isLoading, splashDone } = useAuth();

  if (isLoading || !splashDone) {
    return (
      <Stack.Navigator screenOptions={STACK_SCREEN_OPTIONS}>
        <Stack.Screen name="splash" component={SplashScreen} />
      </Stack.Navigator>
    );
  }

  return (
    <Stack.Navigator
      key={user ? 'authenticated' : 'unauthenticated'}
      initialRouteName={user ? 'MainDrawer' : 'login'}
      screenOptions={STACK_SCREEN_OPTIONS}>
      {user ? (
        <Stack.Screen name="MainDrawer" component={AuthenticatedApp} />
      ) : (
        <>
          <Stack.Screen name="login" component={LoginScreen} />
          <Stack.Screen name="CreateAccount" component={CreateAccountScreen} />
          <Stack.Screen name="ForgetPassword" component={ForgetPasswordScreen} />
          <Stack.Screen name="VerifyOTP" component={VerifyOTPScreen} />
          <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor={BRAND_RED} />
        <AuthProvider>
          <NavigationContainer ref={navigationRef}>
            <MainNavigator />
          </NavigationContainer>
        </AuthProvider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}
