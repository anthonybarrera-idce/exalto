import { Trash2, X } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AccountColors, accountStyles, Field, Message, PageHeader, PillButton } from '@/components/account/ui';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';

/** Figma "Delete account": what goes away, then a typed confirmation. Required by both app stores. */
export function DeleteAccountPage({ onBack, onDeleted }: { onBack: () => void; onDeleted: () => void }) {
  const { t } = useLocale();
  const { user, profile, deleteAccount } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = t('delete.word');
  const apple = Platform.OS === 'ios' && user?.providerData.some((p) => p.providerId === 'apple.com');
  const uploads = (profile?.uploadCount ?? 0) > 0 || profile?.role === 'composer';

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      if (await deleteAccount()) onDeleted();
    } catch (e) {
      // The function explains refusals (e.g. team accounts) in English; otherwise show a friendly message.
      const code = (e as { code?: string }).code;
      setError(code === 'functions/failed-precondition' ? (e as Error).message : t('error.deleteUnavailable'));
    } finally {
      setBusy(false);
    }
  }

  const items = [t('delete.profile'), t('delete.favorites'), t('delete.login')];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader title={t('account.delete')} onBack={onBack} backLabel={t('account.back')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.iconBox}>
          <Trash2 size={26} color={AccountColors.danger} />
        </View>
        <ThemedText style={styles.title}>{t('delete.title')}</ThemedText>
        <View style={[accountStyles.card, styles.list]}>
          <ThemedText style={styles.small}>{t('delete.removes')}</ThemedText>
          {items.map((item) => (
            <View key={item} style={styles.item}>
              <X size={14} color={AccountColors.danger} />
              <ThemedText style={styles.itemText}>{item}</ThemedText>
            </View>
          ))}
          {uploads && <ThemedText style={styles.note}>{t('delete.uploads')}</ThemedText>}
          <ThemedText style={styles.note}>{t('delete.guest')}</ThemedText>
        </View>
        <Field
          label={t('delete.confirmLabel', { word })}
          value={typed}
          onChangeText={setTyped}
          placeholder={word}
          autoCapitalize="characters"
          autoCorrect={false}
        />
        {apple && <ThemedText style={styles.note}>{t('delete.apple')}</ThemedText>}
        <Message text={error} />
        <PillButton kind="danger" label={t('delete.button')} onPress={confirm} busy={busy} disabled={typed.trim().toUpperCase() !== word} />
        <PillButton kind="outline" label={t('delete.cancel')} onPress={onBack} disabled={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 22, paddingBottom: Spacing.five },
  iconBox: { alignSelf: 'center', width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: AccountColors.dangerSoft, marginTop: 6 },
  title: { color: Palette.text, fontSize: 19, lineHeight: 26, fontWeight: '800', textAlign: 'center' },
  list: { gap: 10 },
  small: { color: Palette.text, fontSize: 13, lineHeight: 18 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemText: { color: Palette.text, fontSize: 14, lineHeight: 20 },
  note: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
});
