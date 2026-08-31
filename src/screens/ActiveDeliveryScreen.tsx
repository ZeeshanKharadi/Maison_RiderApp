import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  AppHeader,
  AppButton,
  Badge,
  EmptyState,
  InfoRow,
  SectionHeader,
  StatusPill,
  confirmDialog,
} from '../components/ui';
import BottomSheet, { FilterChip } from '../components/ui/BottomSheet';
import { useRiderSession } from '../context/RiderSessionContext';
import {
  getStateConfig,
  isCompletionStep,
} from '../delivery/stateMachine';
import {
  buildDeliveryTimeline,
  jobProgress,
} from '../delivery/types';
import { paymentLabel } from '../data/orders';
import { formatMoney, formatTime } from '../utils/format';
import { navigate } from '../navigation/RootNavigation';
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from '../theme';

/**
 * Active delivery workspace — UI is driven entirely by the state machine.
 */
export default function ActiveDeliveryScreen() {
  const navigation = useNavigation();
  const {
    activeJob,
    advanceDelivery,
    completeDelivery,
    clearActiveDelivery,
    setCashCollected,
  } = useRiderSession();

  const [codSheetOpen, setCodSheetOpen] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [successEarned, setSuccessEarned] = useState(0);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;

  const config = activeJob ? getStateConfig(activeJob.state) : null;
  const progress = activeJob ? jobProgress(activeJob) : 0;
  const timeline = useMemo(
    () => (activeJob ? buildDeliveryTimeline(activeJob) : []),
    [activeJob],
  );

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 350,
      useNativeDriver: false,
    }).start();
  }, [progress, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const goDashboard = useCallback(() => {
    navigation.goBack();
    setTimeout(() => {
      navigate('MainDrawer', {
        screen: 'Tabs',
        params: { screen: 'Dashboard' },
      });
    }, 40);
  }, [navigation]);

  const contactAction = useCallback((label: string) => {
    Alert.alert(
      label,
      'Calling, messaging, and navigation will connect when device integrations are enabled.',
    );
  }, []);

  const finishTrip = useCallback(
    (opts?: { cashCollected?: boolean }) => {
      if (!activeJob) return;
      const earned = activeJob.deliveryFee;
      const result = completeDelivery(opts);
      if (!result) return;
      setSuccessVisible(true);
      setSuccessEarned(earned);
      successOpacity.setValue(0);
      Animated.sequence([
        Animated.timing(successOpacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.delay(700),
        Animated.timing(successOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setSuccessVisible(false);
        clearActiveDelivery();
        goDashboard();
      });
    },
    [
      activeJob,
      completeDelivery,
      clearActiveDelivery,
      goDashboard,
      successOpacity,
    ],
  );

  const handlePrimary = useCallback(() => {
    if (!activeJob || !config) return;

    if (isCompletionStep(activeJob.state)) {
      if (activeJob.isCod && activeJob.cashCollected !== true) {
        setCodSheetOpen(true);
        return;
      }
      confirmDialog({
        title: 'Complete delivery?',
        message: `Confirm ${activeJob.id} was delivered successfully.`,
        confirmLabel: 'Complete',
        onConfirm: finishTrip,
      });
      return;
    }

    advanceDelivery();
  }, [activeJob, config, advanceDelivery, finishTrip]);

  const handleCodYes = useCallback(() => {
    setCashCollected(true);
    setCodSheetOpen(false);
    setTimeout(() => {
      finishTrip({ cashCollected: true });
    }, 150);
  }, [setCashCollected, finishTrip]);

  const handleCodNo = useCallback(() => {
    setCashCollected(false);
    setCodSheetOpen(false);
    Alert.alert(
      'Cash not collected',
      'Collect payment from the customer before completing a COD order.',
    );
  }, [setCashCollected]);

  if (!activeJob || !config) {
    return (
      <View style={styles.container}>
        <AppHeader
          title="Active delivery"
          showBack
          onBackPress={() => navigation.goBack()}
        />
        <EmptyState
          icon="motorbike"
          title="No active delivery"
          message="Accept an order to start a delivery run."
          actionLabel="Browse orders"
          onAction={() => {
            navigation.goBack();
            navigate('MainDrawer', {
              screen: 'Tabs',
              params: { screen: 'Orders' },
            });
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AppHeader
        title={activeJob.id}
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.statusHeader}>
          <StatusPill label={config.pillLabel} tone={config.pillTone} />
          <Text style={styles.progressPct}>{progress}%</Text>
        </View>
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.description}>{config.description}</Text>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        <SectionHeader title="Timeline" />
        <View style={styles.card}>
          {timeline.map((step, index) => (
            <View key={step.state} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View
                  style={[
                    styles.dot,
                    step.status === 'done' && styles.dotDone,
                    step.status === 'current' && styles.dotCurrent,
                    step.status === 'upcoming' && styles.dotUpcoming,
                  ]}
                />
                {index < timeline.length - 1 ? (
                  <View
                    style={[
                      styles.line,
                      step.status === 'done' && styles.lineDone,
                    ]}
                  />
                ) : null}
              </View>
              <View style={styles.timelineBody}>
                <Text
                  style={[
                    styles.stepLabel,
                    step.status === 'upcoming' && styles.stepMuted,
                    step.status === 'current' && styles.stepCurrent,
                  ]}>
                  {step.label}
                </Text>
                <Text style={styles.stepTime}>
                  {step.at ? formatTime(step.at) : '—'}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <SectionHeader title="Pickup" />
        <View style={styles.card}>
          <InfoRow
            icon="storefront-outline"
            label="Restaurant"
            value={activeJob.restaurant}
          />
          <InfoRow
            icon="map-marker"
            label="Address"
            value={activeJob.pickupAddress}
          />
        </View>

        <SectionHeader title="Customer" />
        <View style={styles.card}>
          <InfoRow
            icon="account"
            label="Name"
            value={activeJob.customerName}
          />
          <InfoRow
            icon="phone"
            label="Phone"
            value={activeJob.customerPhone}
          />
          <InfoRow
            icon="map-marker-radius"
            label="Drop-off"
            value={activeJob.dropoffAddress}
          />
        </View>

        <SectionHeader title="Package & payment" />
        <View style={styles.card}>
          <InfoRow
            icon="package-variant"
            label="Package"
            value={`${activeJob.items} items · ${activeJob.packageInfo}`}
          />
          <InfoRow
            icon="credit-card-outline"
            label="Payment"
            value={paymentLabel(activeJob.paymentMethod)}
          />
          <InfoRow
            icon="cash"
            label="COD"
            value={
              activeJob.isCod
                ? `Collect ${formatMoney(activeJob.orderAmount)}`
                : 'Prepaid'
            }
          />
          <InfoRow
            icon="bike-fast"
            label="Delivery fee"
            value={formatMoney(activeJob.deliveryFee)}
          />
          {activeJob.specialInstructions ? (
            <InfoRow
              icon="note-text-outline"
              label="Instructions"
              value={activeJob.specialInstructions}
            />
          ) : null}
        </View>

        <View style={styles.badges}>
          {activeJob.isCod ? <Badge label="COD" tone="warning" icon="cash" /> : null}
          {activeJob.express ? (
            <Badge label="Express" tone="info" icon="lightning-bolt" />
          ) : null}
          {activeJob.fragile ? (
            <Badge label="Fragile" tone="star" icon="glass-fragile" />
          ) : null}
        </View>

        <SectionHeader title="Quick actions" />
        <View style={styles.dummyRow}>
          <AppButton
            label="Call"
            icon="phone"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => contactAction('Call customer')}
          />
          <AppButton
            label="Message"
            icon="message-text-outline"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => contactAction('Message customer')}
          />
          <AppButton
            label="Navigate"
            icon="navigation-variant"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => contactAction('Open navigation')}
          />
        </View>

        <View style={styles.bottomSummary}>
          <View>
            <Text style={styles.summaryLabel}>You'll earn</Text>
            <Text style={styles.summaryValue}>
              {formatMoney(activeJob.deliveryFee)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>Distance</Text>
            <Text style={styles.summaryMeta}>
              {activeJob.distanceMiles} mi · ~{activeJob.etaMinutes} min
            </Text>
          </View>
        </View>

        {config.primaryAction ? (
          <AppButton
            label={config.primaryAction}
            icon="check-circle"
            variant="secondary"
            fullWidth
            onPress={handlePrimary}
            accessibilityLabel={config.primaryAction}
            style={styles.primaryBtn}
          />
        ) : null}
      </ScrollView>

      <BottomSheet
        visible={codSheetOpen}
        title="Collect cash (COD)"
        onClose={() => setCodSheetOpen(false)}
        footer={
          <View style={styles.codActions}>
            <AppButton
              label="Yes, collected"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={handleCodYes}
            />
            <AppButton
              label="Not yet"
              variant="outline"
              style={{ flex: 1 }}
              onPress={handleCodNo}
            />
          </View>
        }>
        <Text style={styles.codHint}>
          Collect {formatMoney(activeJob.orderAmount)} from{' '}
          {activeJob.customerName} before completing this COD order.
        </Text>
        <View style={styles.codChips}>
          <FilterChip label="Cash on delivery" selected onPress={() => {}} />
        </View>
      </BottomSheet>

      {successVisible ? (
        <Animated.View
          style={[styles.successOverlay, { opacity: successOpacity }]}
          pointerEvents="none">
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Delivery completed</Text>
            <Text style={styles.successBody}>
              +{formatMoney(successEarned)} added to wallet
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  statusHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  progressPct: {
    ...typography.bodyStrong,
    color: colors.primaryDark,
  },
  title: {
    ...typography.heading,
    fontSize: 22,
  },
  description: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xxs,
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.disabled,
    overflow: 'hidden',
    marginBottom: spacing.lg,
  },
  progressFill: {
    height: 10,
    backgroundColor: colors.success,
    borderRadius: radius.full,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  timelineRow: {
    flexDirection: 'row',
    minHeight: 44,
  },
  timelineRail: {
    width: 20,
    alignItems: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  dotDone: { backgroundColor: colors.success },
  dotCurrent: {
    backgroundColor: colors.primaryDark,
    borderWidth: 2,
    borderColor: colors.primarySoft,
  },
  dotUpcoming: { backgroundColor: colors.borderStrong },
  line: {
    width: 2,
    flex: 1,
    backgroundColor: colors.border,
    marginVertical: 2,
  },
  lineDone: { backgroundColor: colors.success },
  timelineBody: { flex: 1, paddingBottom: spacing.sm },
  stepLabel: { ...typography.bodyStrong },
  stepCurrent: { color: colors.primaryDark },
  stepMuted: { color: colors.textMuted },
  stepTime: { ...typography.caption, marginTop: 2 },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
    marginBottom: spacing.lg,
  },
  dummyRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  dummyBtn: { flex: 1 },
  bottomSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...elevation.small,
  },
  summaryLabel: { ...typography.caption },
  summaryValue: {
    ...typography.title,
    color: colors.success,
    marginTop: 2,
  },
  summaryMeta: { ...typography.bodyStrong, marginTop: 2 },
  primaryBtn: { marginBottom: spacing.lg },
  codHint: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  codChips: { flexDirection: 'row', marginBottom: spacing.sm },
  codActions: { flexDirection: 'row', gap: spacing.sm },
  successOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    ...elevation.large,
  },
  successTitle: {
    ...typography.title,
    color: colors.success,
  },
  successBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
});
