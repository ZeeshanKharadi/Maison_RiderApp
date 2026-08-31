/**
 * Rider Performance Center — view model derived from session + history.
 */

import { DeliveryHistoryItem } from './deliveryHistory';
import { MONEY_GOAL_UNIT } from '../constants/app';
import { SessionStats } from '../delivery/sessionUpdates';
import { startOfDay } from '../utils/format';

export type TrendRange = 7 | 30 | 90;

export type ScoreBand = 'excellent' | 'good' | 'needs_improvement';

export type PerformanceGoal = {
  id: string;
  title: string;
  current: number;
  target: number;
  unit: string;
};

export type Achievement = {
  id: string;
  title: string;
  icon: string;
  unlocked: boolean;
};

export type TrendPoint = {
  label: string;
  value: number;
};

export type PerformanceInsight = {
  id: string;
  tone: 'good' | 'tip' | 'warn';
  title: string;
  detail: string;
  icon: string;
};

export function computePerformanceScore(stats: SessionStats): {
  score: number;
  band: ScoreBand;
  label: string;
} {
  const score = Math.round(
    Math.min(
      100,
      stats.completionRate * 0.35 +
        stats.onTimeRate * 0.3 +
        Math.min(stats.todayRating, 5) * 8 +
        stats.acceptanceRate * 0.15,
    ),
  );

  if (score >= 90) {
    return { score, band: 'excellent', label: 'Excellent' };
  }
  if (score >= 75) {
    return { score, band: 'good', label: 'Good' };
  }
  return { score, band: 'needs_improvement', label: 'Needs Improvement' };
}

export function buildGoals(stats: SessionStats): PerformanceGoal[] {
  return [
    {
      id: 'orders',
      title: 'Deliver 20 orders today',
      current: stats.todayDeliveries,
      target: 20,
      unit: 'orders',
    },
    {
      id: 'completion',
      title: 'Complete 95% of trips',
      current: stats.completionRate,
      target: 95,
      unit: '%',
    },
    {
      id: 'earn',
      title: 'Earn Rs 10,000 this month',
      current: stats.monthlyEarnings,
      target: 10000,
      unit: MONEY_GOAL_UNIT,
    },
    {
      id: 'rating',
      title: 'Maintain 4.8 rating',
      current: stats.todayRating,
      target: 4.8,
      unit: '★',
    },
  ];
}

export function buildAchievements(stats: SessionStats): Achievement[] {
  return [
    {
      id: 'first',
      title: 'First Delivery',
      icon: 'flag-checkered',
      unlocked: stats.monthlyDeliveries >= 1,
    },
    {
      id: 'hundred',
      title: '100 Deliveries',
      icon: 'numeric-100',
      unlocked: stats.monthlyDeliveries >= 100,
    },
    {
      id: 'top',
      title: 'Top Performer',
      icon: 'trophy',
      unlocked: stats.ranking <= 15,
    },
    {
      id: 'perfect',
      title: 'Perfect Week',
      icon: 'star-circle',
      unlocked: stats.completionRate >= 97 && stats.onTimeRate >= 93,
    },
    {
      id: 'early',
      title: 'Early Bird',
      icon: 'weather-sunny',
      unlocked: stats.streak >= 5,
    },
  ];
}

export function buildTrendPoints(
  history: DeliveryHistoryItem[],
  range: TrendRange,
  now = new Date(),
): TrendPoint[] {
  const today = startOfDay(now);
  const points: TrendPoint[] = [];

  for (let i = range - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);

    const count = history.filter(h => {
      if (h.status !== 'delivered') return false;
      const t = new Date(h.deliveredAt).getTime();
      return t >= day.getTime() && t < next.getTime();
    }).length;

    // Soft mock baseline when a day has no archived trips
    const seed = ((day.getDate() * 3 + day.getMonth()) % 6) + 10;
    const value = count > 0 ? count : seed;

    let label = '';
    if (range === 7) {
      label = day.toLocaleDateString('en-US', { weekday: 'short' });
    } else if (range === 30) {
      label = i === range - 1 || i === 0 || i % 5 === 0 ? `${day.getDate()}` : '';
    } else if (i === range - 1 || i === 0 || i % 15 === 0) {
      label = day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    points.push({ label, value });
  }

  return points;
}

export function buildInsights(stats: SessionStats): PerformanceInsight[] {
  const insights: PerformanceInsight[] = [];
  const remaining = Math.max(0, 20 - stats.todayDeliveries);

  if (stats.completionRate >= 95) {
    insights.push({
      id: 'completion',
      tone: 'good',
      title: 'Great job!',
      detail: `Your completion rate is ${Math.round(stats.completionRate)}% — keep it up.`,
      icon: 'check-decagram',
    });
  }

  if (remaining > 0 && remaining <= 8) {
    insights.push({
      id: 'goal',
      tone: 'tip',
      title: "You're close to today's goal",
      detail: `${remaining} more delivery${remaining === 1 ? '' : 'ies'} to hit 20 today.`,
      icon: 'target',
    });
  } else if (remaining === 0) {
    insights.push({
      id: 'goal-done',
      tone: 'good',
      title: 'Daily order goal reached',
      detail: 'You hit 20 deliveries today. Excellent pace.',
      icon: 'trophy-outline',
    });
  }

  if (stats.onTimeRate >= 90) {
    insights.push({
      id: 'ontime',
      tone: 'good',
      title: 'On-time performance is strong',
      detail: `${Math.round(stats.onTimeRate)}% of deliveries arrived within ETA.`,
      icon: 'clock-check-outline',
    });
  } else {
    insights.push({
      id: 'late',
      tone: 'warn',
      title: 'Watch late deliveries',
      detail: `${stats.lateDeliveries} late trips this week — leave a bit earlier for pickups.`,
      icon: 'clock-alert-outline',
    });
  }

  insights.push({
    id: 'rank',
    tone: 'tip',
    title:
      stats.ranking < stats.teamAverageRank
        ? 'Ahead of team average'
        : 'Climb the ranking',
    detail: `You're #${stats.ranking}. Team average is #${stats.teamAverageRank}. Top rider is #${stats.topRiderRank}.`,
    icon: 'account-group-outline',
  });

  return insights.slice(0, 4);
}

export function todayOnTimeCount(stats: SessionStats): number {
  return Math.round((stats.onTimeRate / 100) * stats.todayDeliveries);
}
