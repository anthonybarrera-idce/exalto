import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BrandGradient, FontFamily, Palette, Spacing } from '@/constants/theme';

/** Exalto's account colors from the Figma screens. */
export const AccountColors = {
  fieldBorder: '#8A7E72',
  danger: '#F08A6B',
  dangerSoft: 'rgba(240,138,107,0.2)',
  onCyan: '#04131B',
} as const;

export function initialsOf(name?: string | null) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase() || '?';
}

/** Round avatar: the photo if there is one, else initials on the Exalto blue gradient. */
export function Avatar({ name, photoURL, size }: { name?: string | null; photoURL?: string | null; size: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (photoURL) return <Image source={{ uri: photoURL }} style={box} contentFit="cover" accessibilityIgnoresInvertColors />;
  return (
    <LinearGradient colors={['#7FDCFF', Palette.cyan, '#0F6F95']} start={{ x: 0.2, y: 0.1 }} end={{ x: 0.9, y: 1 }} style={[box, styles.center]}>
      <ThemedText style={{ color: Palette.bg, fontSize: size * 0.34, lineHeight: size * 0.5, fontWeight: '800' }}>{initialsOf(name)}</ThemedText>
    </LinearGradient>
  );
}

export function PageHeader({ title, onBack, backLabel, right, color = Palette.text }: { title?: string; onBack?: () => void; backLabel?: string; right?: React.ReactNode; color?: string }) {
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={backLabel}>
          <ChevronLeft size={22} color={color} />
        </Pressable>
      )}
      <ThemedText style={[styles.headerTitle, { color }]} numberOfLines={1}>
        {title ?? ''}
      </ThemedText>
      {right}
    </View>
  );
}

export function Field({
  label,
  hint,
  prefix,
  trailing,
  ...input
}: TextInputProps & { label: React.ReactNode; hint?: string; prefix?: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <ThemedText style={styles.label}>{label}</ThemedText>
      <View style={styles.inputBox}>
        {prefix && <ThemedText style={styles.prefix}>{prefix}</ThemedText>}
        <TextInput placeholderTextColor={Palette.muted} selectionColor={Palette.cyan} style={styles.input} {...input} />
        {trailing}
      </View>
      {hint ? <ThemedText style={styles.hint}>{hint}</ThemedText> : null}
    </View>
  );
}

type ButtonKind = 'primary' | 'cream' | 'outline' | 'glass' | 'danger';

export function PillButton({
  label,
  onPress,
  kind = 'primary',
  icon,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
}) {
  const fg = kind === 'primary' ? AccountColors.onCyan : kind === 'glass' ? '#FFFFFF' : kind === 'outline' ? Palette.text : Palette.bg;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      style={({ pressed }) => [styles.button, buttonStyles[kind], (pressed || disabled) && styles.dim]}>
      {busy ? <ActivityIndicator color={fg} /> : icon}
      <ThemedText style={[styles.buttonText, { color: fg }]}>{label}</ThemedText>
    </Pressable>
  );
}

export function Message({ text, tone = 'error' }: { text?: string | null; tone?: 'error' | 'info' }) {
  if (!text) return null;
  return (
    <ThemedText accessibilityLiveRegion="polite" style={[styles.message, { color: tone === 'error' ? AccountColors.danger : Palette.muted }]}>
      {text}
    </ThemedText>
  );
}

const buttonStyles = StyleSheet.create({
  primary: { backgroundColor: Palette.cyan },
  cream: { backgroundColor: Palette.text },
  outline: { borderWidth: 1, borderColor: Palette.line },
  /** For colorful backgrounds: a translucent dark fill with a light hairline. */
  glass: { borderWidth: 1, borderColor: 'rgba(240,224,209,0.35)', backgroundColor: 'rgba(26,18,10,0.35)' },
  danger: { backgroundColor: AccountColors.danger },
});

export const accountStyles = StyleSheet.create({
  card: { backgroundColor: Palette.surface, borderRadius: 16, borderWidth: 1, borderColor: Palette.line, padding: 12 },
  section: { color: Palette.muted, fontSize: 12, lineHeight: 16, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: Spacing.two },
});

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 22, paddingTop: Spacing.three, paddingBottom: 10, minHeight: 56 },
  headerTitle: { flex: 1, color: Palette.text, fontSize: 20, lineHeight: 28, fontWeight: '800' },
  field: { gap: 5 },
  label: { color: Palette.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: AccountColors.fieldBorder,
    backgroundColor: Palette.field,
  },
  prefix: { color: Palette.muted, fontSize: 15 },
  input: { flex: 1, color: Palette.text, fontSize: 15, fontFamily: FontFamily.regular, paddingVertical: 10 },
  hint: { color: Palette.muted, fontSize: 12, lineHeight: 16 },
  button: { flexDirection: 'row', gap: 8, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.three },
  buttonText: { fontSize: 15, lineHeight: 20, fontWeight: '700' },
  dim: { opacity: 0.6 },
  message: { fontSize: 13, lineHeight: 18 },
});
