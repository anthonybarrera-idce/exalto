import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Palette } from '@/constants/theme';

/** Round composer photo; the initial on the Figma amber gradient sits underneath, so it shows if the photo can't load. */
export function ComposerAvatar({ name, photoURL, size = 64 }: { name: string; photoURL?: string | null; size?: number }) {
  return (
    <LinearGradient
      colors={['#F5C080', '#DB8B5D', '#C0563A']}
      start={{ x: 0.2, y: 0.2 }}
      end={{ x: 1, y: 1 }}
      style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <ThemedText style={[styles.initial, { fontSize: size * 0.36, lineHeight: size * 0.46 }]}>{name.trim().charAt(0).toUpperCase() || '?'}</ThemedText>
      {photoURL ? <Image source={{ uri: photoURL }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  avatar: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  initial: { color: Palette.bg, fontWeight: '800' },
});
