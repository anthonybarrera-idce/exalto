import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Pipette } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { Field, Message, PageHeader, PillButton } from '@/components/account/ui';
import { ColorPickerSheet } from '@/components/editor/ColorPickerSheet';
import { ThemedText } from '@/components/themed-text';
import { HymnArt } from '@/components/ui/hymn-art';
import { Palette, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useLocale } from '@/context/locale-context';
import { useHymnals } from '@/data/hymnals';
import { authErrorKey } from '@/lib/auth/errors';
import { canPickThumbnail, pickThumbnail, removeHymnalThumbnail, uploadHymnalThumbnail } from '@/lib/hymnal-thumbnail';
import { BUILT_IN_HYMNALS, deleteHymnal, hymnalHasHymns, saveHymnal, type EditableHymnal } from '@/lib/editing';

const COLORS = ['#1A6B9A', '#0F6F95', '#04C1FF', '#2E7D5B', '#EDA145', '#C0563A', '#7A3E1E', '#8A2C4F', '#4A2E6B', '#5A4632'];

/** Create or edit a hymnal. Composers' hymnals are community hymnals they own; staff also set official/offline/order. */
export function HymnalEditorPage({ id, onBack }: { id?: string; onBack: () => void }) {
  const { t } = useLocale();
  const { user, profile, canEditAll, canManageTeam, isComposer } = useAuth();
  const hymnals = useHymnals();
  const existing = id ? hymnals.find((h) => h.id === id) : undefined;
  const [h, setH] = useState<EditableHymnal>(() =>
    existing
      ? { ...existing }
      : {
          id: '',
          name: '',
          shortName: '',
          color: COLORS[0],
          kind: 'community',
          visible: true,
          offline: false,
          order: Math.max(0, ...hymnals.map((x) => x.order)) + 1,
        },
  );
  const [busy, setBusy] = useState(false);
  // Cover: a picked (already shrunk) local image waiting to upload on Save, or 'remove'.
  const [cover, setCover] = useState<{ uri: string } | 'remove' | null>(null);
  const [picking, setPicking] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const custom = !COLORS.some((c) => c.toLowerCase() === h.color.toLowerCase());
  const currentCover = cover === 'remove' ? undefined : (cover?.uri ?? existing?.thumbnailUrl);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<EditableHymnal>) => setH({ ...h, ...patch });

  const isNew = !id;
  const asComposer = !canEditAll && isComposer;
  const mine = Boolean(user && h.ownerUid === user.uid);
  const canDelete = !isNew && !BUILT_IN_HYMNALS.includes(h.id) && (canManageTeam || (isComposer && mine));

  async function save() {
    setError(null);
    if (!h.name.trim()) return setError(t('hymnalEdit.nameRequired'));
    setBusy(true);
    try {
      const savedId = await saveHymnal(h, { isNew, asComposer, creatorName: profile?.displayName || user?.displayName || undefined });
      if (cover === 'remove') await removeHymnalThumbnail(savedId, h.name);
      else if (cover) await uploadHymnalThumbnail(savedId, h.name, cover.uri);
      onBack();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg === 'name-taken' || msg === 'invalid-name' ? t('hymnalEdit.nameTaken') : t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) return setConfirmDelete(true);
    setError(null);
    setBusy(true);
    try {
      if (await hymnalHasHymns(h.id, canEditAll ? undefined : user?.uid)) {
        setError(t('hymnalEdit.deleteHasHymns'));
      } else {
        await deleteHymnal(h);
        onBack();
        return;
      }
    } catch (e) {
      setError(t(authErrorKey(e)));
    }
    setBusy(false);
    setConfirmDelete(false);
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader
        title={isNew ? t('hymnalEdit.new') : t('hymnalEdit.edit')}
        onBack={onBack}
        backLabel={t('account.back')}
        right={
          <Pressable onPress={save} disabled={busy} hitSlop={10} accessibilityRole="button">
            {busy ? <ActivityIndicator color={Palette.cyan} /> : <ThemedText style={styles.save}>{t('profile.save')}</ThemedText>}
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label={t('hymnalEdit.name')} value={h.name} onChangeText={(name) => set({ name })} maxLength={60} />
        <Field label={t('hymnalEdit.shortName')} hint={t('hymnalEdit.shortHint')} value={h.shortName} onChangeText={(shortName) => set({ shortName })} maxLength={30} />

        {canPickThumbnail && (
          <View style={styles.field}>
            <ThemedText style={styles.label}>{t('hymnalEdit.cover')}</ThemedText>
            <View style={styles.coverRow}>
              {currentCover ? (
                <Image source={{ uri: currentCover }} style={styles.cover} contentFit="cover" accessibilityIgnoresInvertColors />
              ) : (
                // What hymns will show without a cover: the gradient of the chosen color with the Exalto mark.
                <HymnArt seed="preview" color={h.color} size={96} radius={16} />
              )}
              <View style={styles.coverActions}>
                <PillButton
                  kind="outline"
                  label={currentCover ? t('hymnalEdit.changeCover') : t('hymnalEdit.chooseCover')}
                  busy={picking}
                  disabled={busy}
                  onPress={async () => {
                    setError(null);
                    setPicking(true);
                    try {
                      const picked = await pickThumbnail();
                      if (picked) setCover(picked);
                    } catch {
                      setError(t('hymnalEdit.coverError'));
                    } finally {
                      setPicking(false);
                    }
                  }}
                />
                {currentCover ? <PillButton kind="outline" label={t('hymnalEdit.removeCover')} disabled={busy} onPress={() => setCover(existing?.thumbnailUrl ? 'remove' : null)} /> : null}
              </View>
            </View>
            <ThemedText style={styles.hint}>{t('hymnalEdit.coverHint')}</ThemedText>
          </View>
        )}

        <View style={styles.field}>
          <ThemedText style={styles.label}>{t('hymnalEdit.color')}</ThemedText>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {COLORS.map((c) => {
              const on = c.toLowerCase() === h.color.toLowerCase();
              return (
                <Pressable key={c} onPress={() => set({ color: c })} style={[styles.swatch, { backgroundColor: c }, on && styles.swatchOn]} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={c}>
                  {on && <Check size={16} color="#FFFFFF" strokeWidth={3} />}
                </Pressable>
              );
            })}
            {/* Any other color: a rainbow swatch that opens the full picker (filled with the color once picked). */}
            <Pressable
              onPress={() => setColorOpen(true)}
              style={[styles.swatch, custom && styles.swatchOn, custom && { backgroundColor: h.color }]}
              accessibilityRole="radio"
              accessibilityState={{ checked: custom }}
              accessibilityLabel={t('hymnalEdit.customColor')}
            >
              {!custom && (
                <LinearGradient colors={['#FF4D4D', '#FFC83D', '#3DDC84', '#04C1FF', '#8A5CFF', '#FF4DB8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rainbow} />
              )}
              {custom ? <Check size={16} color="#FFFFFF" strokeWidth={3} /> : <Pipette size={16} color="#FFFFFF" strokeWidth={2.4} />}
            </Pressable>
          </View>
        </View>
        <ColorPickerSheet
          visible={colorOpen}
          value={h.color}
          onClose={() => setColorOpen(false)}
          onDone={(color) => {
            set({ color });
            setColorOpen(false);
          }}
        />

        <View style={styles.group}>
          <Toggle label={t('hymnalEdit.visible')} value={h.visible} onChange={(visible) => set({ visible })} />
          {canEditAll && (
            <>
              <Toggle label={t('hymnalEdit.official')} value={h.kind === 'official'} onChange={(v) => set({ kind: v ? 'official' : 'community' })} divider />
              <Toggle label={t('hymnalEdit.offline')} value={h.offline} onChange={(offline) => set({ offline })} divider />
            </>
          )}
        </View>
        {canEditAll && (
          <Field
            label={t('hymnalEdit.order')}
            value={String(h.order)}
            onChangeText={(v) => set({ order: Number.parseInt(v.replace(/[^0-9]/g, '') || '0', 10) })}
            keyboardType="number-pad"
            maxLength={3}
          />
        )}

        <Message text={error} />
        <PillButton label={t('profile.save')} onPress={save} busy={busy} />
        {canDelete && (
          <PillButton kind="outline" label={confirmDelete ? t('hymnalEdit.deleteConfirm', { name: h.name }) : t('hymnalEdit.delete')} onPress={remove} disabled={busy} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Toggle({ label, value, onChange, divider }: { label: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean }) {
  return (
    <View style={[styles.toggle, divider && styles.divider]}>
      <ThemedText style={styles.toggleText}>{label}</ThemedText>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: Palette.pill, true: Palette.cyan }} thumbColor={Palette.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 14, paddingHorizontal: 22, paddingBottom: Spacing.five },
  save: { color: Palette.cyan, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  field: { gap: 8 },
  label: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  coverRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  cover: { width: 96, height: 96, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  coverActions: { flex: 1, gap: 8 },
  hint: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatchOn: { borderWidth: 2, borderColor: Palette.text },
  rainbow: { ...StyleSheet.absoluteFill, borderRadius: 18 },
  group: { backgroundColor: Palette.surface, borderRadius: 14, borderWidth: 1, borderColor: Palette.line },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: Spacing.three },
  toggleText: { color: Palette.text, fontSize: 15, lineHeight: 20, flex: 1 },
  divider: { borderTopWidth: 1, borderTopColor: Palette.line },
});
