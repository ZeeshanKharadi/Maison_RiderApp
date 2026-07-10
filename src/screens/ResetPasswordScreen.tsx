import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AppSafeAreaView from '../components/AppSafeAreaView';
import Loader from '../components/Loader';
import { updatePassword } from '../services/UserService';
import { getUserIdWithExpiry } from './CreateAccountScreen';
import { resetNavigation } from '../navigation/RootNavigation';
import {
  BACKGROUND,
  BORDER_INPUT,
  BRAND_RED,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/colors';

export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleReset = async () => {
    if (!password || password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    const userId = await getUserIdWithExpiry();
    if (!userId) {
      Alert.alert('Error', 'Session expired. Please start again.');
      resetNavigation('login');
      return;
    }

    setIsLoading(true);
    try {
      const result = await updatePassword(userId, password);
      if (result.status) {
        Alert.alert('Success', 'Password updated! Please login.', [
          { text: 'OK', onPress: () => resetNavigation('login') },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Failed to update password');
      }
    } catch {
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppSafeAreaView contentStyle={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerSection}>
            <View style={styles.iconCircle}>
              <Icon name="key-change" size={36} color={BRAND_RED} />
            </View>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>
              Create a new password for your rider account.
            </Text>
          </View>

          <Text style={styles.label}>New Password</Text>
          <View style={styles.inputBox}>
            <Icon name="lock-outline" size={20} color={TEXT_MUTED} />
            <TextInput
              style={styles.input}
              placeholder="Enter new password"
              placeholderTextColor={TEXT_MUTED}
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Icon
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={TEXT_MUTED}
              />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.inputBox}>
            <Icon name="lock-check-outline" size={20} color={TEXT_MUTED} />
            <TextInput
              style={styles.input}
              placeholder="Confirm new password"
              placeholderTextColor={TEXT_MUTED}
              secureTextEntry={!showPassword}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
            />
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleReset}>
            <Text style={styles.primaryBtnText}>Update Password</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Loader visible={isLoading} message="Updating password..." />
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: BACKGROUND },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 32 },
  headerSection: { alignItems: 'center', marginBottom: 32 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFF0F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
    lineHeight: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    marginBottom: 8,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER_INPUT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    padding: 0,
  },
  primaryBtn: {
    backgroundColor: BRAND_RED,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
