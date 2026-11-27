import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

/**
 * "Auto-play recordings" (off by default): when on, opening a hymn that has a recording starts playing it;
 * otherwise (or when the hymn has no recording) the lyrics open. Remembered on this device.
 */
const KEY = 'exalto.autoPlay';
let autoPlay = false;
const listeners = new Set<() => void>();

AsyncStorage.getItem(KEY)
  .then((v) => {
    if (v === '0' || v === '1') {
      autoPlay = v === '1';
      listeners.forEach((l) => l());
    }
  })
  .catch(() => {});

export const getAutoPlay = () => autoPlay;

export function setAutoPlay(on: boolean) {
  autoPlay = on;
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, on ? '1' : '0').catch(() => {});
}

export function useAutoPlay(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getAutoPlay,
    getAutoPlay,
  );
  return [value, setAutoPlay];
}
