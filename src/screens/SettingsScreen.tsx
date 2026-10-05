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
  SectionHeader,
} from '../components/ui';
import { APP_NAME, APP_NAME_SHORT, APP_VERSION } from '../constants/app';
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
  const [pushBusy, setPushBusy] = useState(false);

  const onPushSwitch = async (enabled: boolean) => {
    if (pushBusy || enabled === settings.pushNotifications) return;
    setPushBusy(true);
    try {
      await updateSettings({ pushNotifications: enabled });
    } finally {
      setPushBusy(false);
    }
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
            label="Push notifications"
            switchValue={settings.pushNotifications}
            onSwitch={v => void onPushSwitch(v)}
            disabled={pushBusy}
          />
          <SettingsRow
            icon="translate"
            label="Language"
            value="Not available in this build"
            disabled
          />
          <SettingsRow
            icon="palette-outline"
            label="Appearance"
            value="Light only · this build"
            disabled
          />
        </View>

        <SectionHeader title="Account & privacy" style={styles.sectionGap} />
        <View style={styles.group}>
          <SettingsRow
            icon="shield-outline"
            label="Privacy"
            value="Summary only"
            onPress={() =>
              navigate('MainDrawer', { screen: 'Help', params: { section: 'privacy' } })
            }
          />
          <SettingsRow
            icon="lock-outline"
            label="Security (PIN / biometrics)"
            value="Not available in this build"
            disabled
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
            value="Summary only"
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
                `Version ${APP_VERSION}\n${APP_NAME_SHORT}.`,
              )
            }
          />
        </View>

        <Text style={styles.version}>Version {APP_VERSION}</Text>
      </ScrollView>
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
  rowValue: { ...typography.caption, marginRight: spacing.xxs, maxWidth: 160 },
  version: {
    ...typography.caption,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
