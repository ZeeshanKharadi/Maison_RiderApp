import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  formatDistanceToManeuver,
  type ManeuverGuidance,
} from '../../routing/routeManeuvers';
import { colors, radius, spacing, typography } from '../../theme';

type Props = {
  guidance: ManeuverGuidance | null;
};

/**
 * Compact top banner: maneuver icon, instruction, distance, optional road name.
 * When paused, shows only a neutral pause message (no turn distance / road).
 */
export default function TurnInstructionBanner({ guidance }: Props) {
  if (!guidance) return null;

  const paused = guidance.status === 'paused';
  const showDistance =
    guidance.status === 'active' &&
    guidance.distanceToManeuverM != null;
  const showRoad =
    !paused &&
    guidance.status !== 'unavailable' &&
    !!guidance.roadName;

  return (
    <View style={styles.banner} pointerEvents="none">
      <View style={[styles.iconWrap, paused && styles.iconWrapPaused]}>
        <Icon
          name={guidance.icon}
          size={28}
          color={paused ? colors.textSecondary : colors.primary}
        />
      </View>
      <View style={styles.textCol}>
        <Text
          style={[styles.instruction, paused && styles.instructionPaused]}
          numberOfLines={2}>
          {guidance.instruction}
        </Text>
        {showRoad ? (
          <Text style={styles.road} numberOfLines={1}>
            {guidance.roadName}
          </Text>
        ) : null}
      </View>
      {showDistance ? (
        <Text style={styles.distance}>
          {formatDistanceToManeuver(guidance.distanceToManeuverM!)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    elevation: 3,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapPaused: {
    backgroundColor: colors.background,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  instruction: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  instructionPaused: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  road: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  distance: {
    ...typography.bodyStrong,
    color: colors.primary,
    fontWeight: '700',
    marginLeft: spacing.xs,
  },
});
