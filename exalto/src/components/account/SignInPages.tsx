import { Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppleButton } from '@/components/account/apple-button';
import { Field, Message, PageHeader, PillButton } from '@/components/account/ui';
import { WelcomeGradient } from '@/components/account/welcome-gradient';
import { ThemedText } from '@/components/themed-text';
import { ExaltoLogo } from '@/components/ui/exalto-logo';
import { Palette, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { authErrorKey } from '@/lib/auth/errors';
import { availableProviders, type ProviderResult } from '@/lib/auth/providers';

/** Text on the welcome gradient. */
const WHITE = '#FFFFFF';

/** Figma "Welcome": Apple (iOS), Google, email, or keep going as a guest. */
export function WelcomePage({ onBack, onEmail, onGuest }: { onBack: () => void; onEmail: () => void; onGuest: () => void }) {
  const { t } = useLocale();
  const { signInApple, signInGoogle, configured } = useAuth();
  const [providers, setProviders] = useState({ apple: false, google: false });
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    availableProviders().then(setProviders).catch(() => {});
  }, []);

  async function run(which: 'apple' | 'google', fn: () => Promise<ProviderResult>) {
    setError(null);
    setBusy(which);
    try {
      await fn(); // On success the sheet moves on by itself (profile setup or settings).
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.flex}>
      {/* Whole-page wash in the brand colors, drifting slowly; static with Reduce Motion. */}
      <WelcomeGradient />
      <PageHeader onBack={onBack} backLabel={t('account.back')} color={WHITE} />
      <ScrollView contentContainerStyle={styles.welcome} bounces={false}>
        <View style={styles.logoWrap}>
          <ExaltoLogo width={96} color="#FFFFFF" />
        </View>
        <ThemedText style={styles.title}>{t('welcome.title')}</ThemedText>
        <ThemedText style={styles.body}>{t('welcome.body')}</ThemedText>
        <View style={styles.buttons}>
          {providers.apple && <AppleButton onPress={() => run('apple', signInApple)} disabled={busy !== null} />}
          {providers.google && (
            <PillButton
              kind="glass"
              label={t('welcome.google')}
              busy={busy === 'google'}
              disabled={busy !== null}
              icon={busy === 'google' ? undefined : <ThemedText style={styles.g}>G</ThemedText>}
              onPress={() => run('google', signInGoogle)}
            />
          )}
          <PillButton kind="glass" label={t('welcome.email')} icon={<Mail size={16} color={WHITE} />} onPress={onEmail} disabled={busy !== null} />
        </View>
        <Message text={!configured ? t('error.notConfigured') : error} />
        <Pressable onPress={onGuest} accessibilityRole="button" hitSlop={8} style={styles.guest}>
          <ThemedText style={[styles.link, { color: WHITE }]}>{t('welcome.guest')}</ThemedText>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Email and password, with account creation and a reset link. (The Figma draft shows a passwordless code;
 * Firebase Auth has no email-code sign-in, so this is the password fallback.) */
export function EmailPage({ onBack }: { onBack: () => void }) {
  const { t } = useLocale();
  const { signInEmail, signUpEmail, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'info' } | null>(null);

  async function submit() {
    setMessage(null);
    if (mode === 'signUp' && password.length < 8) return setMessage({ text: t('error.weakPassword'), tone: 'error' });
    setBusy(true);
    try {
      if (mode === 'signIn') await signInEmail(email, password);
      else await signUpEmail(email, password, name);
    } catch (e) {
      setMessage({ text: t(authErrorKey(e)), tone: 'error' });
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setMessage(null);
    if (!email.trim()) return setMessage({ text: t('email.resetNeedsEmail'), tone: 'info' });
    try {
      await resetPassword(email);
      setMessage({ text: t('email.resetSent', { email: email.trim() }), tone: 'info' });
    } catch (e) {
      const key = authErrorKey(e);
      // Don't reveal whether an account exists.
      setMessage(key === 'error.wrongPassword' ? { text: t('email.resetSent', { email: email.trim() }), tone: 'info' } : { text: t(key), tone: 'error' });
    }
  }

  const ready = email.trim().length > 3 && password.length > 0 && (mode === 'signIn' || name.trim().length > 0);

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader onBack={onBack} backLabel={t('account.back')} title={mode === 'signIn' ? t('email.signInTitle') : t('email.signUpTitle')} />
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        {mode === 'signUp' && (
          <Field label={t('email.name')} value={name} onChangeText={setName} autoComplete="name" textContentType="name" returnKeyType="next" />
        )}
        <Field
          label={t('email.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
        <Field
          label={t('email.password')}
          hint={mode === 'signUp' ? t('email.passwordHint') : undefined}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          returnKeyType="go"
          onSubmitEditing={() => ready && submit()}
        />
        <Message text={message?.text} tone={message?.tone} />
        <PillButton label={mode === 'signIn' ? t('email.signIn') : t('email.signUp')} onPress={submit} busy={busy} disabled={!ready} />
        {mode === 'signIn' && (
          <Pressable onPress={forgot} accessibilityRole="button" hitSlop={8} style={styles.center}>
            <ThemedText style={styles.link}>{t('email.forgot')}</ThemedText>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            setMessage(null);
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
          }}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.center}>
          <ThemedText style={styles.link}>{mode === 'signIn' ? t('email.toSignUp') : t('email.toSignIn')}</ThemedText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  welcome: { flexGrow: 1, justifyContent: 'flex-end', gap: Spacing.three, paddingHorizontal: 22, paddingBottom: Spacing.five },
  logoWrap: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  title: { color: WHITE, fontSize: 30, lineHeight: 35, fontWeight: '800', letterSpacing: -0.6 },
  body: { color: WHITE, fontSize: 15, lineHeight: 22 },
  buttons: { gap: Spacing.two },
  g: { color: WHITE, fontSize: 16, lineHeight: 20, fontWeight: '800' },
  guest: { alignItems: 'center', paddingVertical: Spacing.one },
  link: { color: Palette.cyan, fontSize: 14, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  form: { gap: Spacing.three, paddingHorizontal: 22, paddingTop: Spacing.two, paddingBottom: Spacing.five },
  center: { alignItems: 'center' },
});
