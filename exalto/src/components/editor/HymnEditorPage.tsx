import { ChevronRight, Info } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AccountColors, accountStyles, Field, Message, PageHeader, PillButton } from '@/components/account/ui';
import { Chips } from '@/components/editor/chips';
import { LyricsEditor } from '@/components/editor/LyricsEditor';
import { ThemedText } from '@/components/themed-text';
import { Palette, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useEditableHymnals } from '@/hooks/use-can-edit';
import type { StringKey } from '@/i18n/strings';
import { authErrorKey } from '@/lib/auth/errors';
import { deleteHymn, emptyHymn, HYMN_STATUSES, loadHymn, saveHymn, type EditableHymn } from '@/lib/editing';
import { isDisplayNumber } from '@/lib/hymn-number';

/** Edit or create a hymn: details here, lyrics on their own page (Figma "Lyrics editor"). */
export function HymnEditorPage({ id, hymnalId, onBack }: { id?: string; hymnalId?: string; onBack: () => void }) {
  const { t } = useLocale();
  const { canEditAll, isComposer } = useAuth();
  const hymnals = useEditableHymnals();
  const [hymn, setHymn] = useState<EditableHymn | null>(id ? null : emptyHymn(hymnalId ?? hymnals[0]?.id ?? ''));
  const [numberText, setNumberText] = useState('');
  const [lyricsOpen, setLyricsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    loadHymn(id)
      .then((h) => {
        if (!live) return;
        if (!h) return setError(t('error.generic'));
        setHymn(h);
        setNumberText(h.number != null ? String(h.number) : '');
      })
      .catch((e) => live && setError(t(authErrorKey(e))));
    return () => {
      live = false;
    };
  }, [id, t]);

  if (!hymn) {
    return (
      <View style={styles.flex}>
        <PageHeader title={t('edit.editHymn')} onBack={onBack} backLabel={t('account.back')} />
        {error ? <Message text={error} /> : <ActivityIndicator color={Palette.muted} style={styles.loading} />}
      </View>
    );
  }

  if (lyricsOpen) {
    return (
      <LyricsEditor
        lyrics={hymn.lyrics}
        repeatChorus={hymn.repeatChorus}
        onDone={(lyrics, repeatChorus) => {
          setHymn({ ...hymn, lyrics, repeatChorus });
          setLyricsOpen(false);
        }}
      />
    );
  }

  const set = (patch: Partial<EditableHymn>) => setHymn({ ...hymn, ...patch });
  // Composers (not staff) write as owners; their hymns must live in hymnals they own.
  const asComposer = !canEditAll && isComposer;

  async function save() {
    if (!hymn) return;
    setError(null);
    if (!hymn.title.trim()) return setError(t('edit.titleRequired'));
    if (!hymn.hymnalId) return setError(t('edit.noHymnals'));
    const n = numberText.trim() ? Number.parseInt(numberText, 10) : null;
    // The display number is only for numbers that aren't plain, like "17B" or "120A".
    const label = hymn.label.trim().toUpperCase();
    if (label && !isDisplayNumber(label)) return setError(t('edit.labelInvalid'));
    setBusy(true);
    try {
      await saveHymn({ ...hymn, label, number: Number.isFinite(n) ? n : null }, { asComposer });
      onBack();
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!hymn) return;
    if (!confirmDelete) return setConfirmDelete(true);
    setBusy(true);
    try {
      await deleteHymn(hymn);
      onBack();
    } catch (e) {
      setError(t(authErrorKey(e)));
      setBusy(false);
    }
  }

  const blocks = hymn.lyrics.length;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader
        title={hymn.id ? t('edit.editHymn') : t('edit.newHymn')}
        onBack={onBack}
        backLabel={t('account.back')}
        right={
          <Pressable onPress={save} disabled={busy} hitSlop={10} accessibilityRole="button">
            {busy ? <ActivityIndicator color={Palette.cyan} /> : <ThemedText style={styles.save}>{t('profile.save')}</ThemedText>}
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t('edit.title')} value={hymn.title} onChangeText={(title) => set({ title })} maxLength={120} />

        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('edit.hymnal')}</ThemedText>
          {hymnals.length ? (
            <Chips options={hymnals.map((h) => ({ value: h.id, label: h.name, color: h.color }))} value={hymn.hymnalId} onChange={(hymnalId) => set({ hymnalId })} />
          ) : (
            <ThemedText style={styles.muted}>{t('edit.noHymnals')}</ThemedText>
          )}
        </View>

        <View style={styles.row2}>
          <View style={styles.flex}>
            <Field label={t('edit.number')} value={numberText} onChangeText={(v) => setNumberText(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" maxLength={5} />
          </View>
          <View style={styles.flex}>
            <Field label={t('edit.label')} value={hymn.label} onChangeText={(label) => set({ label: label.replace(/[^0-9a-zA-Z]/g, '') })} autoCapitalize="characters" maxLength={6} placeholder="17B" />
          </View>
        </View>
        <ThemedText style={styles.hint}>{t('edit.labelHint')}</ThemedText>

        <Field label={t('edit.author')} value={hymn.author} onChangeText={(author) => set({ author })} maxLength={120} />

        <Pressable onPress={() => setLyricsOpen(true)} style={[accountStyles.card, styles.navRow]} accessibilityRole="button">
          <ThemedText style={styles.navLabel}>{t('edit.lyrics')}</ThemedText>
          <ThemedText style={styles.muted}>{blocks ? t('edit.blockCount', { count: blocks }) : t('edit.noLyrics')}</ThemedText>
          <ChevronRight size={16} color={Palette.muted} />
        </Pressable>

        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('edit.language')}</ThemedText>
          <Chips
            options={[
              { value: 'es', label: 'Español' },
              { value: 'en', label: 'English' },
            ]}
            value={hymn.language}
            onChange={(language) => set({ language: language as 'es' | 'en' })}
          />
        </View>

        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('edit.status')}</ThemedText>
          <Chips options={HYMN_STATUSES.map((s) => ({ value: s, label: t(`status.${s}` as StringKey) }))} value={hymn.status} onChange={(status) => set({ status: status as EditableHymn['status'] })} />
        </View>

        <View style={styles.note}>
          <Info size={14} color={Palette.muted} />
          <ThemedText style={[styles.hint, styles.flex]}>{t('edit.studioNote')}</ThemedText>
        </View>

        <Message text={error} />
        <PillButton label={t('profile.save')} onPress={save} busy={busy} />
        {hymn.id ? (
          <PillButton kind="outline" label={confirmDelete ? t('edit.deleteConfirm', { title: hymn.title }) : t('edit.delete')} onPress={remove} disabled={busy} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: Spacing.five },
  content: { gap: 14, paddingHorizontal: 22, paddingBottom: Spacing.five },
  save: { color: Palette.cyan, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  field: { gap: 6 },
  label: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  row2: { flexDirection: 'row', gap: 12 },
  hint: { color: Palette.muted, fontSize: 12, lineHeight: 16, marginTop: -8 },
  muted: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  navLabel: { color: Palette.text, fontSize: 15, lineHeight: 20, fontWeight: '600', flex: 1 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  danger: { color: AccountColors.danger },
});
