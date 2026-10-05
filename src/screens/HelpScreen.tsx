import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import {
  AppHeader,
  AppButton,
  SectionHeader,
} from '../components/ui';
import { MainStackParamList } from '../navigation/MainNavigator';
import { APP_NAME_SHORT } from '../constants/app';
import { useRiderSession } from '../context/RiderSessionContext';
import {
  buildSupportMailtoUrl,
  resolveSupportContact,
} from '../support/supportContact';
import { colors, elevation, radius, spacing, typography } from '../theme';
import { TOUCH_TARGET } from '../theme/spacing';

type HelpSection =
  | 'faq'
  | 'support'
  | 'report'
  | 'feedback'
  | 'privacy'
  | 'terms';

const FAQ = [
  {
    q: 'How do I go online?',
    a: 'Open Dashboard and toggle Online. You must be online to receive new orders.',
  },
  {
    q: 'When do I get paid?',
    a: 'Settlements and payouts are managed by your administrator. In-app wallet withdraw is not available.',
  },
  {
    q: 'How do I update documents?',
    a: 'Documents are managed by your administrator. Contact support if something needs updating.',
  },
];

const SECTIONS: {
  id: HelpSection;
  icon: string;
  title: string;
  blurb: string;
}[] = [
  {
    id: 'faq',
    icon: 'frequently-asked-questions',
    title: 'FAQ',
    blurb: 'Common rider questions',
  },
  {
    id: 'support',
    icon: 'headset',
    title: 'Contact Support',
    blurb: 'Call or email our support team',
  },
  {
    id: 'report',
    icon: 'alert-circle-outline',
    title: 'Report a delivery issue',
    blurb: 'Flag a problem on an active order',
  },
  {
    id: 'feedback',
    icon: 'message-text-outline',
    title: 'Feedback',
    blurb: 'Email general feedback to support',
  },
  {
    id: 'privacy',
    icon: 'shield-outline',
    title: 'Privacy (summary)',
    blurb: 'Draft summary — full policy not in this build',
  },
  {
    id: 'terms',
    icon: 'file-document-outline',
    title: 'Terms (summary)',
    blurb: 'Draft summary — full terms not in this build',
  },
];

const FEEDBACK_SUBJECT = `${APP_NAME_SHORT} — Rider feedback`;

export default function HelpScreen() {
  const navigation =
    useNavigation<StackNavigationProp<MainStackParamList, 'Help'>>();
  const route = useRoute<RouteProp<MainStackParamList, 'Help'>>();
  const { activeJob } = useRiderSession();
  const [active, setActive] = useState<HelpSection | null>(
    route.params?.section ?? null,
  );

  const supportContact = useMemo(() => resolveSupportContact(), []);

  const openSupportEmail = async (opts?: { subject?: string }) => {
    if (supportContact.kind !== 'available' || !supportContact.email) {
      Alert.alert(
        'Email unavailable',
        'Support email is not configured in this app build.',
      );
      return;
    }
    const url = opts?.subject
      ? buildSupportMailtoUrl(supportContact.email.address, {
          subject: opts.subject,
        })
      : supportContact.email.mailtoUrl;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Unable to open email',
        `Could not launch your mail app. Write to ${supportContact.email.address} from any email client.`,
      );
    }
  };

  const openSupportPhone = async () => {
    if (supportContact.kind !== 'available' || !supportContact.phone) return;
    try {
      await Linking.openURL(supportContact.phone.telUrl);
    } catch {
      Alert.alert(
        'Unable to place call',
        `Could not launch the phone app. Call ${supportContact.phone.display} directly.`,
      );
    }
  };

  const openReportDeliveryIssue = () => {
    if (!activeJob) {
      Alert.alert(
        'Active order required',
        'Reporting a delivery issue needs an active order. Accept a delivery first, then use Report issue from Active Delivery or Help.',
      );
      return;
    }
    navigation.navigate('ActiveDelivery', { openReportIssue: true });
  };

  const openGeneralFeedback = () => {
    void openSupportEmail({ subject: FEEDBACK_SUBJECT });
  };

  const onSelectSection = (id: HelpSection) => {
    if (id === 'report') {
      openReportDeliveryIssue();
      return;
    }
    if (id === 'feedback') {
      openGeneralFeedback();
      return;
    }
    setActive(id);
  };

  useEffect(() => {
    const section = route.params?.section;
    if (!section) return;
    if (section === 'report') {
      openReportDeliveryIssue();
      return;
    }
    if (section === 'feedback') {
      openGeneralFeedback();
      return;
    }
    setActive(section);
    // Intentionally only react to deep-link section changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.section]);

  useEffect(() => {
    const onBack = () => {
      if (active) {
        setActive(null);
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, [active]);

  const title = useMemo(() => {
    if (!active) return 'Help';
    return SECTIONS.find(s => s.id === active)?.title ?? 'Help';
  }, [active]);

  return (
    <View style={styles.container}>
      <AppHeader
        title={title}
        showBack
        onBackPress={() => {
          if (active) setActive(null);
          else navigation.goBack();
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {!active ? (
          <>
            <SectionHeader title="How can we help?" />
            {SECTIONS.map(s => (
              <TouchableOpacity
                key={s.id}
                style={styles.card}
                onPress={() => onSelectSection(s.id)}
                accessibilityRole="button"
                accessibilityLabel={s.title}>
                <Icon name={s.icon} size={24} color={colors.primaryDark} />
                <View style={styles.cardText}>
                  <Text style={styles.cardTitle}>{s.title}</Text>
                  <Text style={styles.cardBlurb}>{s.blurb}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </>
        ) : null}

        {active === 'faq' ? (
          <>
            {FAQ.map(item => (
              <View key={item.q} style={styles.faqCard}>
                <Text style={styles.faqQ}>{item.q}</Text>
                <Text style={styles.faqA}>{item.a}</Text>
              </View>
            ))}
          </>
        ) : null}

        {active === 'support' ? (
          <View style={styles.block}>
            {supportContact.kind === 'available' ? (
              <>
                <Text style={styles.body}>
                  Reach support by phone or email. In-app chat is not available
                  in this build.
                  {supportContact.phone
                    ? `\nPhone: ${supportContact.phone.display}`
                    : ''}
                  {supportContact.email
                    ? `\nEmail: ${supportContact.email.address}`
                    : ''}
                </Text>
                {supportContact.phone ? (
                  <AppButton
                    label="Call support"
                    icon="phone"
                    fullWidth
                    onPress={() => void openSupportPhone()}
                    style={styles.supportBtn}
                  />
                ) : null}
                {supportContact.email ? (
                  <AppButton
                    label="Email support"
                    icon="email-outline"
                    fullWidth
                    variant="outline"
                    onPress={() => void openSupportEmail()}
                  />
                ) : null}
              </>
            ) : (
              <Text style={styles.body}>
                Support contact is not configured in this app build. Ask your
                administrator to provide a support email or phone number (and
                optional published hours) before this action can be enabled.
              </Text>
            )}
          </View>
        ) : null}

        {active === 'privacy' ? (
          <View style={styles.block}>
            <Text style={styles.body}>
              We use your account details to operate deliveries, payments, and
              support. Profile preferences are stored on your device. Full legal
              policy text will ship with the production release.
            </Text>
          </View>
        ) : null}

        {active === 'terms' ? (
          <View style={styles.block}>
            <Text style={styles.body}>
              {APP_NAME_SHORT} Terms: Follow delivery guidelines, handle COD
              carefully, and treat customers respectfully. Complete legal terms
              will be provided before public launch.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    minHeight: TOUCH_TARGET + 12,
    ...elevation.small,
  },
  cardText: { flex: 1 },
  cardTitle: { ...typography.bodyStrong },
  cardBlurb: { ...typography.caption, marginTop: 2 },
  faqCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...elevation.small,
  },
  faqQ: { ...typography.bodyStrong, marginBottom: spacing.xs },
  faqA: { ...typography.body, color: colors.textSecondary },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    ...elevation.small,
  },
  body: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  supportBtn: {
    marginBottom: spacing.sm,
  },
});
