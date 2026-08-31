import React, { useMemo, useState } from 'react';
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
  Badge,
  BottomSheet,
  FilterChip,
  InfoRow,
  SectionHeader,
  StatCard,
  StatusPill,
  confirmDialog,
} from '../components/ui';
import {
  AppLanguage,
  DocumentStatus,
  LANGUAGE_LABELS,
  RiderProfile,
} from '../data/account';
import { APP_VERSION } from '../constants/app';
import { formatMoney } from '../utils/format';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { TOUCH_TARGET } from '../theme/spacing';

function docTone(status: DocumentStatus): 'success' | 'warning' | 'error' {
  if (status === 'verified') return 'success';
  if (status === 'pending') return 'warning';
  return 'error';
}

function docLabel(status: DocumentStatus): string {
  if (status === 'verified') return 'Verified';
  if (status === 'pending') return 'Pending';
  return 'Expired';
}

type EditDraft = Pick<
  RiderProfile,
  'phone' | 'emergencyContact' | 'vehicle' | 'vehicleNumber' | 'language'
>;

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const { openMenu } = useSideMenu();
  const { isOnline, activeJob, wallet, stats } = useRiderSession();
  const { profile, documents, updateProfile } = useAccount();

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<EditDraft>({
    phone: profile.phone,
    emergencyContact: profile.emergencyContact,
    vehicle: profile.vehicle,
    vehicleNumber: profile.vehicleNumber,
    language: profile.language,
  });
  const [saving, setSaving] = useState(false);

  const displayName = profile.fullName || user?.name || 'Rider';
  const shiftLabel = activeJob
    ? 'On delivery'
    : isOnline
      ? 'On shift'
      : 'Off shift';

  const lifetimeDeliveries = useMemo(
    () => Math.max(stats.monthlyDeliveries, stats.weeklyDeliveries),
    [stats.monthlyDeliveries, stats.weeklyDeliveries],
  );

  const openEdit = () => {
    setDraft({
      phone: profile.phone,
      emergencyContact: profile.emergencyContact,
      vehicle: profile.vehicle,
      vehicleNumber: profile.vehicleNumber,
      language: profile.language,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      const ok = await updateProfile(draft);
      if (!ok) {
        Alert.alert('Couldn’t save', 'Please try again.');
        return;
      }
      setEditOpen(false);
      Alert.alert('Profile updated', 'Your changes have been saved.');
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
          <InfoRow
            icon="translate"
            label="Language"
            value={LANGUAGE_LABELS[profile.language]}
          />
        </View>

        <SectionHeader title="Vehicle" style={styles.sectionGap} />
        <View style={styles.card}>
          <InfoRow icon="moped" label="Vehicle" value={profile.vehicle} />
          <InfoRow
            icon="card-text-outline"
            label="Vehicle Number"
            value={profile.vehicleNumber}
          />
          <InfoRow
            icon="card-account-details-outline"
            label="License Number"
            value={profile.licenseNumber}
          />
        </View>

        <SectionHeader title="Performance snapshot" style={styles.sectionGap} />
        <View style={styles.statsRow}>
          <StatCard
            label="Rating"
            value={stats.todayRating.toFixed(1)}
            icon="star"
            style={styles.stat}
          />
          <StatCard
            label="Deliveries"
            value={String(lifetimeDeliveries)}
            icon="package-variant"
            style={styles.stat}
          />
          <StatCard
            label="Earnings"
            value={formatMoney(wallet.lifetimeEarnings, true)}
            icon="cash"
            style={styles.stat}
          />
        </View>

        <SectionHeader title="Documents" style={styles.sectionGap} />
        <View style={styles.docGrid}>
          {documents.map(doc => (
            <View key={doc.id} style={styles.docCard}>
              <View style={styles.docTop}>
                <Icon
                  name="file-document-outline"
                  size={22}
                  color={colors.primaryDark}
                />
                <Badge
                  label={docLabel(doc.status)}
                  tone={docTone(doc.status)}
                  icon={
                    doc.status === 'verified' ? 'check-decagram' : undefined
                  }
                />
              </View>
              <Text style={styles.docTitle}>{doc.title}</Text>
              <Text style={styles.docExpiry}>Expires {doc.expiryDate}</Text>
            </View>
          ))}
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
        <Field
          label="Vehicle"
          value={draft.vehicle}
          onChangeText={t => setDraft(d => ({ ...d, vehicle: t }))}
        />
        <Field
          label="Vehicle Number"
          value={draft.vehicleNumber}
          onChangeText={t => setDraft(d => ({ ...d, vehicleNumber: t }))}
          autoCapitalize="characters"
        />
        <Text style={styles.fieldLabel}>Language</Text>
        <View style={styles.langRow}>
          {(Object.keys(LANGUAGE_LABELS) as AppLanguage[]).map(code => (
            <FilterChip
              key={code}
              label={LANGUAGE_LABELS[code]}
              selected={draft.language === code}
              onPress={() => setDraft(d => ({ ...d, language: code }))}
            />
          ))}
        </View>
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
  docGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  docCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...elevation.small,
  },
  docTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  docTitle: { ...typography.bodyStrong, marginBottom: 4 },
  docExpiry: { ...typography.caption },
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
  langRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
});
