import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radius } from '../../theme';

type Props = {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

/** Shared horizontal progress — used by goals and performance. */
export default function ProgressBar({
  value,
  max = 100,
  color = colors.primaryDark,
  height = 8,
  style,
  accessibilityLabel,
}: Props) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(max, 0.0001)) * 100));
  return (
    <View
      style={[styles.track, { height }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max, now: value }}>
      <View
        style={[
          styles.fill,
          { width: `${pct}%`, backgroundColor: color, height },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.disabled,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: radius.full,
  },
});
