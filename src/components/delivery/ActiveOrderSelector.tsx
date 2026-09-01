import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ActiveDeliveryJob } from '../../delivery/types';
import { getStateConfig } from '../../delivery/stateMachine';
import { colors, radius, spacing, typography } from '../../theme';

type Props = {
  jobs: ActiveDeliveryJob[];
  selectedJobId: string | null;
  onSelect: (jobId: string) => void;
};

export default function ActiveOrderSelector({
  jobs,
  selectedJobId,
  onSelect,
}: Props) {
  if (jobs.length <= 1) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Active orders</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {jobs.map(job => {
          const selected = job.id === selectedJobId;
          const pill = getStateConfig(job.state).pillLabel;
          return (
            <TouchableOpacity
              key={job.id}
              style={[styles.chip, selected && styles.chipSelected]}
              onPress={() => onSelect(job.id)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`Order ${job.id}, ${pill}`}>
              <Text style={[styles.chipId, selected && styles.chipIdSelected]}>
                {job.id}
              </Text>
              <Text style={[styles.chipState, selected && styles.chipStateSelected]}>
                {pill}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  label: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xxs,
  },
  row: {
    gap: spacing.xs,
    paddingRight: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    minWidth: 96,
  },
  chipSelected: {
    borderColor: colors.primaryDark,
    backgroundColor: colors.primarySoft,
  },
  chipId: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  chipIdSelected: {
    color: colors.primaryDark,
  },
  chipState: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  chipStateSelected: {
    color: colors.primaryDark,
  },
});
