import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  BackHandler,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import {
  AppHeader,
  AppButton,
  SectionHeader,
} from '../components/ui';
import { MainStackParamList } from '../navigation/MainNavigator';
import { APP_NAME_SHORT, APP_SUPPORT_EMAIL } from '../constants/app';
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
    a: 'Earnings are added to your wallet after each completed delivery. You can withdraw from Wallet anytime.',
  },
  {
    q: 'How do I update documents?',
    a: 'Open Profile → Documents to review status and expiry. Contact support if a document needs re-verification.',
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
    blurb: 'Chat or email our team',
  },
  {
    id: 'report',
    icon: 'alert-circle-outline',
    title: 'Report Issue',
    blurb: 'Something went wrong?',
  },
  {
    id: 'feedback',
    icon: 'message-text-outline',
    title: 'Feedback',
    blurb: 'Tell us what to improve',
  },
  {
    id: 'privacy',
    icon: 'shield-outline',
    title: 'Privacy Policy',
    blurb: 'How we handle your data',
  },
  {
    id: 'terms',
    icon: 'file-document-outline',
    title: 'Terms',
    blurb: 'Rider agreement',
  },
];

export default function HelpScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<MainStackParamList, 'Help'>>();
  const [active, setActive] = useState<HelpSection | null>(
    route.params?.section ?? null,
  );
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (route.params?.section) {
      setActive(route.params.section);
    }
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

  const submitForm = (kind: string) => {
    Alert.alert('Submitted', `${kind} received. Thank you!`);
    setMessage('');
    setActive(null);
  };

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
                onPress={() => setActive(s.id)}
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
            <Text style={styles.body}>
              Support hours: 8:00 AM – 10:00 PM. Reach us at
              {APP_SUPPORT_EMAIL} or start an in-app chat.
            </Text>
            <AppButton
              label="Start chat"
              icon="chat-outline"
              fullWidth
              onPress={() =>
                Alert.alert('Support', 'Connecting you with support…')
              }
            />
          </View>
        ) : null}

        {active === 'report' || active === 'feedback' ? (
          <View style={styles.block}>
            <Text style={styles.label}>
              {active === 'report' ? 'Describe the issue' : 'Your feedback'}
            </Text>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              multiline
              placeholder="Type here…"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={
                active === 'report' ? 'Issue description' : 'Feedback'
              }
            />
            <AppButton
              label="Submit"
              fullWidth
              disabled={!message.trim()}
              onPress={() =>
                submitForm(active === 'report' ? 'Issue report' : 'Feedback')
              }
            />
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
  label: { ...typography.caption, marginBottom: spacing.xs },
  input: {
    ...typography.body,
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    textAlignVertical: 'top',
    color: colors.textPrimary,
    marginBottom: spacing.md,
    backgroundColor: colors.background,
  },
});
