import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import BottomSheet, { FilterChip, SheetActions } from './BottomSheet';
import { REJECT_REASONS, RejectReason } from '../../data/orders';
import { colors, spacing, typography } from '../../theme';
import AppButton from './AppButton';

type RejectSheetProps = {
  visible: boolean;
  restaurant?: string;
  onClose: () => void;
  onConfirm: (reason: RejectReason) => void;
};

export function RejectReasonSheet({
  visible,
  restaurant,
  onClose,
  onConfirm,
}: RejectSheetProps) {
  const [reason, setReason] = useState<RejectReason | null>(null);

  const handleClose = () => {
    setReason(null);
    onClose();
  };

  return (
    <BottomSheet
      visible={visible}
      title="Reject order"
      onClose={handleClose}
      footer={
        <View style={styles.footerCol}>
          <AppButton
            label="Confirm reject"
            variant="danger"
            fullWidth
            disabled={!reason}
            onPress={() => {
              if (!reason) return;
              onConfirm(reason);
              setReason(null);
            }}
          />
          <AppButton
            label="Cancel"
            variant="ghost"
            fullWidth
            onPress={handleClose}
            style={{ marginTop: spacing.xs }}
          />
        </View>
      }>
      <Text style={styles.hint}>
        {restaurant
          ? `Why are you rejecting ${restaurant}?`
          : 'Select a reason'}
      </Text>
      <View style={styles.chipWrap}>
        {REJECT_REASONS.map(r => (
          <FilterChip
            key={r}
            label={r}
            selected={reason === r}
            onPress={() => setReason(r)}
          />
        ))}
      </View>
    </BottomSheet>
  );
}

type FilterSheetProps = {
  visible: boolean;
  draft: import('../../data/orders').OrderFilters;
  onChangeDraft: (next: import('../../data/orders').OrderFilters) => void;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
};

export function OrderFilterSheet({
  visible,
  draft,
  onChangeDraft,
  onClose,
  onApply,
  onReset,
}: FilterSheetProps) {
  return (
    <BottomSheet
      visible={visible}
      title="Filters & sort"
      onClose={onClose}
      footer={<SheetActions onReset={onReset} onApply={onApply} />}>
      <Text style={styles.section}>Distance</Text>
      <View style={styles.chipWrap}>
        {(
          [
            { label: 'Any', value: null },
            { label: 'Under 1 mi', value: 1 },
            { label: 'Under 2 mi', value: 2 },
            { label: 'Under 3 mi', value: 3 },
          ] as const
        ).map(opt => (
          <FilterChip
            key={String(opt.value)}
            label={opt.label}
            selected={draft.maxDistance === opt.value}
            onPress={() =>
              onChangeDraft({ ...draft, maxDistance: opt.value })
            }
          />
        ))}
      </View>

      <Text style={styles.section}>Payment</Text>
      <View style={styles.chipWrap}>
        {(
          [
            { label: 'All', value: 'all' as const },
            { label: 'Card', value: 'card' as const },
            { label: 'Cash', value: 'cash' as const },
            { label: 'Wallet', value: 'wallet' as const },
          ] as const
        ).map(opt => (
          <FilterChip
            key={opt.value}
            label={opt.label}
            selected={draft.paymentMethod === opt.value}
            onPress={() =>
              onChangeDraft({ ...draft, paymentMethod: opt.value })
            }
          />
        ))}
      </View>

      <Text style={styles.section}>Flags</Text>
      <View style={styles.chipWrap}>
        <FilterChip
          label="COD"
          selected={draft.codOnly}
          onPress={() => onChangeDraft({ ...draft, codOnly: !draft.codOnly })}
        />
        <FilterChip
          label="Priority"
          selected={draft.priorityOnly}
          onPress={() =>
            onChangeDraft({ ...draft, priorityOnly: !draft.priorityOnly })
          }
        />
        <FilterChip
          label="Express"
          selected={draft.expressOnly}
          onPress={() =>
            onChangeDraft({ ...draft, expressOnly: !draft.expressOnly })
          }
        />
        <FilterChip
          label="Fragile"
          selected={draft.fragileOnly}
          onPress={() =>
            onChangeDraft({ ...draft, fragileOnly: !draft.fragileOnly })
          }
        />
      </View>

      <Text style={styles.section}>Sort by</Text>
      <View style={styles.chipWrap}>
        {(
          [
            { label: 'Latest', value: 'latest' as const },
            { label: 'Nearest', value: 'nearest' as const },
            { label: 'Highest fee', value: 'highest_fee' as const },
            { label: 'Shortest ETA', value: 'shortest_eta' as const },
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

const styles = StyleSheet.create({
  hint: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
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
  footerCol: {
    gap: 0,
  },
});
