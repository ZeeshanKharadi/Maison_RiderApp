import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import {
  AppHeader,
  Badge,
  ProgressBar,
  SectionHeader,
  StatCard,
  StatusPill,
} from '../components/ui';
import { useRiderSession } from '../context/RiderSessionContext';
import { MONEY_GOAL_UNIT } from '../constants/app';
import {
  buildAchievements,
  buildGoals,
  buildInsights,
  buildTrendPoints,
  computePerformanceScore,
  todayOnTimeCount,
  TrendRange,
} from '../data/performanceCenter';
import { formatMoney, formatMoneyShort } from '../utils/format';
import {
  colors,
  elevation,
  radius,
  spacing,
  TOUCH_TARGET,
  typography,
} from '../theme';

const TREND_RANGES: { key: TrendRange; label: string }[] = [
  { key: 7, label: '7 Days' },
  { key: 30, label: '30 Days' },
  { key: 90, label: '90 Days' },
];

/**
 * Rider Performance Center — motivational, not an analytics dump.
 * All metrics derive from RiderSessionContext (updates on delivery complete).
 */
export default function PerformanceScreen() {
  const navigation = useNavigation();
  const { stats, history } = useRiderSession();
  const [trendRange, setTrendRange] = useState<TrendRange>(7);

  const score = useMemo(() => computePerformanceScore(stats), [stats]);
  const goals = useMemo(() => buildGoals(stats), [stats]);
  const achievements = useMemo(() => buildAchievements(stats), [stats]);
  const insights = useMemo(() => buildInsights(stats), [stats]);
  const trend = useMemo(
    () => buildTrendPoints(history, trendRange),
    [history, trendRange],
  );
  const maxTrend = useMemo(
    () => Math.max(...trend.map(t => t.value), 1),
    [trend],
  );
  const onTimeToday = useMemo(() => todayOnTimeCount(stats), [stats]);

  const scoreTone =
    score.band === 'excellent'
      ? 'success'
      : score.band === 'good'
        ? 'info'
        : 'warning';

  return (
    <View style={styles.container}>
      <AppHeader
        title="Performance"
        showBack
        onBackPress={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        {/* Performance Score */}
        <View
          style={styles.scoreCard}
          accessibilityRole="summary"
          accessibilityLabel={`Performance score ${score.score} out of 100, ${score.label}`}>
          <View style={styles.scoreRing}>
            <Text style={styles.scoreValue}>{score.score}</Text>
            <Text style={styles.scoreOf}>/ 100</Text>
          </View>
          <View style={styles.scoreMeta}>
            <Text style={styles.scoreTitle}>Performance score</Text>
            <StatusPill label={score.label} tone={scoreTone} />
            <Text style={styles.scoreHint}>
              Based on completion, on-time rate, rating, and acceptance.
            </Text>
          </View>
        </View>

        {/* Today */}
        <SectionHeader title="Today" />
        <View style={styles.statsRow}>
          <StatCard
            icon="package-variant"
            label="Orders"
            value={String(stats.todayDeliveries)}
          />
          <StatCard
            icon="cash"
            label="Earnings"
            value={formatMoney(stats.todayEarnings)}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="star"
            label="Avg rating"
            value={stats.todayRating.toFixed(1)}
            iconColor={colors.star}
          />
          <StatCard
            icon="clock-check-outline"
            label="On-time"
            value={String(onTimeToday)}
            hint={`${Math.round(stats.onTimeRate)}% rate`}
            iconColor={colors.success}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="timer-outline"
            label="Hours worked"
            value={`${stats.hoursWorked}h`}
            iconColor={colors.info}
          />
          <View style={{ flex: 1 }} />
        </View>

        {/* Weekly */}
        <SectionHeader title="This week" />
        <View style={styles.statsRow}>
          <StatCard
            icon="truck-delivery"
            label="Deliveries"
            value={String(stats.weeklyDeliveries)}
          />
          <StatCard
            icon="wallet"
            label="Earnings"
            value={formatMoneyShort(stats.weeklyEarnings)}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="thumb-up-outline"
            label="Acceptance"
            value={`${Math.round(stats.acceptanceRate)}%`}
          />
          <StatCard
            icon="check-circle-outline"
            label="Completion"
            value={`${Math.round(stats.completionRate)}%`}
            iconColor={colors.success}
          />
        </View>
        <View style={styles.lateCard}>
          <Icon name="clock-alert-outline" size={20} color={colors.warning} />
          <Text style={styles.lateText}>
            Late deliveries this week:{' '}
            <Text style={styles.lateStrong}>{stats.lateDeliveries}</Text>
          </Text>
        </View>

        {/* Monthly */}
        <SectionHeader title="This month" />
        <View style={styles.statsRow}>
          <StatCard
            icon="calendar-month"
            label="Deliveries"
            value={String(stats.monthlyDeliveries)}
          />
          <StatCard
            icon="cash-multiple"
            label="Earnings"
            value={formatMoneyShort(stats.monthlyEarnings)}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="star-outline"
            label="Avg rating"
            value={stats.todayRating.toFixed(1)}
            iconColor={colors.star}
          />
          <StatCard
            icon="progress-check"
            label="Completion"
            value={`${Math.round(stats.completionRate)}%`}
          />
        </View>

        {/* Goals */}
        <SectionHeader title="Goals" />
        <View style={styles.card}>
          {goals.map(goal => {
            const pct = Math.min(100, (goal.current / goal.target) * 100);
            const displayCurrent =
              goal.unit === MONEY_GOAL_UNIT
                ? formatMoneyShort(goal.current)
                : goal.unit === '%'
                  ? `${Math.round(goal.current)}%`
                  : goal.unit === '★'
                    ? goal.current.toFixed(1)
                    : String(Math.round(goal.current));
            const displayTarget =
              goal.unit === MONEY_GOAL_UNIT
                ? formatMoneyShort(goal.target)
                : goal.unit === '%'
                  ? `${goal.target}%`
                  : goal.unit === '★'
                    ? goal.target.toFixed(1)
                    : String(goal.target);
            return (
              <View key={goal.id} style={styles.goalRow}>
                <View style={styles.goalHeader}>
                  <Text style={styles.goalTitle}>{goal.title}</Text>
                  <Text style={styles.goalMeta}>
                    {displayCurrent} / {displayTarget}
                  </Text>
                </View>
                <ProgressBar
                  value={goal.current}
                  max={goal.target}
                  color={pct >= 100 ? colors.success : colors.primaryDark}
                  accessibilityLabel={`${goal.title}: ${Math.round(pct)} percent`}
                />
              </View>
            );
          })}
        </View>

        {/* Achievements */}
        <SectionHeader title="Achievements" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.achieveRow}>
          {achievements.map(a => (
            <View
              key={a.id}
              style={[styles.achieveCard, !a.unlocked && styles.achieveLocked]}
              accessibilityLabel={`${a.title}${a.unlocked ? ', unlocked' : ', locked'}`}>
              <View
                style={[
                  styles.achieveIcon,
                  !a.unlocked && styles.achieveIconLocked,
                ]}>
                <Icon
                  name={a.icon}
                  size={22}
                  color={a.unlocked ? colors.primaryDark : colors.textMuted}
                />
              </View>
              <Text
                style={[
                  styles.achieveTitle,
                  !a.unlocked && styles.achieveTitleLocked,
                ]}>
                {a.title}
              </Text>
              {a.unlocked ? (
                <Badge label="Unlocked" tone="success" />
              ) : (
                <Badge label="Locked" tone="neutral" />
              )}
            </View>
          ))}
        </ScrollView>

        {/* Ranking */}
        <SectionHeader title="Ranking" />
        <View style={styles.rankCard}>
          <View style={styles.rankMain}>
            <Text style={styles.rankLabel}>Your rank</Text>
            <Text style={styles.rankValue}>#{stats.ranking}</Text>
          </View>
          <View style={styles.rankDivider} />
          <View style={styles.rankSide}>
            <Text style={styles.rankSideLabel}>Team average</Text>
            <Text style={styles.rankSideValue}>#{stats.teamAverageRank}</Text>
            <Text style={styles.rankDiff}>
              {stats.ranking < stats.teamAverageRank
                ? `${stats.teamAverageRank - stats.ranking} places ahead`
                : `${stats.ranking - stats.teamAverageRank} places behind`}
            </Text>
          </View>
          <View style={styles.rankDivider} />
          <View style={styles.rankSide}>
            <Text style={styles.rankSideLabel}>Top rider</Text>
            <Text style={styles.rankSideValue}>#{stats.topRiderRank}</Text>
            <Text style={styles.rankDiff}>
              {stats.ranking - stats.topRiderRank} to catch
            </Text>
          </View>
        </View>

        {/* Trend — single line chart */}
        <SectionHeader title="Delivery trend" />
        <View style={styles.trendTabs}>
          {TREND_RANGES.map(r => {
            const active = trendRange === r.key;
            return (
              <TouchableOpacity
                key={r.key}
                style={[styles.trendTab, active && styles.trendTabActive]}
                onPress={() => setTrendRange(r.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show ${r.label} trend`}>
                <Text
                  style={[
                    styles.trendTabText,
                    active && styles.trendTabTextActive,
                  ]}>
                  {r.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <View
          style={styles.chartCard}
          accessibilityLabel={`Delivery trend for last ${trendRange} days`}>
          <View style={styles.lineChart}>
            {trend.map((point, index) => {
              const h = Math.max(4, (point.value / maxTrend) * 100);
              return (
                <View key={`${point.label}-${index}`} style={styles.lineCol}>
                  <View style={styles.lineBarWrap}>
                    <View style={[styles.lineBar, { height: h }]} />
                  </View>
                  {point.label ? (
                    <Text style={styles.lineLabel} numberOfLines={1}>
                      {point.label}
                    </Text>
                  ) : (
                    <View style={styles.lineLabelSpacer} />
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.chartCaption}>Orders delivered per day</Text>
        </View>

        {/* Insights */}
        <SectionHeader title="Insights" />
        {insights.map(insight => {
          const toneColor =
            insight.tone === 'good'
              ? colors.success
              : insight.tone === 'warn'
                ? colors.warning
                : colors.info;
          return (
            <View key={insight.id} style={styles.insightRow}>
              <View
                style={[
                  styles.insightIcon,
                  { backgroundColor: `${toneColor}18` },
                ]}>
                <Icon name={insight.icon} size={20} color={toneColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.insightTitle}>{insight.title}</Text>
                <Text style={styles.insightDetail}>{insight.detail}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxxl },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryDark,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.md,
  },
  scoreRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreValue: {
    ...typography.heading,
    color: colors.textOnPrimary,
    fontSize: 28,
  },
  scoreOf: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
  },
  scoreMeta: { flex: 1, gap: spacing.xs },
  scoreTitle: {
    ...typography.title,
    color: colors.textOnPrimary,
  },
  scoreHint: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.75)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  lateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    minHeight: TOUCH_TARGET,
  },
  lateText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
  },
  lateStrong: {
    ...typography.bodyStrong,
    color: colors.warning,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  goalRow: { marginBottom: spacing.md },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  goalTitle: {
    ...typography.bodyStrong,
    flex: 1,
  },
  goalMeta: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  achieveRow: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  achieveCard: {
    width: 120,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
    ...elevation.small,
  },
  achieveLocked: { opacity: 0.7 },
  achieveIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  achieveIconLocked: { backgroundColor: colors.background },
  achieveTitle: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  achieveTitleLocked: { color: colors.textMuted },
  rankCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  rankMain: {
    flex: 1.1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankLabel: { ...typography.caption },
  rankValue: {
    ...typography.heading,
    color: colors.primaryDark,
    marginTop: 2,
  },
  rankSide: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.xxs,
  },
  rankSideLabel: {
    ...typography.caption,
    textAlign: 'center',
  },
  rankSideValue: {
    ...typography.title,
    marginTop: 2,
  },
  rankDiff: {
    ...typography.caption,
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
  },
  rankDivider: {
    width: 1,
    backgroundColor: colors.border,
  },
  trendTabs: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    marginBottom: spacing.sm,
  },
  trendTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
    minHeight: TOUCH_TARGET - 4,
    justifyContent: 'center',
  },
  trendTabActive: {
    backgroundColor: colors.primaryDark,
  },
  trendTabText: {
    ...typography.bodyStrong,
    fontSize: 13,
    color: colors.textSecondary,
  },
  trendTabTextActive: {
    color: colors.textOnPrimary,
  },
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    ...elevation.small,
  },
  lineChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 120,
    gap: 2,
  },
  lineCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  lineBarWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  lineBar: {
    width: '70%',
    maxWidth: 14,
    backgroundColor: colors.primaryDark,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  lineLabel: {
    ...typography.caption,
    fontSize: 9,
    marginTop: 4,
  },
  lineLabelSpacer: { height: 14 },
  chartCaption: {
    ...typography.caption,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  insightRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.small,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightTitle: {
    ...typography.bodyStrong,
    marginBottom: 2,
  },
  insightDetail: {
    ...typography.caption,
    color: colors.textSecondary,
  },
});
