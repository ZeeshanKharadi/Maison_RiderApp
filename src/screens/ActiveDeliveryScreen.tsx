import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  AppState,
  AppStateStatus,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import ActiveOrderSelector from '../components/delivery/ActiveOrderSelector';
import DeliveryMapPanel from '../components/delivery/DeliveryMapPanel';
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
import BottomSheet from '../components/ui/BottomSheet';
import NoConnectionBanner from '../components/NoConnectionBanner';
import { useRiderSession } from '../context/RiderSessionContext';
import { useNetworkConnectivity } from '../connectivity/NetworkConnectivityContext';
import {
  getStateConfig,
  isCompletionStep,
} from '../delivery/stateMachine';
import { resolveMapTarget } from '../delivery/mapTargets';
import {
  navigationInputForKind,
  openNavigationPlan,
  resolveNavigationPlan,
} from '../delivery/navigationDestination';
import {
  buildDeliveryTimeline,
  jobProgress,
} from '../delivery/types';
import {
  DELIVERY_ISSUE_REASONS,
  type DeliveryIssueReasonCode,
  resolveIssueRequestId,
  validateDeliveryIssueInput,
} from '../delivery/issueReasons';
import { useRiderLocation } from '../hooks/useRiderLocation';
import { paymentLabel } from '../data/orders';
import { formatMoney, formatTime } from '../utils/format';
import { navigate } from '../navigation/RootNavigation';
import type { MainStackParamList } from '../navigation/MainNavigator';
import * as ordersRepository from '../repositories/ordersRepository';
import type { DeliveryIssueReport } from '../repositories/ordersRepository';
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from '../theme';
import { shouldPollActiveDelivery } from '../utils/activeDeliverySync';

/**
 * Active delivery workspace — UI is driven entirely by the state machine.
 */
export default function ActiveDeliveryScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'ActiveDelivery'>>();
  const {
    activeJobs,
    selectedJobId,
    selectActiveJob,
    activeJob,
    advanceDelivery,
    completeDelivery,
    setCashCollected,
    lifecyclePending,
    lastLifecycleError,
    restoreActiveDeliveries,
  } = useRiderSession();
  const { isConnected } = useNetworkConnectivity();

  const {
    location: riderLocation,
    loading: locationLoading,
    error: locationError,
    refresh: refreshLocation,
  } = useRiderLocation(activeJobs.length > 0);

  const [codSheetOpen, setCodSheetOpen] = useState(false);
  const [codAmount, setCodAmount] = useState('');
  const [codReason, setCodReason] = useState('');
  const [issueSheetOpen, setIssueSheetOpen] = useState(false);
  const [issueReason, setIssueReason] = useState<DeliveryIssueReasonCode | null>(
    null,
  );
  const [issueNote, setIssueNote] = useState('');
  const [issuePending, setIssuePending] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [failureSubmitted, setFailureSubmitted] = useState(false);
  const issueRequestIdRef = useRef<string | null>(null);
  const issueFingerprintRef = useRef<string | null>(null);

  const [reportSheetOpen, setReportSheetOpen] = useState(false);
  const [reportReason, setReportReason] =
    useState<DeliveryIssueReasonCode | null>(null);
  const [reportNote, setReportNote] = useState('');
  const [reportPending, setReportPending] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [savedReport, setSavedReport] = useState<DeliveryIssueReport | null>(
    null,
  );
  const reportRequestIdRef = useRef<string | null>(null);
  const reportFingerprintRef = useRef<string | null>(null);

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

  const mapTarget = useMemo(
    () => (activeJob ? resolveMapTarget(activeJob, riderLocation) : null),
    [activeJob, riderLocation],
  );

  const openGoogleMaps = useCallback(async () => {
    if (!activeJob || !mapTarget) return;

    const plan = resolveNavigationPlan(
      navigationInputForKind(activeJob, mapTarget.kind),
      riderLocation,
    );
    await openNavigationPlan(plan, {
      canOpenURL: url => Linking.canOpenURL(url),
      openURL: url => Linking.openURL(url),
      alert: (title, message, buttons) => Alert.alert(title, message, buttons),
      platformOS: Platform.OS,
    });
  }, [activeJob, mapTarget, riderLocation]);

  useEffect(() => {
    setIssueSheetOpen(false);
    setIssueReason(null);
    setIssueNote('');
    setIssueError(null);
    setFailureSubmitted(false);
    setIssuePending(false);
    issueRequestIdRef.current = null;
    issueFingerprintRef.current = null;

    setReportSheetOpen(false);
    setReportReason(null);
    setReportNote('');
    setReportError(null);
    setSavedReport(null);
    setReportPending(false);
    reportRequestIdRef.current = null;
    reportFingerprintRef.current = null;
  }, [activeJob?.backendId]);

  const failure = activeJob?.failure;
  const failureOpen =
    failure?.requestStatus === 'Pending' ||
    failure?.requestStatus === 'ReturnApproved' ||
    failure?.requestStatus === 'RiderReturned';
  const inReturnFlow =
    activeJob?.state === 'RETURNING_TO_STORE' ||
    activeJob?.state === 'AWAITING_STORE_RECEIPT';

  const openFailureSheet = useCallback(() => {
    setIssueError(null);
    setIssueReason(null);
    setIssueNote('');
    setFailureSubmitted(!!failureOpen);
    issueRequestIdRef.current = null;
    issueFingerprintRef.current = null;
    setIssueSheetOpen(true);
  }, [failureOpen]);

  const openReportIssueSheet = useCallback(() => {
    setReportError(null);
    setReportReason(null);
    setReportNote('');
    reportRequestIdRef.current = null;
    reportFingerprintRef.current = null;

    // Show latest server report (incl. admin triage status) if one exists.
    const latest = activeJob?.issueReports?.[0];
    if (latest) {
      setSavedReport({
        id: latest.id,
        assignedOrderId: activeJob!.backendId,
        orderId: activeJob!.externalOrderId || activeJob!.id,
        orderNo: activeJob!.id,
        storeId: activeJob!.storeId || '',
        reasonCode: latest.reasonCode,
        reasonLabel: latest.reasonLabel || latest.reasonCode,
        note: latest.note,
        riderUserId: '',
        createdAt: latest.createdAt,
        orderStatus: activeJob!.backendStatus || '',
        status: latest.status,
        statusLabel: latest.statusLabel,
        acknowledgedAt: latest.acknowledgedAt,
        closedAt: latest.closedAt,
      });
    } else {
      setSavedReport(null);
    }
    setReportSheetOpen(true);
  }, [activeJob]);

  useEffect(() => {
    if (!route.params?.openReportIssue) return;
    if (!activeJob) {
      Alert.alert(
        'Active order required',
        'Reporting a delivery issue needs an active order.',
      );
      navigation.setParams({ openReportIssue: undefined } as never);
      return;
    }
    openReportIssueSheet();
    navigation.setParams({ openReportIssue: undefined } as never);
  }, [
    route.params?.openReportIssue,
    activeJob,
    openReportIssueSheet,
    navigation,
  ]);

  const submitFailureRequest = useCallback(async () => {
    if (!activeJob || issuePending) return;
    if (!isConnected) {
      setIssueError(
        'No connection. Connect to the internet to submit — requests are not queued offline.',
      );
      return;
    }
    const validation = validateDeliveryIssueInput(issueReason, issueNote);
    if (validation) {
      setIssueError(validation);
      return;
    }
    if (!issueReason) return;

    const resolved = resolveIssueRequestId({
      existingRequestId: issueRequestIdRef.current,
      existingFingerprint: issueFingerprintRef.current,
      reason: issueReason,
      note: issueNote,
      createId: ordersRepository.createRequestId,
    });
    issueRequestIdRef.current = resolved.requestId;
    issueFingerprintRef.current = resolved.fingerprint;
    const requestId = resolved.requestId;

    setIssuePending(true);
    setIssueError(null);
    const result = await ordersRepository.requestFailedDelivery(
      activeJob.backendId,
      {
        reason: issueReason,
        note: issueNote.trim() || undefined,
        requestId,
      },
    );
    setIssuePending(false);

    if (!result.ok) {
      setIssueError(result.error.message);
      return;
    }

    setFailureSubmitted(true);
    issueRequestIdRef.current = null;
    issueFingerprintRef.current = null;
    await restoreActiveDeliveries();
  }, [
    activeJob,
    issuePending,
    issueReason,
    issueNote,
    isConnected,
    restoreActiveDeliveries,
  ]);

  const submitIssueReport = useCallback(async () => {
    if (!activeJob || reportPending) return;
    if (!isConnected) {
      setReportError(
        'No connection. Connect to the internet to submit — reports are not queued offline.',
      );
      return;
    }
    const validation = validateDeliveryIssueInput(reportReason, reportNote);
    if (validation) {
      setReportError(validation);
      return;
    }
    if (!reportReason) return;

    const resolved = resolveIssueRequestId({
      existingRequestId: reportRequestIdRef.current,
      existingFingerprint: reportFingerprintRef.current,
      reason: reportReason,
      note: reportNote,
      createId: ordersRepository.createRequestId,
    });
    reportRequestIdRef.current = resolved.requestId;
    reportFingerprintRef.current = resolved.fingerprint;

    setReportPending(true);
    setReportError(null);
    const result = await ordersRepository.reportDeliveryIssue(
      activeJob.backendId,
      {
        reason: reportReason,
        note: reportNote.trim() || undefined,
        requestId: resolved.requestId,
      },
    );
    setReportPending(false);

    if (!result.ok) {
      setReportError(result.error.message);
      return;
    }

    setSavedReport(result.data);
    reportRequestIdRef.current = null;
    reportFingerprintRef.current = null;
    await restoreActiveDeliveries();
  }, [
    activeJob,
    reportPending,
    reportReason,
    reportNote,
    isConnected,
    restoreActiveDeliveries,
  ]);

  const confirmReturn = useCallback(async () => {
    if (!activeJob || lifecyclePending) return;
    if (!isConnected) {
      Alert.alert(
        'No connection',
        'Connect to the internet to confirm return. Status changes are not queued offline.',
      );
      return;
    }
    const result = await ordersRepository.confirmReturnToStore(
      activeJob.backendId,
    );
    if (!result.ok) {
      Alert.alert('Return to store', result.error.message);
      return;
    }
    await restoreActiveDeliveries();
  }, [activeJob, lifecyclePending, isConnected, restoreActiveDeliveries]);

  const screenFocusedRef = useRef(false);
  const [appState, setAppState] = useState<AppStateStatus>(
    AppState.currentState,
  );

  // Refresh when opening this screen so admin return/cancel/requeue appear.
  useFocusEffect(
    useCallback(() => {
      screenFocusedRef.current = true;
      void restoreActiveDeliveries();
      return () => {
        screenFocusedRef.current = false;
      };
    }, [restoreActiveDeliveries]),
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState);
    return () => sub.remove();
  }, []);

  // While Active Delivery stays open (foreground), poll admin-driven status.
  useEffect(() => {
    const tick = () => {
      if (
        !shouldPollActiveDelivery({
          screenFocused: screenFocusedRef.current,
          appState: AppState.currentState,
          hasActiveJob: !!activeJob,
        })
      ) {
        return;
      }
      void restoreActiveDeliveries();
    };

    if (
      !shouldPollActiveDelivery({
        screenFocused: screenFocusedRef.current,
        appState,
        hasActiveJob: !!activeJob,
      })
    ) {
      return;
    }

    const id = setInterval(tick, 12_000);
    return () => clearInterval(id);
  }, [activeJob?.backendId, appState, restoreActiveDeliveries]);

  const finishTrip = useCallback(
    async (opts?: {
      cashCollected?: boolean;
      cashCollectedAmount?: number;
      cashCollectedReason?: string;
    }) => {
      if (!activeJob) return;
      const earned = activeJob.deliveryFee;
      const result = await completeDelivery(opts);
      if (!result?.ok) {
        if (result?.message) {
          Alert.alert('Complete delivery', result.message);
        }
        return;
      }
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
        goDashboard();
      });
    },
    [activeJob, completeDelivery, goDashboard, successOpacity],
  );

  const handlePrimary = useCallback(() => {
    if (!activeJob || !config) return;
    if (!isConnected) {
      Alert.alert(
        'No connection',
        'Connect to the internet to update this delivery. Status and cash are not queued offline.',
      );
      return;
    }

    if (activeJob.state === 'RETURNING_TO_STORE') {
      confirmDialog({
        title: 'Confirm return?',
        message:
          'Confirm you have arrived at the store with this order. The manager must still confirm receipt.',
        confirmLabel: 'Confirm return',
        onConfirm: () => {
          void confirmReturn();
        },
      });
      return;
    }

    if (isCompletionStep(activeJob.state)) {
      if (activeJob.isCod) {
        const expected = activeJob.expectedCash;
        setCodAmount(expected != null ? String(expected) : '');
        setCodReason('');
        setCodSheetOpen(true);
        return;
      }
      confirmDialog({
        title: 'Complete delivery?',
        message: `Confirm ${activeJob.id} was delivered successfully.`,
        confirmLabel: 'Complete',
        onConfirm: () => {
          void finishTrip();
        },
      });
      return;
    }

    void advanceDelivery();
  }, [activeJob, config, advanceDelivery, finishTrip, confirmReturn, isConnected]);

  const handleCodSubmit = useCallback(() => {
    if (!activeJob) return;
    const amount = Number(codAmount);
    if (!Number.isFinite(amount)) {
      Alert.alert('Cash amount', 'Enter a valid cash amount.');
      return;
    }
    const expected = activeJob.expectedCash;
    if (expected == null && !codReason.trim()) {
      Alert.alert(
        'Expected cash unknown',
        'POS did not provide expected cash. Enter the amount collected and a short note.',
      );
      return;
    }
    if (
      expected != null &&
      Number(amount) !== Number(expected) &&
      !codReason.trim()
    ) {
      Alert.alert(
        'Reason required',
        'Enter a reason when collected cash differs from expected.',
      );
      return;
    }
    setCashCollected(true);
    setCodSheetOpen(false);
    void finishTrip({
      cashCollected: true,
      cashCollectedAmount: amount,
      cashCollectedReason: codReason.trim() || undefined,
    });
  }, [activeJob, codAmount, codReason, setCashCollected, finishTrip]);

  const handleCodNo = useCallback(() => {
    setCashCollected(false);
    setCodSheetOpen(false);
    Alert.alert(
      'Cash not collected',
      'Collect payment from the customer before completing a COD order.',
    );
  }, [setCashCollected]);

  const callCustomer = useCallback(() => {
    const phone = (activeJob?.customerPhone ?? '').trim();
    if (!phone || phone === '—' || phone === '-' || !/[\d+]/.test(phone)) {
      Alert.alert('Call unavailable', 'Customer phone is not available.');
      return;
    }
    void Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`);
  }, [activeJob]);

  if (activeJobs.length === 0 || !activeJob || !config) {
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

      <ActiveOrderSelector
        jobs={activeJobs}
        selectedJobId={selectedJobId}
        onSelect={selectActiveJob}
      />

      <DeliveryMapPanel
        job={activeJob}
        riderLocation={riderLocation}
        locationLoading={locationLoading}
        locationError={locationError}
      />

      <View style={styles.mapsAction}>
        <AppButton
          label="Open in Google Maps"
          icon="google-maps"
          variant="outline"
          fullWidth
          onPress={() => void openGoogleMaps()}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <NoConnectionBanner detail="Connect to the internet to update status or submit COD. Changes are not queued offline." />
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
                ? activeJob.expectedCash != null
                  ? `Collect ${formatMoney(activeJob.expectedCash)}`
                  : 'Collect cash (amount from POS unknown)'
                : 'Prepaid'
            }
          />
          <InfoRow
            icon="bike-fast"
            label="Delivery fee"
            value={
              activeJob.deliveryFee != null && activeJob.deliveryFee > 0
                ? formatMoney(activeJob.deliveryFee)
                : 'Not provided by order'
            }
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

        {failure ? (
          <View style={styles.failureBanner}>
            <Text style={styles.failureBannerTitle}>
              {failure.requestStatus === 'Pending'
                ? 'Failure request pending review'
                : failure.requestStatus === 'Rejected'
                  ? 'Failure request rejected — continue delivery'
                  : failure.requestStatus === 'ReturnApproved'
                    || activeJob.state === 'RETURNING_TO_STORE'
                    ? 'Return to store approved'
                    : failure.requestStatus === 'RiderReturned'
                      || activeJob.state === 'AWAITING_STORE_RECEIPT'
                      ? 'Awaiting store receipt'
                      : `Failure · ${failure.requestStatus}`}
            </Text>
            <Text style={styles.failureBannerBody}>
              {failure.reasonLabel || failure.reasonCode}
              {failure.decisionNote ? ` · ${failure.decisionNote}` : ''}
            </Text>
            {failure.cashCollectedWarning ? (
              <Text style={styles.failureCashWarn}>
                Cash collected on this order — not earnings; store must reconcile.
              </Text>
            ) : null}
          </View>
        ) : null}

        <SectionHeader title="Quick actions" />
        <View style={styles.dummyRow}>
          <AppButton
            label="Call"
            icon="phone"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={callCustomer}
          />
          <AppButton
            label="Report issue"
            icon="flag-outline"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={openReportIssueSheet}
          />
          <AppButton
            label="Failed delivery"
            icon="alert-circle-outline"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={openFailureSheet}
            disabled={inReturnFlow}
          />
          <AppButton
            label="Open Maps"
            icon="google-maps"
            variant="ghost"
            style={styles.dummyBtn}
            onPress={() => void openGoogleMaps()}
          />
        </View>

        {lastLifecycleError ? (
          <Text style={styles.errorText}>{lastLifecycleError}</Text>
        ) : null}

        {locationError ? (
          <AppButton
            label="Retry GPS"
            icon="crosshairs-gps"
            variant="outline"
            fullWidth
            onPress={refreshLocation}
            style={styles.gpsRetry}
          />
        ) : null}

        <View style={styles.bottomSummary}>
          <View>
            <Text style={styles.summaryLabel}>
              {activeJob.deliveryFee != null && activeJob.deliveryFee > 0
                ? 'Delivery fee'
                : 'Order total'}
            </Text>
            <Text style={styles.summaryValue}>
              {activeJob.deliveryFee != null && activeJob.deliveryFee > 0
                ? formatMoney(activeJob.deliveryFee)
                : formatMoney(activeJob.orderAmount)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.summaryLabel}>Distance</Text>
            <Text style={styles.summaryMeta}>
              {activeJob.distanceMiles != null
                ? `${activeJob.distanceMiles} mi`
                : '—'}
              {activeJob.etaMinutes != null
                ? ` · ~${activeJob.etaMinutes} min`
                : ''}
            </Text>
          </View>
        </View>

        {config.primaryAction ? (
          <AppButton
            label={lifecyclePending ? 'Updating…' : config.primaryAction}
            icon="check-circle"
            variant="secondary"
            fullWidth
            onPress={handlePrimary}
            disabled={lifecyclePending || !isConnected}
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
              label="Confirm collected"
              variant="secondary"
              style={{ flex: 1 }}
              onPress={handleCodSubmit}
              disabled={lifecyclePending || !isConnected}
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
          Enter the cash collected from {activeJob.customerName}. Expected:{' '}
          {activeJob.expectedCash != null
            ? formatMoney(activeJob.expectedCash)
            : 'not provided by POS — add a note'}.
        </Text>
        <Text style={styles.codLabel}>Amount collected</Text>
        <TextInput
          style={styles.codInput}
          value={codAmount}
          onChangeText={setCodAmount}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
        />
        <Text style={styles.codLabel}>
          Reason (required if amount differs)
        </Text>
        <TextInput
          style={[styles.codInput, styles.codReason]}
          value={codReason}
          onChangeText={setCodReason}
          placeholder="e.g. customer short-changed / tip included"
          placeholderTextColor={colors.textMuted}
        />
      </BottomSheet>

      <BottomSheet
        visible={issueSheetOpen}
        title="Request failed delivery"
        onClose={() => {
          if (!issuePending) setIssueSheetOpen(false);
        }}
        footer={
          failureSubmitted || failureOpen ? (
            <AppButton
              label="Done"
              variant="secondary"
              fullWidth
              onPress={() => setIssueSheetOpen(false)}
            />
          ) : (
            <AppButton
              label={issuePending ? 'Submitting…' : 'Submit request'}
              variant="secondary"
              fullWidth
              onPress={() => void submitFailureRequest()}
              disabled={issuePending || !issueReason}
            />
          )
        }>
        {failureSubmitted || failureOpen ? (
          <View>
            <Text style={styles.issueSuccessTitle}>
              {failure?.requestStatus === 'Pending'
                ? 'Waiting for manager decision'
                : failure?.requestStatus === 'Rejected'
                  ? 'Request rejected'
                  : 'Return in progress'}
            </Text>
            <Text style={styles.issueSuccessBody}>
              You cannot mark this order Failed yourself. A manager must approve
              return to store, then confirm receipt before cancel or requeue.
            </Text>
            <View style={styles.issueSavedCard}>
              <Text style={styles.issueSavedLabel}>Reason</Text>
              <Text style={styles.issueSavedValue}>
                {failure?.reasonLabel || failure?.reasonCode || '—'}
              </Text>
              {failure?.note ? (
                <>
                  <Text style={styles.issueSavedLabel}>Note</Text>
                  <Text style={styles.issueSavedValue}>{failure.note}</Text>
                </>
              ) : null}
              <Text style={styles.issueSavedLabel}>Request status</Text>
              <Text style={styles.issueSavedValue}>
                {failure?.requestStatus || 'Pending'}
              </Text>
              {failure?.decisionNote ? (
                <>
                  <Text style={styles.issueSavedLabel}>Decision</Text>
                  <Text style={styles.issueSavedValue}>
                    {failure.decisionNote}
                  </Text>
                </>
              ) : null}
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.codHint}>
              Submit a failure request for manager review. This does not end the
              delivery or change COD values.
            </Text>
            {DELIVERY_ISSUE_REASONS.map(option => {
              const selected = issueReason === option.code;
              return (
                <AppButton
                  key={option.code}
                  label={option.label}
                  variant={selected ? 'secondary' : 'outline'}
                  fullWidth
                  onPress={() => {
                    setIssueReason(option.code);
                    setIssueError(null);
                  }}
                  style={styles.issueReasonBtn}
                  disabled={issuePending}
                />
              );
            })}
            <Text style={styles.codLabel}>
              Note{issueReason === 'Other' ? ' (required)' : ' (optional)'}
            </Text>
            <TextInput
              style={[styles.codInput, styles.issueNoteInput]}
              value={issueNote}
              onChangeText={text => {
                setIssueNote(text);
                setIssueError(null);
              }}
              placeholder="Short details for the store"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!issuePending}
            />
            {issueError ? (
              <Text style={styles.errorText}>{issueError}</Text>
            ) : null}
          </View>
        )}
      </BottomSheet>

      <BottomSheet
        visible={reportSheetOpen}
        title="Report delivery issue"
        onClose={() => {
          if (!reportPending) setReportSheetOpen(false);
        }}
        footer={
          savedReport ? (
            <AppButton
              label="Done"
              variant="secondary"
              fullWidth
              onPress={() => setReportSheetOpen(false)}
            />
          ) : (
            <AppButton
              label={reportPending ? 'Submitting…' : 'Submit report'}
              variant="secondary"
              fullWidth
              onPress={() => void submitIssueReport()}
              disabled={reportPending || !reportReason}
            />
          )
        }>
        {savedReport ? (
          <View>
            <Text style={styles.issueSuccessTitle}>
              {(savedReport.status || '').toLowerCase() === 'closed'
                ? 'Issue closed'
                : (savedReport.status || '').toLowerCase() === 'acknowledged'
                  ? 'Staff acknowledged'
                  : 'Report submitted'}
            </Text>
            <Text style={styles.issueSuccessBody}>
              {(savedReport.status || '').toLowerCase() === 'closed'
                ? 'Staff closed this issue. Keep delivering unless they cancel the order or ask you to return.'
                : (savedReport.status || '').toLowerCase() === 'acknowledged'
                  ? 'Staff saw your report. Continue the delivery unless they contact you or cancel/reassign the order.'
                  : 'Staff can see this on the order. It does not cancel the delivery or change COD. Open this sheet again after a refresh to see if they acknowledged it.'}
            </Text>
            <View style={styles.issueSavedCard}>
              <Text style={styles.issueSavedLabel}>Reason</Text>
              <Text style={styles.issueSavedValue}>
                {savedReport.reasonLabel || savedReport.reasonCode}
              </Text>
              {savedReport.note ? (
                <>
                  <Text style={styles.issueSavedLabel}>Note</Text>
                  <Text style={styles.issueSavedValue}>{savedReport.note}</Text>
                </>
              ) : null}
              <Text style={styles.issueSavedLabel}>Status</Text>
              <Text style={styles.issueSavedValue}>
                {savedReport.statusLabel || savedReport.status || 'New'}
              </Text>
            </View>
          </View>
        ) : (
          <View>
            <Text style={styles.codHint}>
              Flag a problem for this active order. This notifies staff; it does
              not mark the order Failed or start a return.
            </Text>
            {DELIVERY_ISSUE_REASONS.map(option => {
              const selected = reportReason === option.code;
              return (
                <AppButton
                  key={option.code}
                  label={option.label}
                  variant={selected ? 'secondary' : 'outline'}
                  fullWidth
                  onPress={() => {
                    setReportReason(option.code);
                    setReportError(null);
                  }}
                  style={styles.issueReasonBtn}
                  disabled={reportPending}
                />
              );
            })}
            <Text style={styles.codLabel}>
              Note{reportReason === 'Other' ? ' (required)' : ' (optional)'}
            </Text>
            <TextInput
              style={[styles.codInput, styles.issueNoteInput]}
              value={reportNote}
              onChangeText={text => {
                setReportNote(text);
                setReportError(null);
              }}
              placeholder="Short details for the store"
              placeholderTextColor={colors.textMuted}
              multiline
              editable={!reportPending}
            />
            {reportError ? (
              <Text style={styles.errorText}>{reportError}</Text>
            ) : null}
          </View>
        )}
      </BottomSheet>

      {successVisible ? (
        <Animated.View
          style={[styles.successOverlay, { opacity: successOpacity }]}
          pointerEvents="none">
          <View style={styles.successCard}>
            <Text style={styles.successTitle}>Delivery completed</Text>
            <Text style={styles.successBody}>
              Trip finished. Settlements are managed by admin
              {successEarned > 0
                ? ` (fee shown: ${formatMoney(successEarned)})`
                : ''}
              .
            </Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  mapsAction: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  dummyBtn: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  gpsRetry: { marginBottom: spacing.md },
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
  codLabel: {
    ...typography.caption,
    marginBottom: spacing.xxs,
  },
  codInput: {
    ...typography.body,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
  codReason: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  codActions: { flexDirection: 'row', gap: spacing.sm },
  errorText: {
    ...typography.caption,
    color: colors.error,
    marginBottom: spacing.sm,
  },
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
  issueReasonBtn: { marginBottom: spacing.sm },
  issueNoteInput: { minHeight: 72, textAlignVertical: 'top' },
  failureBanner: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
  },
  failureBannerTitle: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  failureBannerBody: {
    ...typography.body,
    color: colors.textSecondary,
  },
  failureCashWarn: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
  },
  issueSuccessTitle: {
    ...typography.title,
    color: colors.success,
    marginBottom: spacing.xs,
  },
  issueSuccessBody: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  issueSavedCard: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  issueSavedLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  issueSavedValue: {
    ...typography.body,
    color: colors.textPrimary,
  },
});
