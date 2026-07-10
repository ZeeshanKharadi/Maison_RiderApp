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
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import AppSafeAreaView from '../components/AppSafeAreaView';
import Loader from '../components/Loader';
import { sendOtp } from '../services/UserService';
import {
  BACKGROUND,
  BORDER_INPUT,
  BRAND_RED,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/colors';

export const saveUserIdWithExpiry = async (userId: string) => {
  const expiryTime = Date.now() + 20 * 60 * 1000;
  await AsyncStorage.setItem(
    'tempUserId',
    JSON.stringify({ userId, expiry: expiryTime }),
  );
};

export const getUserIdWithExpiry = async (): Promise<string> => {
  const stored = await AsyncStorage.getItem('tempUserId');
  if (!stored) return '';
  const data = JSON.parse(stored);
  if (Date.now() > data.expiry) {
    await AsyncStorage.removeItem('tempUserId');
    return '';
  }
  return data.userId;
};

export default function CreateAccountScreen() {
  const navigation = useNavigation();
  const [empId, setEmpId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSendOTP = async () => {
    if (!empId.trim()) {
      Alert.alert('Error', 'Please enter your Employee ID');
      return;
    }
    setIsLoading(true);
    try {
      const result = await sendOtp(empId.trim());
      if (result.status) {
        Alert.alert(
          'Success',
          result.message || 'Verification code sent!',
        );
        await saveUserIdWithExpiry(result.data || empId.trim());
        navigation.navigate('VerifyOTP' as never);
      } else {
        Alert.alert('Error', result.message || 'Failed to send OTP');
      }
    } catch {
      Alert.alert('Error', 'Failed to send verification code');
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
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}>
            <Icon name="arrow-left" size={24} color={BRAND_RED} />
          </TouchableOpacity>

          <View style={styles.headerSection}>
            <View style={styles.iconCircle}>
              <Icon name="account-plus" size={36} color={BRAND_RED} />
            </View>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>
              Enter your Employee ID to register as a delivery rider.
            </Text>
          </View>

          <Text style={styles.label}>Employee ID</Text>
          <View style={styles.inputBox}>
            <Icon name="badge-account" size={20} color={TEXT_MUTED} />
            <TextInput
              style={styles.input}
              placeholder="RD-9921"
              placeholderTextColor={TEXT_MUTED}
              value={empId}
              onChangeText={setEmpId}
              autoCapitalize="characters"
            />
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleSendOTP}>
            <Text style={styles.primaryBtnText}>Send Verification Code</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Back to Login</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Loader visible={isLoading} message="Sending OTP..." />
    </AppSafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: BACKGROUND },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 16 },
  backBtn: { marginBottom: 16 },
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
    marginBottom: 24,
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
    marginBottom: 12,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: BRAND_RED,
    fontSize: 15,
    fontWeight: '600',
  },
});
