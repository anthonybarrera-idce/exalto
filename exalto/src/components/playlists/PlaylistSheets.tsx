import { Check, ListEnd, ListPlus, ListStart, Plus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { PillButton } from '@/components/account/ui';
import { BottomSheet, HymnLine, listStyles, PlaylistArt } from '@/components/playlists/ui';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, Palette } from '@/constants/theme';
import type { Hymn } from '@/context/audio-context';
import { useFavorites } from '@/context/favorites-context';
import { useLocale } from '@/context/locale-context';
import { usePlaylists, type MenuExtra } from '@/context/playlists-context';
import { useAudio } from '@/hooks/use-audio';

/**
 * The hymn sheet, once at the root (app/_layout.tsx), opened for a hymn through usePlaylists(). The ⋮ menu and
 * "Add to playlist" are two pages of one sheet: going from the menu to the picker swaps the content instead of
 * closing one window and opening another (on iOS that can leave an invisible window that blocks every touch).
 */
export function PlaylistSheets() {
  const { t } = useLocale();
  const { menuHymn, pickerHymn, closeMenu, closePicker } = usePlaylists();
  const open = pickerHymn ?? menuHymn;
  // Keep the last hymn and page on screen while the sheet slides closed.
  const hymn = useLast(open);
  const page = useLast(open ? (pickerHymn ? 'picker' : 'menu') : null);
  return (
    <BottomSheet
      visible={open !== null}
      onClose={() => {
        closeMenu();
        closePicker();
      }}
      closeLabel={t('player.close')}>
      {hymn ? page === 'picker' ? <PickerPage hymn={hymn} /> : <MenuPage hymn={hymn} /> : null}
    </BottomSheet>
  );
}

/** The last non-null value, so a sheet keeps showing its hymn while it slides closed. */
function useLast<T>(value: T | null): T | null {
  const last = useRef(value);
  if (value !== null) last.current = value;
  return last.current;
}

/** Figma "Add to playlist": Liked Hymns and every playlist, with a check where the hymn already is. */
function PickerPage({ hymn }: { hymn: Hymn }) {
  const { t, plural } = useLocale();
  const { closePicker, playlists, addHymn, removeHymn, create } = usePlaylists();
  const favorites = useFavorites();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    setNaming(false);
    setName('');
  }, [hymn?.id]);

  function createList() {
    if (!name.trim()) return;
    create(name, { hymnIds: [hymn.id] });
    setNaming(false);
    setName('');
  }

  return (
    <>
      <View style={styles.head}>
        <HymnLine hymn={hymn} />
      </View>
      <ThemedText style={[listStyles.sub, styles.headSub]}>{t('playlists.addTo')}</ThemedText>
      <View style={listStyles.divider} />

      {naming ? (
        <View style={styles.newRow}>
          <TextInput
            autoFocus
            value={name}
            onChangeText={setName}
            onSubmitEditing={createList}
            placeholder={t('playlists.namePlaceholder')}
            placeholderTextColor={Palette.muted}
            selectionColor={Palette.cyan}
            returnKeyType="done"
            maxLength={100}
            accessibilityLabel={t('playlists.name')}
            style={styles.input}
          />
          <Pressable
            onPress={createList}
            disabled={!name.trim()}
            hitSlop={8}
            accessibilityRole="button"
            style={[styles.createBtn, !name.trim() && styles.dim]}>
            <ThemedText style={styles.createText}>{t('playlists.create')}</ThemedText>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => setNaming(true)} style={styles.newRow} accessibilityRole="button">
          <Plus size={18} color={Palette.cyan} />
          <ThemedText style={styles.newText}>{t('playlists.new')}</ThemedText>
        </Pressable>
      )}

      <ScrollView style={styles.lists} contentContainerStyle={styles.listsContent}>
        <PickRow
          name={t('library.liked')}
          count={plural('library.count', favorites.ids.length)}
          on={favorites.isFavorite(hymn.id)}
          onPress={() => favorites.toggle(hymn.id)}
          label={t(favorites.isFavorite(hymn.id) ? 'home.unlike' : 'home.like', { title: hymn.title })}
        />
        {playlists.map((p) => {
          const on = p.hymnIds.includes(hymn.id);
          return (
            <PickRow
              key={p.id}
              name={p.name}
              count={plural('library.count', p.hymnIds.length)}
              on={on}
              onPress={() => (on ? removeHymn(p.id, hymn.id) : addHymn(p.id, hymn.id))}
              label={t(on ? 'playlists.removeHymn' : 'playlists.addHymn', {
                title: hymn.title,
                name: p.name,
              })}
            />
          );
        })}
      </ScrollView>

      <PillButton label={t('playlists.done')} onPress={closePicker} />
    </>
  );
}

function PickRow({ name, count, on, onPress, label }: { name: string; count: string; on: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.pickRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}>
      <PlaylistArt size={40} muted={!on} />
      <View style={styles.flex}>
        <ThemedText style={listStyles.title} numberOfLines={1}>
          {name}
        </ThemedText>
        <ThemedText style={listStyles.sub}>{count}</ThemedText>
      </View>
      {on ? <Check size={18} color={Palette.cyan} /> : <Plus size={18} color={Palette.muted} />}
    </Pressable>
  );
}

/** The ⋮ menu on hymn rows: Play next, Add to queue, Add to playlist, plus anything the screen adds. */
function MenuPage({ hymn }: { hymn: Hymn }) {
  const { t } = useLocale();
  const { closeMenu, openPicker, menuExtra } = usePlaylists();
  const { playNext, addToQueue } = useAudio();
  const run = (fn: () => void) => () => {
    closeMenu();
    fn();
  };
  return (
    <>
      <View style={styles.head}>
        <HymnLine hymn={hymn} />
      </View>
      <View style={listStyles.divider} />
      <MenuItem Icon={ListStart} label={t('queue.playNext')} onPress={run(() => playNext(hymn))} />
      <MenuItem Icon={ListEnd} label={t('queue.add')} onPress={run(() => addToQueue(hymn))} />
      <MenuItem Icon={ListPlus} label={t('playlists.addTo')} onPress={() => openPicker(hymn)} />
      {menuExtra?.map((item) => (
        <MenuItem key={item.label} Icon={item.Icon} label={item.label} onPress={run(item.onPress)} danger={item.danger} />
      ))}
    </>
  );
}

function MenuItem({ Icon, label, onPress, danger }: MenuExtra) {
  const color = danger ? '#F08A6B' : Palette.text;
  return (
    <Pressable onPress={onPress} style={styles.menuItem} accessibilityRole="menuitem">
      <Icon size={20} color={color} />
      <ThemedText style={[styles.menuText, { color }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row' },
  headSub: { marginTop: -8 },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 36,
  },
  newText: {
    color: Palette.cyan,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
  },
  input: {
    flex: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#8A7E72',
    backgroundColor: Palette.field,
    color: Palette.text,
    fontSize: 15,
    fontFamily: FontFamily.regular,
  },
  createBtn: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 999,
    backgroundColor: Palette.cyan,
    justifyContent: 'center',
  },
  createText: { color: '#04131B', fontSize: 13, fontWeight: '700' },
  dim: { opacity: 0.5 },
  // Shrinks when the keyboard is up, so the sheet still fits.
  lists: { flexGrow: 0, flexShrink: 1, maxHeight: 320 },
  listsContent: { gap: 12 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 44,
  },
  menuText: { fontSize: 16, lineHeight: 22, fontWeight: '500' },
});
