import React, { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../services/AuthContext';
import { useSideMenu } from '../context/SideMenuContext';
import { useRiderSession } from '../context/RiderSessionContext';
import { useAccount } from '../context/AccountContext';
import { navigate } from '../navigation/RootNavigation';
import {
  AppHeader,
  AppButton,
  BottomSheet,
  InfoRow,
  SectionHeader,
  StatCard,
  StatusPill,
  confirmDialog,
} from '../components/ui';
import {
  RiderProfile,
} from '../data/account';
import { APP_VERSION } from '../constants/app';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { TOUCH_TARGET } from '../theme/spacing';
import * as ordersRepository from '../repositories/ordersRepository';

type EditDraft = Pick<RiderProfile, 'phone' | 'emergencyContact'>;

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { openMenu } = useSideMenu();
  const { isOnline, activeJob } = useRiderSession();
  const { profile, updateProfile } = useAccount();

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    phone: profile.phone,
    emergencyContact: profile.emergencyContact,
  });
  const [saving, setSaving] = useState(false);
  const [completedCount, setCompletedCount] = useState<number | null>(null);

  const displayName = user?.name || profile.fullName || 'Rider';
  const shiftLabel = activeJob
    ? 'On delivery'
    : isOnline
      ? 'On shift'
      : 'Off shift';

  useEffect(() => {
    let alive = true;
    void (async () => {
      const result = await ordersRepository.fetchPerformance();
      if (!alive) return;
      if (result.ok) setCompletedCount(result.data.completedCount);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const openEdit = () => {
    setDraft({
      phone: profile.phone,
      emergencyContact: profile.emergencyContact,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const result = await updateProfile(draft);
      if (!result.ok) {
        Alert.alert('Couldn’t save', result.message || 'Please try again.');
        return;
      }
      setEditOpen(false);
      Alert.alert(
        'Profile updated',
        result.message || 'Changes saved to your account.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    confirmDialog({
      title: 'Logout',
      message: 'Are you sure you want to logout?',
      confirmLabel: 'Logout',
      destructive: true,
      onConfirm: logout,
    });
  };

  return (
    <View style={styles.container}>
      <AppHeader
        title="Profile"
        showMenu
        onMenuPress={openMenu}
        rightIcon="pencil-outline"
        onRightPress={openEdit}
      />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.avatar}>
            <Icon name="account" size={48} color={colors.primaryDark} />
          </View>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.id}>#{user?.id || 'RD-9921'}</Text>
          <View style={styles.pillRow}>
            <StatusPill
              label={isOnline ? 'Online' : 'Offline'}
              tone={isOnline ? 'success' : 'neutral'}
            />
            <StatusPill
              label={shiftLabel}
              tone={activeJob ? 'info' : isOnline ? 'success' : 'neutral'}
            />
          </View>
          <AppButton
            label="Edit Profile"
            icon="pencil-outline"
            variant="ghost"
            onPress={openEdit}
            style={styles.editBtn}
          />
        </View>

        <SectionHeader title="Identity" />
        <View style={styles.card}>
          <InfoRow icon="phone-outline" label="Phone" value={profile.phone} />
          <InfoRow
            icon="email-outline"
            label="Email"
            value={profile.email || user?.email || '—'}
          />
          <InfoRow
            icon="phone-alert-outline"
            label="Emergency Contact"
            value={profile.emergencyContact}
          />
        </View>

        <SectionHeader title="Vehicle" style={styles.sectionGap} />
        <View style={styles.card}>
          <Text style={styles.managedNotice}>Managed by admin</Text>
          <Text style={styles.docNotice}>
            Vehicle and license details are not editable in this app. Contact
            your administrator if something needs updating.
          </Text>
        </View>

        <SectionHeader title="Performance snapshot" style={styles.sectionGap} />
        <Text style={styles.docNotice}>
          Last 7 days completed deliveries from the server (API default window).
          Ratings are not tracked in this app.
        </Text>
        <View style={styles.statsRow}>
          <StatCard
            label="Last 7 days completed"
            value={completedCount == null ? '—' : String(completedCount)}
            icon="package-variant"
            style={styles.stat}
          />
          <StatCard
            label="Finances"
            value="Wallet tab"
            icon="cash"
            style={styles.stat}
          />
        </View>

        <SectionHeader title="Documents" style={styles.sectionGap} />
        <View style={styles.card}>
          <Text style={styles.managedNotice}>Managed by admin</Text>
          <Text style={styles.docNotice}>
            Document verification is handled outside the rider app. There is no
            document upload or status API in this build.
          </Text>
        </View>

        <SectionHeader title="App" style={styles.sectionGap} />
        <View style={styles.card}>
          <InfoRow
            icon="information-outline"
            label="App Version"
            value={APP_VERSION}
          />
        </View>

        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => navigate('MainDrawer', { screen: 'Settings' })}
          accessibilityRole="button"
          accessibilityLabel="Open Settings">
          <Icon name="cog-outline" size={22} color={colors.primaryDark} />
          <Text style={styles.linkLabel}>Settings</Text>
          <Icon name="chevron-right" size={20} color={colors.textMuted} />
        </TouchableOpacity>

        <AppButton
          label="Logout"
          icon="logout"
          fullWidth
          onPress={handleLogout}
          style={styles.logoutBtn}
        />
      </ScrollView>

      <BottomSheet
        visible={editOpen}
        title="Edit Profile"
        onClose={() => setEditOpen(false)}
        footer={
          <AppButton
            label={saving ? 'Saving…' : 'Save changes'}
            fullWidth
            onPress={saveEdit}
            disabled={saving}
          />
        }>
        <Field
          label="Phone"
          value={draft.phone}
          onChangeText={t => setDraft(d => ({ ...d, phone: t }))}
          keyboardType="phone-pad"
        />
        <Field
          label="Emergency Contact"
          value={draft.emergencyContact}
          onChangeText={t => setDraft(d => ({ ...d, emergencyContact: t }))}
          keyboardType="phone-pad"
        />
      </BottomSheet>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  keyboardType,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  keyboardType?: 'default' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'characters';
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.lg,
    ...elevation.medium,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  name: {
    ...typography.heading,
    fontSize: 22,
    color: colors.primaryDark,
  },
  id: { ...typography.caption, marginTop: 2, marginBottom: spacing.sm },
  pillRow: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' },
  editBtn: { marginTop: spacing.md },
  sectionGap: { marginTop: spacing.lg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    ...elevation.small,
  },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1 },
  managedNotice: {
    ...typography.bodyStrong,
    marginTop: spacing.sm,
    marginBottom: spacing.xxs,
  },
  docNotice: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: TOUCH_TARGET,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xs,
  },
  linkLabel: { ...typography.bodyStrong, flex: 1 },
  logoutBtn: { marginTop: spacing.md },
  field: { marginBottom: spacing.md },
  fieldLabel: {
    ...typography.caption,
    marginBottom: spacing.xxs,
  },
  input: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: TOUCH_TARGET,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
});
