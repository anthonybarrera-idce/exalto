import { ArrowDown, ArrowUp, ClipboardPaste, MoreVertical, Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { AccountColors, PageHeader, PillButton } from '@/components/account/ui';
import { ThemedText } from '@/components/themed-text';
import { FontFamily, Palette, Spacing } from '@/constants/theme';
import type { LyricSection } from '@/context/audio-context';
import { useLocale } from '@/context/locale-context';
import { numberVerses, splitLyrics } from '@/lib/editing';

type Block = { key: string; type: LyricSection['type']; text: string };
let nextKey = 0;
const toBlocks = (lyrics: LyricSection[]): Block[] => lyrics.map((s) => ({ key: String(nextKey++), type: s.type, text: s.lines.join('\n') }));
const toLyrics = (blocks: Block[]): LyricSection[] =>
  numberVerses(blocks.map((b) => ({ type: b.type, lines: b.text.split('\n').map((l) => l.trim()).filter(Boolean) }))).filter((s) => s.lines.length);

/** Figma "Lyrics editor": verse, chorus and bridge blocks, so community hymns display like the hymn book. */
export function LyricsEditor({
  lyrics,
  repeatChorus,
  onDone,
}: {
  lyrics: LyricSection[];
  repeatChorus: boolean;
  onDone: (lyrics: LyricSection[], repeatChorus: boolean) => void;
}) {
  const { t } = useLocale();
  const [blocks, setBlocks] = useState<Block[]>(() => toBlocks(lyrics));
  const [repeat, setRepeat] = useState(repeatChorus);
  const [focused, setFocused] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [paste, setPaste] = useState<string | null>(null);

  const typeLabel = (type: Block['type']) => (type === 'chorus' ? t('lyrics.chorus') : type === 'bridge' ? t('lyrics.bridge') : t('lyrics.typeVerse'));
  const add = (type: Block['type']) => {
    const key = String(nextKey++);
    setBlocks((b) => [...b, { key, type, text: '' }]);
    setFocused(key);
  };
  const update = (key: string, patch: Partial<Block>) => setBlocks((b) => b.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const move = (key: string, dir: -1 | 1) =>
    setBlocks((b) => {
      const i = b.findIndex((x) => x.key === key);
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const next = [...b];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  // Headings like "ESTROFA 1" / "CORO", numbered as the app will show them.
  let verse = 0;
  const headings = blocks.map((b) => (b.type === 'verse' ? `${typeLabel('verse')} ${++verse}` : typeLabel(b.type)).toUpperCase());

  if (paste !== null) {
    return (
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <PageHeader title={t('lyrics.paste')} onBack={() => setPaste(null)} backLabel={t('account.back')} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ThemedText style={styles.muted}>{t('lyrics.pasteHint')}</ThemedText>
          <TextInput value={paste} onChangeText={setPaste} multiline autoFocus style={[styles.input, styles.pasteBox]} selectionColor={Palette.cyan} />
          <PillButton
            label={t('lyrics.pasteApply')}
            disabled={!paste.trim()}
            onPress={() => {
              setBlocks(toBlocks(splitLyrics(paste)));
              setPaste(null);
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <PageHeader
        title={t('edit.lyrics')}
        onBack={() => onDone(toLyrics(blocks), repeat)}
        backLabel={t('account.back')}
        right={
          <Pressable onPress={() => onDone(toLyrics(blocks), repeat)} hitSlop={10} accessibilityRole="button">
            <ThemedText style={styles.done}>{t('settings.done')}</ThemedText>
          </Pressable>
        }
      />
      <View style={styles.toolbar}>
        {(['verse', 'chorus', 'bridge'] as const).map((type, i) => (
          <Pressable key={type} onPress={() => add(type)} style={[styles.pill, i === 0 && styles.pillCyan]} accessibilityRole="button">
            <ThemedText style={[styles.pillText, i === 0 && styles.pillTextCyan]}>{typeLabel(type)}</ThemedText>
          </Pressable>
        ))}
        <View style={styles.flex} />
        <Pressable onPress={() => setPaste('')} hitSlop={8} style={styles.pasteLink} accessibilityRole="button">
          <ClipboardPaste size={14} color={Palette.muted} />
          <ThemedText style={styles.muted}>{t('lyrics.paste')}</ThemedText>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {blocks.map((b, i) => {
          const on = focused === b.key;
          return (
            <View key={b.key} style={[styles.block, on && styles.blockOn]}>
              <View style={styles.blockHead}>
                <ThemedText style={[styles.heading, { color: b.type === 'chorus' ? Palette.cyan : b.type === 'bridge' ? Palette.orange : Palette.amber }]}>
                  {headings[i]}
                </ThemedText>
                <Pressable onPress={() => setMenu(menu === b.key ? null : b.key)} hitSlop={10} accessibilityRole="button" accessibilityLabel={headings[i]}>
                  <MoreVertical size={16} color={Palette.muted} />
                </Pressable>
              </View>
              {menu === b.key && (
                <View style={styles.menu}>
                  {(['verse', 'chorus', 'bridge'] as const)
                    .filter((type) => type !== b.type)
                    .map((type) => (
                      <MenuItem key={type} label={t('lyrics.changeType', { type: typeLabel(type) })} onPress={() => (update(b.key, { type }), setMenu(null))} />
                    ))}
                  {i > 0 && <MenuItem Icon={ArrowUp} label={t('lyrics.moveUp')} onPress={() => (move(b.key, -1), setMenu(null))} />}
                  {i < blocks.length - 1 && <MenuItem Icon={ArrowDown} label={t('lyrics.moveDown')} onPress={() => (move(b.key, 1), setMenu(null))} />}
                  <MenuItem Icon={Trash2} danger label={t('lyrics.remove')} onPress={() => setBlocks((x) => x.filter((y) => y.key !== b.key))} />
                </View>
              )}
              <TextInput
                value={b.text}
                onChangeText={(text) => update(b.key, { text })}
                onFocus={() => setFocused(b.key)}
                onBlur={() => setFocused((f) => (f === b.key ? null : f))}
                autoFocus={on && !b.text}
                multiline
                placeholder={t('lyrics.linesPlaceholder')}
                placeholderTextColor={Palette.muted}
                selectionColor={Palette.cyan}
                style={styles.input}
              />
            </View>
          );
        })}
        <Pressable onPress={() => add('verse')} style={styles.addBlock} accessibilityRole="button">
          <Plus size={16} color={Palette.cyan} />
          <ThemedText style={styles.addText}>{t('lyrics.addBlock')}</ThemedText>
        </Pressable>
        <View style={styles.repeat}>
          <ThemedText style={[styles.muted, styles.flex]}>{t('lyrics.repeatChorus')}</ThemedText>
          <Switch value={repeat} onValueChange={setRepeat} trackColor={{ false: Palette.pill, true: Palette.cyan }} thumbColor={Palette.text} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MenuItem({ label, onPress, Icon, danger }: { label: string; onPress: () => void; Icon?: typeof Trash2; danger?: boolean }) {
  const color = danger ? AccountColors.danger : Palette.text;
  return (
    <Pressable onPress={onPress} style={styles.menuItem} accessibilityRole="menuitem">
      {Icon ? <Icon size={14} color={color} /> : null}
      <ThemedText style={[styles.menuText, { color }]}>{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  done: { color: Palette.cyan, fontSize: 16, lineHeight: 22, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 22, paddingBottom: Spacing.two },
  pill: { height: 32, paddingHorizontal: 14, borderRadius: 999, backgroundColor: Palette.pill, justifyContent: 'center' },
  pillCyan: { backgroundColor: Palette.cyan },
  pillText: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  pillTextCyan: { color: '#04131B' },
  pasteLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  content: { gap: 12, paddingHorizontal: 22, paddingBottom: Spacing.five },
  muted: { color: Palette.muted, fontSize: 13, lineHeight: 18 },
  block: { backgroundColor: Palette.surface, borderRadius: 14, borderWidth: 1, borderColor: Palette.line, padding: 12, gap: 6 },
  blockOn: { borderColor: Palette.cyan },
  blockHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 0.8 },
  input: { color: Palette.text, fontSize: 15, lineHeight: 22, fontFamily: FontFamily.regular, minHeight: 44, padding: 0, textAlignVertical: 'top' },
  pasteBox: { minHeight: 240, borderRadius: 10, borderWidth: 1, borderColor: AccountColors.fieldBorder, backgroundColor: Palette.field, padding: 12 },
  menu: { backgroundColor: Palette.surface2, borderRadius: 10, paddingVertical: 4 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  menuText: { fontSize: 14, lineHeight: 18 },
  addBlock: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 14, borderWidth: 1, borderColor: Palette.line, backgroundColor: Palette.surface },
  addText: { color: Palette.cyan, fontSize: 14, lineHeight: 18, fontWeight: '700' },
  repeat: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
});
