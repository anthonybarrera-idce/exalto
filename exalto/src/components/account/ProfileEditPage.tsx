import { Check, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountColors, Avatar, Field, Message, PageHeader, PillButton } from '@/components/account/ui';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { type Language, useLocale } from '@/context/locale-context';
import { authErrorKey } from '@/lib/auth/errors';
import { HANDLE_PATTERN, HandleTakenError, isHandleAvailable, normalizeHandle, suggestHandle } from '@/lib/auth/profile';

type Availability = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';

/** Figma "Profile setup": after first sign-in (name and handle required), and from Edit in settings. */
export function ProfileEditPage({ onBack, onDone }: { onBack?: () => void; onDone: () => void }) {
  const { t, language, setPreference } = useLocale();
  const { user, profile, needsSetup, saveProfile, closeAccount } = useAuth();
  const startName = profile?.displayName || user?.displayName || '';
  const [name, setName] = useState(startName);
  const [handle, setHandle] = useState(profile?.handle || suggestHandle(startName || user?.email || ''));
  const [church, setChurch] = useState(profile?.church ?? '');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check the handle as the person types (debounced).
  const uid = user?.uid;
  useEffect(() => {
    if (!uid) return;
    if (!HANDLE_PATTERN.test(handle)) return setAvailability(handle ? 'invalid' : 'idle');
    if (handle === profile?.handle) return setAvailability('ok');
    setAvailability('checking');
    let live = true;
    const id = setTimeout(() => {
      isHandleAvailable(handle, uid)
        .then((ok) => live && setAvailability(ok ? 'ok' : 'taken'))
        .catch(() => live && setAvailability('idle')); // Offline: the save will check again.
    }, 350);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [handle, uid, profile?.handle]);

  async function save() {
    setError(null);
    if (!name.trim()) return setError(t('profile.nameRequired'));
    if (!HANDLE_PATTERN.test(handle)) return setError(t('profile.handleHint'));
    setBusy(true);
    try {
      await saveProfile({ displayName: name, handle, church });
      onDone();
    } catch (e) {
      if (e instanceof HandleTakenError) setAvailability('taken');
      setError(e instanceof HandleTakenError ? t('profile.handleTaken') : t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const status =
    availability === 'checking' ? (
      <ActivityIndicator size="small" color={Palette.muted} />
    ) : availability === 'ok' ? (
      <Check size={16} color={Palette.cyan} accessibilityLabel={t('profile.handleAvailable')} />
    ) : availability === 'taken' ? (
      <X size={16} color={AccountColors.danger} accessibilityLabel={t('profile.handleTaken')} />
    ) : null;

  const languages: { value: Language; label: string }[] = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
  ];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader
        title={needsSetup ? t('profile.setupTitle') : t('profile.editTitle')}
        onBack={needsSetup ? undefined : onBack}
        backLabel={t('account.back')}
        // Setup can be finished later: closing keeps you signed in, and it shows again next time you open your account.
        right={
          needsSetup ? (
            <Pressable onPress={closeAccount} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('player.close')}>
              <X size={22} color={Palette.text} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.avatar}>
          <Avatar name={name || startName} photoURL={profile?.photoURL ?? user?.photoURL} size={84} />
        </View>
        <Field label={t('profile.name')} value={name} onChangeText={setName} autoComplete="name" textContentType="name" maxLength={60} />
        <Field
          label={t('profile.handle')}
          prefix="@"
          value={handle}
          onChangeText={(v) => setHandle(normalizeHandle(v))}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          trailing={status}
          hint={availability === 'taken' ? t('profile.handleTaken') : t('profile.handleHint')}
        />
        <Field
          label={
            <>
              {t('profile.church')} <ThemedText style={styles.optional}>{t('profile.optional')}</ThemedText>
            </>
          }
          value={church}
          onChangeText={setChurch}
          maxLength={80}
        />
        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('settings.language')}</ThemedText>
          <View style={styles.segment} accessibilityRole="radiogroup">
            {languages.map((o) => {
              const on = language === o.value;
              return (
                <Pressable
                  key={o.value}
                  onPress={() => setPreference(o.value)}
                  style={[styles.segmentItem, on && styles.segmentOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}>
                  <ThemedText style={[styles.segmentText, on && styles.segmentTextOn]}>{o.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Message text={error} />
        <PillButton
          label={needsSetup ? t('profile.continue') : t('profile.save')}
          onPress={save}
          busy={busy}
          disabled={!name.trim() || availability === 'taken' || availability === 'invalid'}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 22, paddingBottom: Spacing.five },
  avatar: { alignItems: 'center', paddingVertical: Spacing.one },
  optional: { color: Palette.muted, fontSize: 13, fontWeight: '600' },
  field: { gap: 5 },
  label: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  segment: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 999, backgroundColor: Palette.pill },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 999 },
  segmentOn: { backgroundColor: Palette.amber },
  segmentText: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  segmentTextOn: { color: Palette.bg },
});
