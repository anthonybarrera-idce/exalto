import { AudioLines, X } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ReorderableList } from '@/components/playlists/ReorderableList';
import { BottomSheet, HymnLine, listStyles } from '@/components/playlists/ui';
import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';
import type { Hymn } from '@/context/audio-context';
import { useLocale } from '@/context/locale-context';
import { useAudio } from '@/hooks/use-audio';

const ROW_HEIGHT = 52;

/** Keys that stay with a row when it moves, even when the same hymn is queued twice. */
function rowKeys(list: Hymn[]): string[] {
  const seen = new Map<string, number>();
  return list.map((h) => {
    const n = seen.get(h.id) ?? 0;
    seen.set(h.id, n + 1);
    return `${h.id}#${n}`;
  });
}

/** Figma "Queue": opens from the player's Queue pill. Shows what plays next; reorder, remove, jump or clear. */
export function QueueSheet() {
  const { t } = useLocale();
  const { isQueueOpen, closeQueue, queue, queueIndex, currentHymn, isPlaying, jumpTo, removeFromQueue, moveInQueue, clearQueue, repeatMode } = useAudio();
  const upcoming = queue.slice(queueIndex + 1);
  // With repeat all, the queue starts over after the last hymn.
  const wrapped = repeatMode === 'all' ? queue.slice(0, queueIndex) : [];
  const keys = rowKeys(upcoming);
  const base = queueIndex + 1;

  return (
    <BottomSheet visible={isQueueOpen && !!currentHymn} onClose={closeQueue} closeLabel={t('queue.close')} tall>
      <View style={styles.titleRow}>
        <ThemedText style={styles.title} accessibilityRole="header">
          {t('queue.title')}
        </ThemedText>
        {upcoming.length ? (
          <Pressable onPress={clearQueue} style={styles.clear} accessibilityRole="button">
            <ThemedText style={styles.clearText}>{t('queue.clear')}</ThemedText>
          </Pressable>
        ) : null}
      </View>

      <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
        {currentHymn ? (
          <>
            <ThemedText style={listStyles.overline}>{t('queue.nowPlaying')}</ThemedText>
            <View style={styles.nowRow}>
              <HymnLine hymn={currentHymn} size={54} highlight />
              {isPlaying ? <AudioLines size={18} color={Palette.cyan} /> : null}
            </View>
          </>
        ) : null}

        <ThemedText style={listStyles.overline}>{t('queue.next')}</ThemedText>
        {upcoming.length ? (
          <ReorderableList
            data={upcoming}
            keyOf={(_, i) => keys[i]}
            rowHeight={ROW_HEIGHT}
            labelOf={(h) => h.title}
            onMove={(from, to) => moveInQueue(base + from, base + to)}
            renderRow={(h, i) => (
              <>
                <HymnLine hymn={h} onPress={() => jumpTo(base + i)} />
                <Pressable onPress={() => removeFromQueue(base + i)} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('queue.remove', { title: h.title })}>
                  <X size={16} color={Palette.muted} />
                </Pressable>
              </>
            )}
          />
        ) : (
          <ThemedText style={listStyles.sub}>{t('queue.empty')}</ThemedText>
        )}

        {wrapped.length ? (
          <View style={styles.wrapped}>
            {wrapped.map((h, i) => (
              <View key={`${h.id}@${i}`} style={styles.wrappedRow}>
                <HymnLine hymn={h} onPress={() => jumpTo(i)} />
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { flex: 1, color: Palette.text, fontSize: 18, lineHeight: 26, fontWeight: '800' },
  clear: { borderWidth: 1, borderColor: Palette.line, borderRadius: 999, height: 30, paddingHorizontal: 13, justifyContent: 'center' },
  clearText: { color: Palette.text, fontSize: 13, fontWeight: '700' },
  content: { gap: 12, paddingBottom: 12 },
  nowRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wrapped: { gap: 12, opacity: 0.6, paddingLeft: 32 },
  wrappedRow: { flexDirection: 'row', height: 40 },
});
