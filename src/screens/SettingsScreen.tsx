import React, { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { useAccount } from '../context/AccountContext';
import {
  AppHeader,
  BottomSheet,
  FilterChip,
  SectionHeader,
} from '../components/ui';
import {
  AppearanceMode,
  APPEARANCE_LABELS,
  AppLanguage,
  LANGUAGE_LABELS,
} from '../data/account';
import { APP_NAME, APP_VERSION } from '../constants/app';
import { navigate } from '../navigation/RootNavigation';
import { colors, radius, spacing, typography } from '../theme';
import { TOUCH_TARGET } from '../theme/spacing';

type RowProps = {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  switchValue?: boolean;
  onSwitch?: (v: boolean) => void;
  disabled?: boolean;
};

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  switchValue,
  onSwitch,
  disabled,
}: RowProps) {
  const content = (
    <View style={[styles.row, disabled && styles.rowDisabled]}>
      <Icon name={icon} size={22} color={colors.primaryDark} />
      <Text style={styles.rowLabel}>{label}</Text>
      {onSwitch != null ? (
        <Switch
          value={!!switchValue}
          onValueChange={onSwitch}
          disabled={disabled}
          trackColor={{ false: colors.disabled, true: colors.primarySoft }}
          thumbColor={switchValue ? colors.primaryDark : colors.textMuted}
          accessibilityLabel={label}
        />
      ) : (
        <>
          {value ? <Text style={styles.rowValue}>{value}</Text> : null}
          {onPress ? (
            <Icon name="chevron-right" size={20} color={colors.textMuted} />
          ) : null}
        </>
      )}
    </View>
  );

  if (onPress && !disabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

export default function SettingsScreen() {
  const navigation = useNavigation();
  const { settings, updateSettings } = useAccount();
  const [langOpen, setLangOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const setLanguage = async (language: AppLanguage) => {
    await updateSettings({ language });
    setLangOpen(false);
  };

  const setAppearance = async (appearance: AppearanceMode) => {
    if (appearance !== 'light') {
      Alert.alert(
        'Coming soon',
        'Dark and System themes are prepared in architecture but only Light mode is active.',
      );
      return;
    }
    await updateSettings({ appearance });
    setAppearanceOpen(false);
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Settings"
        showBack
        onBackPress={() => navigation.goBack()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Preferences" />
        <View style={styles.group}>
          <SettingsRow
            icon="bell-outline"
            label="Notifications"
            switchValue={settings.pushNotifications}
            onSwitch={v => void updateSettings({ pushNotifications: v })}
          />
          <SettingsRow
            icon="translate"
            label="Language"
            value={LANGUAGE_LABELS[settings.language]}
            onPress={() => setLangOpen(true)}
          />
          <SettingsRow
            icon="palette-outline"
            label="Appearance"
            value={APPEARANCE_LABELS[settings.appearance]}
            onPress={() => setAppearanceOpen(true)}
          />
          <SettingsRow
            icon="theme-light-dark"
            label="Dark Mode"
            value="Coming soon"
            disabled
          />
        </View>

        <SectionHeader title="Account & privacy" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="shield-outline"
            label="Privacy"
            onPress={() =>
              navigate('MainDrawer', { screen: 'Help', params: { section: 'privacy' } })
            }
          />
          <SettingsRow
            icon="lock-outline"
            label="Security"
            onPress={() =>
              Alert.alert(
                'Security',
                'PIN and biometric unlock will be available in a future update.',
              )
            }
          />
        </View>

        <SectionHeader title="Support" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="help-circle-outline"
            label="Help"
            onPress={() => navigate('MainDrawer', { screen: 'Help' })}
          />
          <SettingsRow
            icon="file-document-outline"
            label="Terms"
            onPress={() =>
              navigate('MainDrawer', { screen: 'Help', params: { section: 'terms' } })
            }
          />
          <SettingsRow
            icon="headset"
            label="Support"
            onPress={() =>
              navigate('MainDrawer', { screen: 'Help', params: { section: 'support' } })
            }
          />
          <SettingsRow
            icon="information-outline"
            label="About"
            value={`${APP_NAME} v${APP_VERSION}`}
            onPress={() =>
              Alert.alert(
                APP_NAME,
                `Version ${APP_VERSION}\nRapidDelivery Rider.`,
              )
            }
          />
        </View>

        <Text style={styles.version}>Version {APP_VERSION}</Text>
      </ScrollView>

      <BottomSheet
        visible={langOpen}
        title="Language"
        onClose={() => setLangOpen(false)}>
        <Text style={styles.sheetHint}>Your language preference is saved on this device.</Text>
        <View style={styles.chipWrap}>
          {(Object.keys(LANGUAGE_LABELS) as AppLanguage[]).map(code => (
            <FilterChip
              key={code}
              label={LANGUAGE_LABELS[code]}
              selected={settings.language === code}
              onPress={() => void setLanguage(code)}
            />
          ))}
        </View>
      </BottomSheet>

      <BottomSheet
        visible={appearanceOpen}
        title="Appearance"
        onClose={() => setAppearanceOpen(false)}>
        <Text style={styles.sheetHint}>
          Light is active. Dark and System are placeholders for future theming.
        </Text>
        <View style={styles.chipWrap}>
          {(Object.keys(APPEARANCE_LABELS) as AppearanceMode[]).map(mode => (
            <FilterChip
              key={mode}
              label={APPEARANCE_LABELS[mode]}
              selected={settings.appearance === mode}
              onPress={() => void setAppearance(mode)}
            />
          ))}
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  sectionGap: { marginTop: spacing.lg },
  group: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: TOUCH_TARGET + 8,
  },
  rowDisabled: { opacity: 0.55 },
  rowLabel: { ...typography.bodyStrong, flex: 1 },
  rowValue: { ...typography.caption, marginRight: spacing.xxs, maxWidth: 140 },
  version: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  sheetHint: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap' },
});
