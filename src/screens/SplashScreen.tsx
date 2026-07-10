import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../services/AuthContext';
import { BRAND_RED } from '../theme/colors';

const { width } = Dimensions.get('window');

export default function SplashScreen() {
  const { setSplashDone } = useAuth();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: 5000,
      useNativeDriver: false,
    }).start();

    const timer = setTimeout(() => {
      setSplashDone(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, [progress, setSplashDone]);

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={[BRAND_RED, '#9B1B1B']} style={styles.gradient}>
        <View style={styles.circleTop} />
        <View style={styles.circleBottom} />

        <View style={styles.centerContent}>
          <View style={styles.logoBox}>
            <Icon name="moped" size={48} color={BRAND_RED} />
          </View>
          <Text style={styles.title}>RAPIDDELIVERY</Text>
          <Text style={styles.subtitle}>RIDER PORTAL</Text>
        </View>

        <View style={styles.bottomSection}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[styles.progressFill, { width: progressWidth }]}
            />
          </View>
          <Text style={styles.statusText}>
            Initializing logistics engine...
          </Text>
          <Text style={styles.version}>v1.0.0</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circleTop: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  circleBottom: {
    position: 'absolute',
    bottom: -60,
    left: -80,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  centerContent: {
    alignItems: 'center',
  },
  logoBox: {
    backgroundColor: '#FFFFFF',
    width: 100,
    height: 100,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    letterSpacing: 6,
    marginTop: 8,
    fontWeight: '500',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 60,
    width: width * 0.7,
    alignItems: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
  statusText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 12,
  },
  version: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 8,
  },
});
