import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, TOUCH_TARGET, typography } from '../../theme';

type AppHeaderProps = {
  title: string;
  showMenu?: boolean;
  onMenuPress?: () => void;
  showBack?: boolean;
  onBackPress?: () => void;
  rightIcon?: string;
  onRightPress?: () => void;
  /** Screen-reader label for the right action (defaults to a friendly guess). */
  rightAccessibilityLabel?: string;
  rightBadge?: boolean;
  style?: ViewStyle;
};

/**
 * Shared screen header — menu from every primary screen, back for stack screens.
 */
export default function AppHeader({
  title,
  showMenu,
  onMenuPress,
  showBack,
  onBackPress,
  rightIcon,
  onRightPress,
  rightAccessibilityLabel,
  rightBadge,
  style,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const rightLabel =
    rightAccessibilityLabel ||
    (rightIcon === 'pencil-outline'
      ? 'Edit'
      : rightIcon === 'check-all'
        ? 'Mark all as read'
        : rightIcon === 'cog-outline'
          ? 'Settings'
          : 'More options');

  return (
    <View
      style={[
        styles.header,
        { paddingTop: Math.max(insets.top, spacing.sm) },
        style,
      ]}>
      <View style={styles.side}>
        {showBack ? (
          <TouchableOpacity
            onPress={onBackPress}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="arrow-left" size={24} color={colors.primaryDark} />
          </TouchableOpacity>
        ) : showMenu ? (
          <TouchableOpacity
            onPress={onMenuPress}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name="menu" size={26} color={colors.primaryDark} />
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>

      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>

      <View style={[styles.side, styles.sideRight]}>
        {rightIcon ? (
          <TouchableOpacity
            onPress={onRightPress}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel={rightLabel}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Icon name={rightIcon} size={24} color={colors.primaryDark} />
            {rightBadge ? <View style={styles.badge} /> : null}
          </TouchableOpacity>
        ) : (
          <View style={styles.iconBtn} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  side: {
    width: TOUCH_TARGET,
    alignItems: 'flex-start',
  },
  sideRight: {
    alignItems: 'flex-end',
  },
  iconBtn: {
    width: TOUCH_TARGET,
    height: TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.title,
    color: colors.primaryDark,
    flex: 1,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
});
