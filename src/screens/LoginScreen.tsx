import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../services/AuthContext';
import Loader from '../components/Loader';
import {
  BACKGROUND,
  BORDER_INPUT,
  BRAND_RED,
  BRAND_RED_DARK,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/colors';

export default function LoginScreen() {
  const navigation = useNavigation();
  const { login } = useAuth();
  const [employeeId, setEmployeeId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadSavedCredentials();
  }, []);

  const loadSavedCredentials = async () => {
    try {
      const saved = await AsyncStorage.getItem('rememberedCredentials');
      if (saved) {
        const { employeeId: id, password: pass } = JSON.parse(saved);
        setEmployeeId(id);
        setPassword(pass);
        setRememberMe(true);
      }
    } catch (error) {
      console.error('Error loading credentials:', error);
    }
  };

  const handleLogin = async () => {
    if (!employeeId.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both Employee ID and Password');
      return;
    }
    setIsLoading(true);
    try {
      const result = await login(employeeId.trim(), password);
      if (result.status) {
        if (rememberMe) {
          await AsyncStorage.setItem(
            'rememberedCredentials',
            JSON.stringify({ employeeId: employeeId.trim(), password }),
          );
        } else {
          await AsyncStorage.removeItem('rememberedCredentials');
        }
      } else {
        Alert.alert('Login Failed', result.message || 'Invalid credentials');
      }
    } catch {
      Alert.alert('Login Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.brandHeader}>RAPIDDELIVERY</Text>

        <View style={styles.card}>
          <Text style={styles.welcome}>Welcome Back</Text>
          <Text style={styles.caption}>
            Enter your credentials to access the delivery dashboard.
          </Text>

          <Text style={styles.label}>Employee ID</Text>
          <View style={styles.inputBox}>
            <Icon name="badge-account" size={20} color={TEXT_MUTED} />
            <TextInput
              style={styles.input}
              placeholder="RD-9921"
              placeholderTextColor={TEXT_MUTED}
              value={employeeId}
              onChangeText={setEmployeeId}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.passwordRow}>
            <Text style={styles.label}>Password</Text>
            <TouchableOpacity
              onPress={() => navigation.navigate('ForgetPassword' as never)}>
              <Text style={styles.forgotLink}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.inputBox}>
            <Icon name="lock-outline" size={20} color={TEXT_MUTED} />
            <TextInput
              style={styles.input}
              placeholder="••••••••"
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

          <View style={styles.rememberRow}>
            <Switch
              value={rememberMe}
              onValueChange={setRememberMe}
              trackColor={{ false: '#E0E0E0', true: '#F5B0B0' }}
              thumbColor={rememberMe ? BRAND_RED : '#F4F4F4'}
            />
            <Text style={styles.rememberText}>Remember Me</Text>
          </View>

          <TouchableOpacity style={styles.loginBtn} onPress={handleLogin}>
            <Text style={styles.loginBtnText}>Login</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.otpBtn}
            onPress={() => navigation.navigate('ForgetPassword' as never)}>
            <Icon name="cellphone" size={18} color={TEXT_PRIMARY} />
            <Text style={styles.otpBtnText}>Login with OTP</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => navigation.navigate('CreateAccount' as never)}>
            <Text style={styles.registerText}>
              Don't have an account?{' '}
              <Text style={styles.registerHighlight}>Register</Text>
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.footer}>
          Need technical assistance?{' '}
          <Text style={styles.footerLink}>Contact Support</Text>
        </Text>
      </ScrollView>
      <Loader visible={isLoading} message="Signing in..." />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: BACKGROUND },
  scroll: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 48,
  },
  brandHeader: {
    fontSize: 22,
    fontWeight: '800',
    color: BRAND_RED_DARK,
    textAlign: 'center',
    letterSpacing: 1,
    marginBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  welcome: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    marginBottom: 6,
  },
  caption: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    marginBottom: 24,
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
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    padding: 0,
  },
  passwordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  forgotLink: {
    fontSize: 13,
    color: BRAND_RED_DARK,
    fontWeight: '600',
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 8,
  },
  rememberText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  loginBtn: {
    backgroundColor: BRAND_RED_DARK,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: 'center',
  },
  loginBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 12,
    color: TEXT_MUTED,
    fontSize: 13,
  },
  otpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingVertical: 14,
    gap: 8,
  },
  otpBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  registerLink: {
    marginTop: 20,
    alignItems: 'center',
  },
  registerText: {
    fontSize: 14,
    color: TEXT_SECONDARY,
  },
  registerHighlight: {
    color: BRAND_RED_DARK,
    fontWeight: '700',
  },
  footer: {
    textAlign: 'center',
    marginTop: 32,
    fontSize: 13,
    color: TEXT_SECONDARY,
  },
  footerLink: {
    color: BRAND_RED_DARK,
    fontWeight: '600',
  },
});
