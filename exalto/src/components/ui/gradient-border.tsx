import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { BrandGradient, Palette } from '@/constants/theme';

type Props = {
  children: ReactNode;
  radius?: number;
  width?: number;
  /** Fill inside the border. Pass an array for a vertical gradient fill. */
  fill?: string | readonly [string, string];
  colors?: readonly [string, string, ...string[]];
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
};

/** The Figma "glass" container: a 1px cyan→amber border around a warm dark fill. */
export function GradientBorder({ children, radius = 18, width = 1, fill = Palette.surface, colors = BrandGradient, style, contentStyle }: Props) {
  const inner = { borderRadius: radius - width, flex: 1 } as const;
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: radius, padding: width }, style]}>
      {typeof fill === 'string' ? (
        <View style={[inner, { backgroundColor: fill }, contentStyle]}>{children}</View>
      ) : (
        <LinearGradient colors={fill} style={[inner, contentStyle]}>
          {children}
        </LinearGradient>
      )}
    </LinearGradient>
  );
}

export const gradientStyles = StyleSheet.create({ fill: { flex: 1 } });
