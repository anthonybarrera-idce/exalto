import { GripVertical } from 'lucide-react-native';
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { Palette } from '@/constants/theme';
import { useLocale } from '@/context/locale-context';

type Props<T> = {
  data: T[];
  keyOf: (item: T, index: number) => string;
  /** Every row is this tall (spacing included), so a drag can tell where a row will land. */
  rowHeight: number;
  /** Row content after the drag handle. */
  renderRow: (item: T, index: number) => ReactNode;
  /** Accessible name of the row's handle, e.g. the hymn title. */
  labelOf: (item: T) => string;
  onMove: (from: number, to: number) => void;
};

/**
 * A short list whose rows move by dragging the grip on the left (Figma "Playlist detail" and "Queue"). Screen readers
 * get Move up / Move down actions on the same grip.
 */
export function ReorderableList<T>({ data, keyOf, rowHeight, renderRow, labelOf, onMove }: Props<T>) {
  const active = useSharedValue(-1);
  const dragY = useSharedValue(0);
  return (
    <View>
      {data.map((item, index) => (
        <Row
          key={keyOf(item, index)}
          index={index}
          count={data.length}
          rowHeight={rowHeight}
          active={active}
          dragY={dragY}
          label={labelOf(item)}
          onMove={onMove}>
          {renderRow(item, index)}
        </Row>
      ))}
    </View>
  );
}

function Row({
  index,
  count,
  rowHeight,
  active,
  dragY,
  label,
  onMove,
  children,
}: {
  index: number;
  count: number;
  rowHeight: number;
  active: SharedValue<number>;
  dragY: SharedValue<number>;
  label: string;
  onMove: (from: number, to: number) => void;
  children: ReactNode;
}) {
  const { t } = useLocale();

  const finish = (from: number, to: number) => {
    if (from !== to) onMove(from, to);
    active.value = -1;
    dragY.value = 0;
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          active.value = index;
          dragY.value = 0;
        })
        .onUpdate((e) => {
          dragY.value = e.translationY;
        })
        .onEnd(() => {
          const to = Math.min(count - 1, Math.max(0, Math.round(index + dragY.value / rowHeight)));
          runOnJS(finish)(index, to);
        })
        .onFinalize((_, success) => {
          if (!success) {
            active.value = -1;
            dragY.value = 0;
          }
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [index, count, rowHeight, onMove],
  );

  const style = useAnimatedStyle(() => {
    const a = active.value;
    if (a < 0) return { transform: [{ translateY: 0 }], zIndex: 0, opacity: 1 };
    if (a === index) return { transform: [{ translateY: dragY.value }], zIndex: 10, opacity: 0.9 };
    // Rows between where the dragged one was and where it'll land step out of its way.
    const to = Math.min(count - 1, Math.max(0, Math.round(a + dragY.value / rowHeight)));
    const shift = a < index && index <= to ? -rowHeight : a > index && index >= to ? rowHeight : 0;
    return { transform: [{ translateY: withTiming(shift, { duration: 120 }) }], zIndex: 0, opacity: 1 };
  });

  return (
    <Animated.View style={[styles.row, { height: rowHeight }, style]}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.handle}
          hitSlop={8}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('playlists.reorder', { title: label })}
          accessibilityActions={[
            { name: 'increment', label: t('playlists.moveDown') },
            { name: 'decrement', label: t('playlists.moveUp') },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'increment' && index < count - 1) onMove(index, index + 1);
            if (e.nativeEvent.actionName === 'decrement' && index > 0) onMove(index, index - 1);
          }}>
          <GripVertical size={14} color={Palette.muted} />
        </View>
      </GestureDetector>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  // Wide enough to grab; `touchAction` keeps the browser from scrolling while dragging on web.
  handle: { width: 22, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', touchAction: 'none' } as object,
});
