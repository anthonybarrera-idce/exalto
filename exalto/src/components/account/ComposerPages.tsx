import { LinearGradient } from 'expo-linear-gradient';
import { BookOpen, FolderPlus, Music2, Pencil, Play, Plus, Upload, UserRound } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AccountColors, accountStyles, Avatar, Field, Message, PageHeader, PillButton } from '@/components/account/ui';
import { Chips } from '@/components/editor/chips';
import { ThemedText } from '@/components/themed-text';
import { HymnArt } from '@/components/ui/hymn-art';
import { BrandGradient, FontFamily, Palette, Spacing } from '@/constants/theme';
import { hasRecording, type Hymn } from '@/context/audio-context';
import { useAuth } from '@/context/auth-context';
import { useHymns } from '@/context/hymns-context';
import { useLocale } from '@/context/locale-context';
import { useHymnals } from '@/data/hymnals';
import { useAudio } from '@/hooks/use-audio';
import { useCanEdit, useEditableHymnals } from '@/hooks/use-can-edit';
import type { StringKey } from '@/i18n/strings';
import { authErrorKey } from '@/lib/auth/errors';
import {
  sendComposerRequest,
  watchComposer,
  watchComposerRequest,
  withdrawComposerRequest,
  type ComposerPublic,
  type ComposerRequest,
  type MyHymn,
} from '@/lib/composers';
import { watchEditableHymns, type EditableHymn } from '@/lib/editing';
import { hymnNumberText } from '@/lib/hymn-number';

/** Plays a hymn from a list, or opens its lyrics when it has no recording (same as the Library). */
function usePlayHymn() {
  const { loadHymn } = useAudio();
  const { closeAccount } = useAuth();
  return (hymn: Hymn, list: Hymn[]) => {
    closeAccount();
    // Plays if "Auto-play recordings" is on and the hymn has one; otherwise opens the lyrics.
    loadHymn(hymn, list, list.indexOf(hymn));
  };
}

/** Figma "Composer profile (public)": who they are and their published hymns. Follow and plays aren't tracked yet. */
export function ComposerProfilePage({ uid, onBack }: { uid: string; onBack: () => void }) {
  const { t, plural } = useLocale();
  const { user, profile } = useAuth();
  const { hymns } = useHymns();
  const hymnals = useHymnals();
  const play = usePlayHymn();
  const [pub, setPub] = useState<ComposerPublic | null | undefined>(undefined);

  useEffect(() => watchComposer(uid, setPub), [uid]);

  const mine = user?.uid === uid;
  const theirHymnals = hymnals.filter((h) => h.ownerUid === uid);
  const list = hymns.filter((h) => h.ownerUid === uid);
  // Before their public doc exists, fall back to their own profile (if it's you) or the name on their hymnal.
  const name = pub?.displayName || (mine ? profile?.displayName : '') || theirHymnals[0]?.createdByName || '';
  const handle = pub?.handle || (mine ? profile?.handle : '') || '';
  const photo = pub?.photoURL ?? (mine ? (profile?.photoURL ?? user?.photoURL) : null);

  return (
    <View style={styles.flex}>
      <PageHeader onBack={onBack} backLabel={t('account.back')} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[accountStyles.card, styles.hero]}>
          {pub === undefined && !name ? (
            <ActivityIndicator color={Palette.muted} />
          ) : (
            <>
              <Avatar name={name} photoURL={photo} size={84} />
              <View style={styles.nameRow}>
                <ThemedText style={styles.name} numberOfLines={1}>
                  {name}
                </ThemedText>
                <Music2 size={16} color={Palette.cyan} accessibilityLabel={t('role.composer')} />
              </View>
              <ThemedText style={styles.meta}>
                {[handle && `@${handle}`, plural('library.count', list.length)].filter(Boolean).join(' · ')}
              </ThemedText>
              {pub?.church ? <ThemedText style={styles.meta}>{pub.church}</ThemedText> : null}
            </>
          )}
        </View>

        <ThemedText style={styles.sectionTitle}>{t('composer.hymns')}</ThemedText>
        {list.length === 0 ? (
          <ThemedText style={styles.muted}>{t('composer.empty')}</ThemedText>
        ) : (
          list.map((h) => (
            <Pressable key={h.id} onPress={() => play(h, list)} style={styles.row} accessibilityRole="button" accessibilityLabel={t('hymns.play', { title: h.title })}>
              <HymnArt seed={h.id} hymnalId={h.hymnalId} size={48} radius={10} label={h.label} />
              <View style={styles.flex}>
                <ThemedText style={styles.rowTitle} numberOfLines={1}>
                  {h.title}
                </ThemedText>
                <ThemedText style={styles.muted} numberOfLines={1}>
                  {hymnals.find((x) => x.id === h.hymnalId)?.name ?? ''}
                </ThemedText>
              </View>
              {hasRecording(h) ? <Play size={20} color={Palette.text} fill={Palette.text} /> : <BookOpen size={20} color={Palette.amber} />}
            </Pressable>
          ))
        )}

        {theirHymnals.length > 0 && (
          <>
            <ThemedText style={styles.sectionTitle}>{t('composer.hymnals')}</ThemedText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tiles}>
              {theirHymnals.map((h) => (
                <View key={h.id} style={styles.tile}>
                  <LinearGradient colors={[h.color, BrandGradient[0]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileArt}>
                    <BookOpen size={24} color="#FFFFFF" />
                  </LinearGradient>
                  <ThemedText style={styles.rowTitle} numberOfLines={1}>
                    {h.name}
                  </ThemedText>
                  <ThemedText style={styles.muted}>{plural('library.count', hymns.filter((x) => x.hymnalId === h.id).length)}</ThemedText>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const STATUS_COLOR: Record<MyHymn['status'], string> = {
  published: Palette.cyan,
  review: Palette.amber,
  draft: Palette.muted,
  hidden: AccountColors.danger,
};

/**
 * Hymns in every state, to edit. Staff pick any hymnal and see all its hymns; composers see their own hymnals
 * and only their own hymns. Also where hymnals are created and edited.
 */
export function MyHymnsPage({ onBack }: { onBack: () => void }) {
  const { t } = useLocale();
  const { user, canEditAll, openEditor } = useAuth();
  const can = useCanEdit();
  const hymnals = useEditableHymnals();
  const [picked, setPicked] = useState<string | null>(null);
  const hymnalId = hymnals.find((h) => h.id === picked)?.id ?? hymnals[0]?.id ?? '';
  const hymnal = hymnals.find((h) => h.id === hymnalId);
  const [list, setList] = useState<EditableHymn[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const uid = user?.uid;

  useEffect(() => {
    setList(null);
    if (!uid) return;
    // The rules let composers list only their own hymns; staff can list a whole hymnal.
    const scope = canEditAll ? (hymnalId ? { hymnalId } : null) : { ownerUid: uid };
    if (!scope) return setList([]);
    return watchEditableHymns(scope, (l, e) => {
      setList(l);
      setError(e ?? null);
    });
  }, [uid, canEditAll, hymnalId]);

  const shown = (list ?? []).filter((h) => h.hymnalId === hymnalId);

  return (
    <View style={styles.flex}>
      <PageHeader
        title={canEditAll ? t('creator.manage') : t('creator.myHymns')}
        onBack={onBack}
        backLabel={t('account.back')}
        right={
          can.canCreate ? (
            <Pressable onPress={() => openEditor({ kind: 'hymnal', returnTo: 'myHymns' })} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('hymnalEdit.new')}>
              <FolderPlus size={22} color={Palette.cyan} />
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        {hymnals.length ? (
          <Chips options={hymnals.map((h) => ({ value: h.id, label: h.name, color: h.color }))} value={hymnalId} onChange={setPicked} />
        ) : (
          <ThemedText style={styles.muted}>{t('edit.noHymnals')}</ThemedText>
        )}
        {hymnal && (
          <View style={styles.actions}>
            <PillButton kind="primary" label={t('edit.newHymn')} icon={<Plus size={16} color={AccountColors.onCyan} />} onPress={() => openEditor({ kind: 'hymn', hymnalId, returnTo: 'myHymns' })} />
            <PillButton kind="outline" label={t('hymns.editHymnal')} icon={<Pencil size={14} color={Palette.text} />} onPress={() => openEditor({ kind: 'hymnal', id: hymnalId, returnTo: 'myHymns' })} />
          </View>
        )}
        <View style={styles.hint}>
          <Upload size={16} color={Palette.amber} />
          <ThemedText style={[styles.muted, styles.flex]}>{t('creator.studioHint')}</ThemedText>
        </View>
        {error ? <Message text={t('myHymns.error', { error })} /> : null}
        {!list && !error && hymnal && <ActivityIndicator color={Palette.muted} style={styles.loading} />}
        {list && hymnal && shown.length === 0 && <ThemedText style={styles.muted}>{t('myHymns.empty')}</ThemedText>}
        {shown.map((h) => (
          <Pressable
            key={h.id}
            onPress={() => openEditor({ kind: 'hymn', id: h.id, returnTo: 'myHymns' })}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={t('hymns.edit', { title: h.title })}>
            <HymnArt seed={h.id} size={48} radius={10} label={hymnNumberText(h) ?? undefined} />
            <View style={styles.flex}>
              <ThemedText style={styles.rowTitle} numberOfLines={1}>
                {h.title}
              </ThemedText>
              <ThemedText style={styles.muted} numberOfLines={1}>
                {h.author}
              </ThemedText>
            </View>
            <View style={[styles.status, { borderColor: STATUS_COLOR[h.status] }]}>
              <ThemedText style={[styles.statusText, { color: STATUS_COLOR[h.status] }]}>{t(`status.${h.status}` as StringKey)}</ThemedText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Figma "Become a composer": a request an admin approves (by giving the composer role). */
export function BecomeComposerPage({ onBack }: { onBack: () => void }) {
  const { t } = useLocale();
  const { user, profile } = useAuth();
  const [request, setRequest] = useState<ComposerRequest | null | undefined>(undefined);
  const [about, setAbout] = useState('');
  const [sample, setSample] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = user?.uid;

  useEffect(() => {
    if (!uid) return setRequest(null);
    return watchComposerRequest(uid, setRequest);
  }, [uid]);

  async function submit() {
    if (!uid) return;
    setError(null);
    if (!about.trim()) return setError(t('become.aboutRequired'));
    setBusy(true);
    try {
      // A declined request is replaced by a new one.
      if (request) await withdrawComposerRequest(uid);
      await sendComposerRequest(uid, { displayName: profile?.displayName ?? '', handle: profile?.handle ?? '', about, sampleUrl: sample });
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!uid) return;
    setBusy(true);
    try {
      await withdrawComposerRequest(uid);
    } catch (e) {
      setError(t(authErrorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  const perks: { Icon: typeof Upload; key: StringKey }[] = [
    { Icon: Upload, key: 'become.upload' },
    { Icon: BookOpen, key: 'become.community' },
    { Icon: UserRound, key: 'become.profile' },
  ];

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader onBack={onBack} backLabel={t('account.back')} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <LinearGradient colors={['#0F6F95', '#1E2A2E', '#3A2414']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
          <LinearGradient colors={[BrandGradient[0], BrandGradient[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.tag}>
            <ThemedText style={styles.tagText}>{t('become.tag')}</ThemedText>
          </LinearGradient>
          <ThemedText style={styles.bannerTitle}>{t('become.title')}</ThemedText>
        </LinearGradient>
        {perks.map(({ Icon, key }) => (
          <View key={key} style={styles.perk}>
            <Icon size={18} color={Palette.cyan} />
            <ThemedText style={styles.perkText}>{t(key)}</ThemedText>
          </View>
        ))}

        {request === undefined ? (
          <ActivityIndicator color={Palette.muted} style={styles.loading} />
        ) : request?.status === 'pending' ? (
          <View style={[accountStyles.card, styles.pending]}>
            <ThemedText style={styles.rowTitle}>{t('become.pendingTitle')}</ThemedText>
            <ThemedText style={styles.muted}>{t('become.pendingBody')}</ThemedText>
            <Message text={error} />
            <PillButton kind="outline" label={t('become.withdraw')} onPress={withdraw} busy={busy} />
          </View>
        ) : (
          <>
            {request?.status === 'declined' && <ThemedText style={styles.muted}>{t('become.declinedBody')}</ThemedText>}
            <View style={styles.field}>
              <ThemedText style={styles.label}>{t('become.about')}</ThemedText>
              <TextInput
                value={about}
                onChangeText={setAbout}
                placeholder={t('become.aboutPlaceholder')}
                placeholderTextColor={Palette.muted}
                selectionColor={Palette.cyan}
                multiline
                maxLength={1000}
                style={styles.textarea}
              />
            </View>
            <Field
              label={
                <>
                  {t('become.sample')} <ThemedText style={styles.optional}>{t('profile.optional')}</ThemedText>
                </>
              }
              value={sample}
              onChangeText={setSample}
              placeholder={t('become.samplePlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              maxLength={300}
            />
            <Message text={error} />
            <PillButton label={t('become.submit')} onPress={submit} busy={busy} disabled={!about.trim()} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: 12, paddingHorizontal: 22, paddingBottom: Spacing.five },
  hero: { alignItems: 'center', gap: 6, paddingVertical: Spacing.four },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.two, maxWidth: '90%' },
  name: { color: Palette.text, fontSize: 20, lineHeight: 26, fontWeight: '800', flexShrink: 1 },
  meta: { color: Palette.muted, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  sectionTitle: { color: Palette.text, fontSize: 17, lineHeight: 24, fontWeight: '800', marginTop: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  rowTitle: { color: Palette.text, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  muted: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  tiles: { gap: 12 },
  tile: { width: 128, gap: 4 },
  tileArt: { width: 128, height: 128, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  loading: { marginTop: Spacing.four },
  status: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 12, lineHeight: 16, fontWeight: '700' },
  banner: { borderRadius: 18, padding: Spacing.three, gap: 10, borderWidth: 1, borderColor: Palette.line },
  tag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: Palette.bg, fontSize: 11, lineHeight: 14, fontWeight: '800', letterSpacing: 0.6 },
  bannerTitle: { color: Palette.text, fontSize: 22, lineHeight: 28, fontWeight: '800' },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  perkText: { color: Palette.text, fontSize: 15, lineHeight: 20, flex: 1 },
  pending: { gap: 10 },
  actions: { gap: 8 },
  field: { gap: 5 },
  label: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  optional: { color: Palette.muted, fontSize: 13, fontWeight: '600' },
  textarea: {
    minHeight: 96,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AccountColors.fieldBorder,
    backgroundColor: Palette.field,
    color: Palette.text,
    fontFamily: FontFamily.regular,
    fontSize: 15,
    padding: 12,
    textAlignVertical: 'top',
  },
});
