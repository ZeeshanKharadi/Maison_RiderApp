import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import BottomSheet, { FilterChip, SheetActions } from './BottomSheet';
import {
  DEFAULT_HISTORY_FILTERS,
  HistoryFilters,
} from '../../data/historyQuery';
import { colors, spacing, typography } from '../../theme';

type Props = {
  visible: boolean;
  draft: HistoryFilters;
  onChangeDraft: (next: HistoryFilters) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
};

export default function HistoryFilterSheet({
  visible,
  draft,
  onChangeDraft,
  onClose,
  onApply,
  onReset,
}: Props) {
  return (
    <BottomSheet
      visible={visible}
      title="Filters & sort"
      onClose={onClose}
      footer={<SheetActions onReset={onReset} onApply={onApply} />}>
      <Text style={styles.section}>Date range</Text>
      <View style={styles.chipWrap}>
        {(
          [
            { label: 'All', value: 'all' as const },
            { label: 'Today', value: 'today' as const },
            { label: 'Yesterday', value: 'yesterday' as const },
            { label: 'Last 7 days', value: 'last7' as const },
            { label: 'This month', value: 'month' as const },
            { label: 'Custom', value: 'custom' as const },
          ] as const
        ).map(opt => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            selected={draft.dateRange === opt.value}
            onPress={() => {
              if (opt.value === 'custom') {
                Alert.alert(
                  'Custom date',
                  'Date picker will connect in a later phase. Showing all dates for now.',
                );
              }
              onChangeDraft({ ...draft, dateRange: opt.value });
            }}
          />
        ))}
      </View>

      <Text style={styles.section}>Payment</Text>
      <View style={styles.chipWrap}>
        {(
          [
            { label: 'All', value: 'all' as const },
            { label: 'COD', value: 'cod' as const },
            { label: 'Card', value: 'card' as const },
            { label: 'Cash', value: 'cash' as const },
            { label: 'Wallet', value: 'wallet' as const },
          ] as const
        ).map(opt => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            selected={draft.payment === opt.value}
            onPress={() => onChangeDraft({ ...draft, payment: opt.value })}
          />
        ))}
      </View>

      <Text style={styles.section}>Flags</Text>
      <View style={styles.chipWrap}>
        <FilterChip
          label="Express"
          selected={draft.expressOnly}
          onPress={() =>
            onChangeDraft({ ...draft, expressOnly: !draft.expressOnly })
          }
        />
        <FilterChip
          label="Priority"
          selected={draft.priorityOnly}
          onPress={() =>
            onChangeDraft({ ...draft, priorityOnly: !draft.priorityOnly })
          }
        />
      </View>

      <Text style={styles.section}>Status</Text>
      <View style={styles.chipWrap}>
        {(
          [
            { label: 'All', value: 'all' as const },
            { label: 'Completed', value: 'completed' as const },
            { label: 'Cancelled', value: 'cancelled' as const },
          ] as const
        ).map(opt => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            selected={draft.status === opt.value}
            onPress={() => onChangeDraft({ ...draft, status: opt.value })}
          />
        ))}
      </View>

      <Text style={styles.section}>Sort by</Text>
      <View style={styles.chipWrap}>
        {(
          [
            { label: 'Newest', value: 'newest' as const },
            { label: 'Oldest', value: 'oldest' as const },
            { label: 'Highest amount', value: 'highest_amount' as const },
            { label: 'Lowest amount', value: 'lowest_amount' as const },
            { label: 'Longest distance', value: 'longest_distance' as const },
            { label: 'Shortest distance', value: 'shortest_distance' as const },
          ] as const
        ).map(opt => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            selected={draft.sort === opt.value}
            onPress={() => onChangeDraft({ ...draft, sort: opt.value })}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

export { DEFAULT_HISTORY_FILTERS };

const styles = StyleSheet.create({
  section: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.xs,
  },
});
