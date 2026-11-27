import { ChevronLeft, MoreVertical, Pencil, Play, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Field, Message, PillButton } from '@/components/account/ui';
import { ReorderableList } from '@/components/playlists/ReorderableList';
import { HymnLine, listStyles, PlaylistArt } from '@/components/playlists/ui';
import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, MiniPlayerHeight, Palette, Spacing } from '@/constants/theme';
import { hasRecording, type Hymn } from '@/context/audio-context';
import { useHymns } from '@/context/hymns-context';
import { useLocale } from '@/context/locale-context';
import { usePlaylists } from '@/context/playlists-context';
import { useAudio } from '@/hooks/use-audio';

const ROW_HEIGHT = 52;

/** Figma "Playlist detail": art, name, Play and Shuffle, then the hymns, which drag to reorder. */
export function PlaylistDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { t, plural } = useLocale();
  const { hymns } = useHymns();
  const { get, move, removeAt, openMenu } = usePlaylists();
  const { loadHymn, playAll, isPlayerVisible } = useAudio();
  const [editing, setEditing] = useState(false);
  const list = get(id);

  if (!list) return null;

  const byId = new Map(hymns.map((h) => [h.id, h]));
  // Each row keeps its place in `hymnIds`; hymns that no longer exist are left out of the view.
  const entries = list.hymnIds.flatMap((hid, index) => {
    const hymn = byId.get(hid);
    return hymn ? [{ hymn, index, key: `${hid}#${index}` }] : [];
  });
  const items: Hymn[] = entries.map((e) => e.hymn);
  const playable = items.filter(hasRecording).length;
  const bottomPad = BottomTabInset + (isPlayerVisible ? MiniPlayerHeight + Spacing.three : 0) + Spacing.four;

  if (editing) return <PlaylistEditor id={id} onDone={() => setEditing(false)} onDeleted={onBack} />;

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('playlists.back')}>
          <ChevronLeft size={22} color={Palette.text} />
        </Pressable>
        <View style={styles.flex} />
        <Pressable onPress={() => setEditing(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('playlists.edit')}>
          <Pencil size={18} color={Palette.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomPad }]}>
        <View style={styles.hero}>
          <PlaylistArt size={96} radius={16} />
          <View style={styles.flex}>
            <ThemedText style={styles.name} numberOfLines={2} accessibilityRole="header">
              {list.name}
            </ThemedText>
            <ThemedText style={listStyles.sub}>{plural('library.count', items.length)}</ThemedText>
            {items.length ? (
              <View style={styles.actions}>
                <Pressable onPress={() => playAll(items)} style={styles.playBtn} accessibilityRole="button">
                  <Play size={14} color="#04131B" fill="#04131B" />
                  <ThemedText style={styles.playText}>{t('playlists.play')}</ThemedText>
                </Pressable>
                {playable > 1 ? (
                  <Pressable onPress={() => playAll(items, { shuffle: true })} style={styles.shuffleBtn} accessibilityRole="button">
                    <ThemedText style={styles.shuffleText}>{t('playlists.shuffle')}</ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        </View>
        {list.description ? <ThemedText style={styles.description}>{list.description}</ThemedText> : null}
        {items.length && playable === 0 ? <ThemedText style={listStyles.sub}>{t('playlists.noRecordings')}</ThemedText> : null}
        {playable > 0 && playable < items.length ? <ThemedText style={listStyles.sub}>{t('playlists.someSkipped')}</ThemedText> : null}

        <View style={listStyles.divider} />

        {entries.length ? (
          <ReorderableList
            data={entries}
            keyOf={(e) => e.key}
            rowHeight={ROW_HEIGHT}
            labelOf={(e) => e.hymn.title}
            onMove={(from, to) => move(id, entries[from].index, entries[to].index)}
            renderRow={(e, i) => (
              <>
                {/* Opening a hymn follows the Auto-play setting; the rest of the playlist comes next. */}
                <HymnLine hymn={e.hymn} onPress={() => loadHymn(e.hymn, items, i)} />
                <Pressable
                  onPress={() =>
                    openMenu(e.hymn, [{ label: t('playlists.removeFromPlaylist'), Icon: Trash2, danger: true, onPress: () => removeAt(id, e.index) }])
                  }
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('playlists.more', { title: e.hymn.title })}>
                  <MoreVertical size={18} color={Palette.text} />
                </Pressable>
              </>
            )}
          />
        ) : (
          <View style={styles.empty}>
            <ThemedText style={styles.emptyTitle}>{t('playlists.emptyTitle')}</ThemedText>
            <ThemedText style={[listStyles.sub, styles.center]}>{t('playlists.emptyBody')}</ThemedText>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** Name, description and delete. Also used to create a playlist when `id` is omitted. */
export function PlaylistEditor({ id, onDone, onDeleted, onCreated }: { id?: string; onDone: () => void; onDeleted?: () => void; onCreated?: (id: string) => void }) {
  const { t } = useLocale();
  const { get, update, remove, create } = usePlaylists();
  const list = id ? get(id) : undefined;
  const [name, setName] = useState(list?.name ?? '');
  const [description, setDescription] = useState(list?.description ?? '');
  const [confirming, setConfirming] = useState(false);

  function save() {
    if (!name.trim()) return;
    if (list) {
      update(list.id, { name, description });
      onDone();
    } else {
      const newId = create(name, { description });
      onCreated?.(newId);
    }
  }

  function del() {
    if (!list) return;
    if (!confirming) return setConfirming(true);
    remove(list.id);
    onDeleted?.();
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <Pressable onPress={onDone} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('playlists.back')}>
          <ChevronLeft size={22} color={Palette.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle} accessibilityRole="header">
          {t(list ? 'playlists.edit' : 'playlists.new')}
        </ThemedText>
      </View>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Field label={t('playlists.name')} value={name} onChangeText={setName} placeholder={t('playlists.namePlaceholder')} maxLength={100} autoFocus={!list} returnKeyType="done" onSubmitEditing={save} />
        <Field label={t('playlists.description')} value={description} onChangeText={setDescription} maxLength={500} multiline />
        <PillButton label={t(list ? 'playlists.save' : 'playlists.create')} onPress={save} disabled={!name.trim()} />
        <PillButton label={t('playlists.cancel')} kind="outline" onPress={onDone} />
        {list ? (
          <>
            <View style={styles.spacer} />
            <PillButton label={t('playlists.delete')} kind="danger" icon={<Trash2 size={16} color={Palette.bg} />} onPress={del} />
            <Message text={confirming ? t('playlists.deleteConfirm', { name: list.name }) : null} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10, minHeight: 44 },
  headerTitle: { flex: 1, color: Palette.text, fontSize: 20, lineHeight: 28, fontWeight: '800' },
  content: { paddingHorizontal: Spacing.four, gap: 12 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { color: Palette.text, fontSize: 22, lineHeight: 30, fontWeight: '800' },
  description: { color: Palette.text, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, paddingTop: 8 },
  playBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Palette.cyan },
  playText: { color: '#04131B', fontSize: 13, fontWeight: '700' },
  shuffleBtn: { height: 32, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: Palette.line, justifyContent: 'center' },
  shuffleText: { color: Palette.text, fontSize: 13, fontWeight: '700' },
  empty: { paddingVertical: Spacing.five, gap: Spacing.one, alignItems: 'center' },
  emptyTitle: { color: Palette.text, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  form: { paddingHorizontal: Spacing.four, gap: 14, paddingBottom: Spacing.six },
  spacer: { height: Spacing.four },
});
