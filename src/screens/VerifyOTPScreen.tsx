import React, { useRef, useState } from 'react';
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
import { StackActions, useNavigation } from '@react-navigation/native';
import AppSafeAreaView from '../components/AppSafeAreaView';
import Loader from '../components/Loader';
import { useLoader } from '../hooks/useLoader';
import { verifyOtp } from '../services/UserService';
import { getUserIdWithExpiry } from './CreateAccountScreen';
import {
  BACKGROUND,
  BRAND_RED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/colors';

export default function VerifyOTPScreen() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const inputRefs = useRef<Array<TextInput | null>>([]);
  const navigation = useNavigation();
  const { isLoading, loadingMessage, showLoader, hideLoader } = useLoader();

  const handleVerifyOTP = async () => {
    const userId = await getUserIdWithExpiry();
    const enteredOtp = otp.join('');

    if (enteredOtp.length !== 6) {
      Alert.alert('Error', 'Please enter the complete 6-digit OTP');
      return;
    }

    showLoader('Verifying OTP...');
    try {
      const result = await verifyOtp(userId, enteredOtp);
      if (result.status) {
        Alert.alert('Success', 'OTP verified successfully!');
        navigation.dispatch(StackActions.replace('ResetPassword'));
      } else {
        Alert.alert('Error', result.message || 'Invalid OTP');
      }
    } catch {
      Alert.alert('Error', 'Failed to verify OTP');
    } finally {
      hideLoader();
    }
  };

  const handleOtpChange = (text: string, index: number) => {
    if (text.length > 1) {
      const pastedOtp = text.split('').slice(0, 6);
      const newOtp = [...otp];
      pastedOtp.forEach((digit, i) => {
        if (index + i < 6) newOtp[index + i] = digit;
      });
      setOtp(newOtp);
      if (index + pastedOtp.length < 6) {
        inputRefs.current[index + pastedOtp.length]?.focus();
      }
      return;
    }
    const newOtp = [...otp];
    newOtp[index] = text;
    setOtp(newOtp);
    if (text && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
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
              <Icon name="shield-check" size={36} color={BRAND_RED} />
            </View>
            <Text style={styles.title}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code sent to your registered phone.{'\n'}
              Demo OTP: 123456
            </Text>
          </View>

          <View style={styles.otpRow}>
            {otp.map((digit, index) => (
              <TextInput
                key={index}
                ref={ref => {
                  inputRefs.current[index] = ref;
                }}
                style={[styles.otpInput, digit ? styles.otpFilled : null]}
                value={digit}
                onChangeText={text => handleOtpChange(text, index)}
                onKeyPress={e => handleKeyPress(e, index)}
                keyboardType="number-pad"
                maxLength={6}
                selectTextOnFocus
              />
            ))}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={handleVerifyOTP}>
            <Text style={styles.primaryBtnText}>Verify & Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <Loader visible={isLoading} message={loadingMessage} />
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
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 8,
  },
  otpInput: {
    flex: 1,
    height: 52,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    backgroundColor: '#FFFFFF',
  },
  otpFilled: {
    borderColor: BRAND_RED,
  },
  primaryBtn: {
    backgroundColor: BRAND_RED,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
