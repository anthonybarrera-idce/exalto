import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { ExaltoLogo } from '@/components/ui/exalto-logo';
import { FontFamily } from '@/constants/theme';
import { useHymnals } from '@/data/hymnals';

/** Seeded art, only for hymns with no hymnal or one the app doesn't know (e.g. a stale cached hymn). */
const PALETTES: readonly (readonly [string, string, string])[] = [
  ['#0F6F95', '#04C1FF', '#EDA145'],
  ['#7A2E38', '#E0455B', '#F5A06B'],
  ['#1B4D5C', '#3FA7B5', '#F5C080'],
  ['#4A2E6B', '#B0548F', '#F5A06B'],
  ['#5C3A1E', '#C7843E', '#F5C080'],
];

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const v = m[1].length === 3 ? m[1].replace(/./g, (c) => c + c) : m[1];
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number];
}

/** RGB 0–255 → HSL (h in degrees, s/l 0–1). */
function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

function hslHex(h: number, s: number, l: number) {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  s = clamp(s); l = clamp(l); h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${[r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const cache = new Map<string, readonly [string, string]>();
/**
 * Two stops from a hymnal color using an analogous harmony: the color itself (nudged 12° back on the wheel
 * and lifted a little) to its neighbour 40° further round, a bit deeper. Grays stay gray. Same formula as
 * the admin preview (admin/src/pages/hymnals.tsx).
 */
export function hymnalGradient(color: string): readonly [string, string] | null {
  const hit = cache.get(color);
  if (hit) return hit;
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [h, s, l] = toHsl(rgb);
  const sat = s < 0.08 ? s : Math.max(s, 0.45);
  const stops = [hslHex(h - 12, sat, Math.max(l + 0.08, 0.32)), hslHex(h + 40, sat * 1.05, Math.min(l - 0.06, 0.4))] as const;
  cache.set(color, stops);
  return stops;
}

/**
 * Hymn artwork comes from the hymn's hymnal: its thumbnail image if it has one, otherwise a gradient of
 * the hymnal's color with the Exalto mark on top. Hymns with no hymnal or an unknown one get the seeded art.
 * `thumbnailUrl` / `color` override the hymnal's.
 */
export function HymnArt({
  seed,
  hymnalId,
  thumbnailUrl,
  color,
  size = 48,
  radius = 10,
  label,
  watermark,
  markScale = 0.42,
  markMax = 88,
  style,
}: {
  seed: string;
  hymnalId?: string;
  thumbnailUrl?: string;
  color?: string;
  size?: number;
  radius?: number;
  label?: string;
  /** Faint mark, for art that has text laid over it (hymn of the day). */
  watermark?: boolean;
  /** Size of the Exalto mark as a share of the art, and its cap in points. */
  markScale?: number;
  markMax?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const hymnal = useHymnals().find((h) => h.id === hymnalId);
  const url = thumbnailUrl ?? hymnal?.thumbnailUrl;
  const hymnalColors = hymnalGradient(color ?? hymnal?.color ?? '');
  const colors = hymnalColors ?? PALETTES[hash(seed) % PALETTES.length];
  // The mark goes on the hymnal gradient (not on images or the seeded art); behind a hymn number it's a faint watermark.
  const showLogo = url == null && hymnalColors != null;
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, overflow: 'hidden' }, style]}>
      {/* The gradient also stands in while the image loads (or if it fails). */}
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {url != null && (
        <Image
          source={url}
          recyclingKey={url}
          cachePolicy="memory-disk"
          contentFit="cover"
          transition={120}
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
      {showLogo && (
        <View style={[styles.center, { opacity: label != null || watermark ? 0.2 : 0.7 }]} pointerEvents="none">
          <Logo width={Math.round(Math.min(size * markScale, markMax))} />
        </View>
      )}
      {label != null && (
        <View style={styles.center}>
          <Text style={[styles.label, url != null && styles.onImage, { fontSize: Math.max(11, size * 0.3) }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
      )}
    </View>
  );
}

// Memoized so long lists don't re-parse the SVG on every render.
const Logo = memo(function Logo({ width }: { width: number }) {
  return <ExaltoLogo width={width} color="#FFFFFF" accessibilityLabel="" />;
});

const styles = StyleSheet.create({
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  label: { color: 'rgba(255,255,255,0.9)', fontFamily: FontFamily.extrabold },
  onImage: { color: '#fff', textShadowColor: 'rgba(0,0,0,0.55)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } },
});
