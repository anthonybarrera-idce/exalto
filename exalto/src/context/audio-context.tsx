import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';

import { useViewMode } from '@/context/view-mode-context';
import { getAutoPlay } from '@/lib/playback-settings';

export interface LyricSection {
  type: 'verse' | 'chorus' | 'bridge';
  number?: number;
  lines: string[];
}

export interface Hymn {
  id: string;
  title: string;
  artist: string;
  hymnNumber?: number;
  /** Display number when it isn't a plain integer, e.g. "17B". */
  label?: string;
  hymnalId?: string;
  artworkColor?: string;
  artworkUri?: string;
  /** Hymns from the hymnal may have no recording yet; they open as lyrics. This is the piano recording. */
  audioUri?: string;
  /** Optional a cappella (voices only) recording of the same hymn. */
  acapellaUri?: string;
  lyrics?: LyricSection[];
  /** practice.json from Hymn Studio: notes the Practice screen draws and plays on the phone. */
  practice?: { url: string; version: number };
  /** The composer who uploaded it (community hymns), for their composer profile. */
  ownerUid?: string;
}

/** Which recording of a hymn to play. */
export type SoundStyle = 'piano' | 'acapella';

/** Whether a hymn has any recording to play. */
export const hasRecording = (hymn: Hymn) => !!(hymn.audioUri || hymn.acapellaUri);

/** The recording to play for a hymn in a style, falling back to piano when that style is missing. */
export function resolveAudioUri(hymn: Hymn, style: SoundStyle): string | undefined {
  return (style === 'acapella' && hymn.acapellaUri) || hymn.audioUri || hymn.acapellaUri;
}

interface AudioState {
  currentHymn: Hymn | null;
  queue: Hymn[];
  queueIndex: number;
  /** The queue in its own order while shuffle is on, so turning shuffle off puts it back. */
  unshuffled: Hymn[] | null;
  isLiked: boolean;
  isPlayerVisible: boolean;
  isExpanded: boolean;
  repeatMode: 'off' | 'one' | 'all';
  shuffleEnabled: boolean;
  soundStyle: SoundStyle;
  isQueueOpen: boolean;
}

type AudioAction =
  | { type: 'LOAD'; hymn: Hymn; queue: Hymn[]; queueIndex: number; unshuffled?: Hymn[] | null; shuffle?: boolean }
  | { type: 'SET_QUEUE'; queue: Hymn[]; queueIndex: number; unshuffled?: Hymn[] | null; shuffle?: boolean }
  | { type: 'TOGGLE_LIKE' }
  | { type: 'EXPAND' }
  | { type: 'COLLAPSE' }
  | { type: 'SET_REPEAT'; mode: AudioState['repeatMode'] }
  | { type: 'TOGGLE_SHUFFLE' }
  | { type: 'SET_QUEUE_INDEX'; index: number }
  | { type: 'SET_SOUND_STYLE'; style: SoundStyle }
  | { type: 'SET_QUEUE_OPEN'; open: boolean };

function reducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        currentHymn: action.hymn,
        queue: action.queue,
        queueIndex: action.queueIndex,
        unshuffled: action.unshuffled === undefined ? state.unshuffled : action.unshuffled,
        shuffleEnabled: action.shuffle ?? state.shuffleEnabled,
        isPlayerVisible: true,
      };
    case 'SET_QUEUE':
      return {
        ...state,
        queue: action.queue,
        queueIndex: action.queueIndex,
        unshuffled: action.unshuffled === undefined ? state.unshuffled : action.unshuffled,
        shuffleEnabled: action.shuffle ?? state.shuffleEnabled,
      };
    case 'TOGGLE_LIKE':
      return { ...state, isLiked: !state.isLiked };
    case 'EXPAND':
      return { ...state, isExpanded: true };
    case 'COLLAPSE':
      return { ...state, isExpanded: false };
    case 'SET_REPEAT':
      return { ...state, repeatMode: action.mode };
    case 'TOGGLE_SHUFFLE':
      return { ...state, shuffleEnabled: !state.shuffleEnabled };
    case 'SET_QUEUE_INDEX':
      return { ...state, queueIndex: action.index };
    case 'SET_SOUND_STYLE':
      return { ...state, soundStyle: action.style };
    case 'SET_QUEUE_OPEN':
      return { ...state, isQueueOpen: action.open };
    default:
      return state;
  }
}

const initialState: AudioState = {
  currentHymn: null,
  queue: [],
  queueIndex: 0,
  unshuffled: null,
  isLiked: false,
  isPlayerVisible: false,
  isExpanded: false,
  repeatMode: 'off',
  shuffleEnabled: false,
  soundStyle: 'piano',
  isQueueOpen: false,
};

interface AudioContextValue {
  currentHymn: Hymn | null;
  queue: Hymn[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  positionSecs: number;
  durationSecs: number;
  isLiked: boolean;
  isPlayerVisible: boolean;
  isExpanded: boolean;
  repeatMode: AudioState['repeatMode'];
  shuffleEnabled: boolean;
  /** The listener's preferred recording. */
  soundStyle: SoundStyle;
  /** The recording actually playing (piano when the hymn has no a cappella one). */
  activeSoundStyle: SoundStyle;
  setSoundStyle: (style: SoundStyle) => void;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => Promise<void>;
  /** Open a hymn: plays it if `play` (or, when omitted, the auto-play setting) and it has a recording; else opens the lyrics. */
  loadHymn: (hymn: Hymn, queue?: Hymn[], startIndex?: number, opts?: { play?: boolean }) => void;
  skipNext: () => void;
  skipPrevious: () => void;
  expandPlayer: () => void;
  collapsePlayer: () => void;
  toggleLike: () => void;
  setRepeatMode: (mode: AudioState['repeatMode']) => void;
  toggleShuffle: () => void;
  /** Play a list from the start (shuffled when asked): only hymns with a recording; lyrics of the first when none has one. */
  playAll: (hymns: Hymn[], opts?: { shuffle?: boolean }) => void;
  /** Jump to a hymn in the queue; it plays (it was picked from Up Next). */
  jumpTo: (index: number) => void;
  /** Remove an upcoming hymn from the queue. */
  removeFromQueue: (index: number) => void;
  /** Move a queued hymn to another position (both indexes in `queue`, after the current hymn). */
  moveInQueue: (from: number, to: number) => void;
  /** Put a hymn right after the current one. */
  playNext: (hymn: Hymn) => void;
  /** Put a hymn at the end of the queue. */
  addToQueue: (hymn: Hymn) => void;
  /** Drop everything after the current hymn. */
  clearQueue: () => void;
  isQueueOpen: boolean;
  openQueue: () => void;
  closeQueue: () => void;
}

/** A copy of `list` in random order. */
function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `current` first, then the rest of `queue` (all but the one at `index`) shuffled. */
function shuffleAround(queue: Hymn[], index: number): Hymn[] {
  return [queue[index], ...shuffled(queue.filter((_, i) => i !== index))];
}

/**
 * The queue's own order to go back to when shuffle is turned off: the unshuffled list, keeping only what is still
 * queued (removals while shuffled stick), with hymns added while shuffled at the end in the order they're queued.
 */
function restoreOrder(unshuffled: Hymn[], queue: Hymn[]): Hymn[] {
  const left = new Map<string, number>();
  for (const h of queue) left.set(h.id, (left.get(h.id) ?? 0) + 1);
  const kept: Hymn[] = [];
  for (const h of unshuffled) {
    const n = left.get(h.id) ?? 0;
    if (n > 0) {
      kept.push(h);
      left.set(h.id, n - 1);
    }
  }
  const added: Hymn[] = [];
  for (const h of queue) {
    const n = left.get(h.id) ?? 0;
    if (n > 0) {
      added.push(h);
      left.set(h.id, n - 1);
    }
  }
  return [...kept, ...added];
}

const AudioContext = createContext<AudioContextValue | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const player = useAudioPlayer(null, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);
  const { setViewMode } = useViewMode();
  // Callbacks read the latest state through refs, so they stay stable between status ticks.
  const stateRef = useRef(state);
  stateRef.current = state;
  const positionRef = useRef(0);
  positionRef.current = status.currentTime;

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
  }, []);

  /** Open the hymn at `index` of `queue` as is (moving through the queue; no reshuffle). */
  const openAt = useCallback(
    (
      queue: Hymn[],
      startIndex: number,
      opts: { play?: boolean } = {},
      extra: { unshuffled?: Hymn[] | null; shuffle?: boolean } = {},
    ) => {
      const hymn = queue[startIndex];
      dispatch({ type: 'LOAD', hymn, queue, queueIndex: startIndex, ...extra });
      const uri = resolveAudioUri(hymn, stateRef.current.soundStyle);
      // Play when asked (the play button, or continuing through a queue), otherwise follow the
      // "Auto-play recordings" setting. Hymns without a recording always open their lyrics.
      const play = !!uri && (opts.play ?? getAutoPlay());
      if (uri) player.replace({ uri });
      if (play) {
        setViewMode('audio');
        player.play();
      } else {
        player.pause();
        setViewMode('hymnal');
        dispatch({ type: 'EXPAND' });
      }
    },
    [player, setViewMode],
  );

  const loadHymn = useCallback(
    (hymn: Hymn, queue: Hymn[] = [hymn], startIndex = 0, opts: { play?: boolean } = {}) => {
      const index = queue[startIndex] === hymn ? startIndex : Math.max(0, queue.indexOf(hymn));
      const list = queue[index] === hymn ? queue : [hymn];
      const at = queue[index] === hymn ? index : 0;
      // With shuffle on, a newly opened list plays the picked hymn first and the rest in random order.
      if (stateRef.current.shuffleEnabled && list.length > 1) {
        openAt(shuffleAround(list, at), 0, opts, { unshuffled: list });
      } else {
        openAt(list, at, opts, { unshuffled: null });
      }
    },
    [openAt],
  );

  const playAll = useCallback(
    (hymns: Hymn[], opts: { shuffle?: boolean } = {}) => {
      if (!hymns.length) return;
      const playable = hymns.filter(hasRecording);
      // Nothing to listen to: open the first hymn's lyrics, with the list to page through.
      if (!playable.length) {
        openAt(hymns, 0, { play: false }, { unshuffled: null, shuffle: false });
        return;
      }
      if (opts.shuffle) {
        const start = Math.floor(Math.random() * playable.length);
        openAt(shuffleAround(playable, start), 0, { play: true }, { unshuffled: playable, shuffle: true });
      } else {
        // "Play all" plays in order, so it turns shuffle off.
        openAt(playable, 0, { play: true }, { unshuffled: null, shuffle: false });
      }
    },
    [openAt],
  );

  const play = useCallback(() => player.play(), [player]);
  const pause = useCallback(() => player.pause(), [player]);
  const seekTo = useCallback((secs: number) => player.seekTo(secs), [player]);

  /** Move to the next hymn in the queue. Returns false when there's nothing to move to. */
  const advance = useCallback((keepPlaying = false): boolean => {
    // Shuffle reorders the queue itself (see toggleShuffle), so Up Next always shows what plays next.
    const { queue, queueIndex, repeatMode } = stateRef.current;
    if (!queue.length) return false;
    let nextIndex: number;
    if (queueIndex < queue.length - 1) {
      nextIndex = queueIndex + 1;
    } else if (repeatMode === 'all') {
      nextIndex = 0;
    } else {
      return false;
    }
    openAt(queue, nextIndex, { play: keepPlaying || player.playing || undefined });
    return true;
  }, [openAt, player]);

  const skipNext = useCallback(() => {
    advance();
  }, [advance]);

  const skipPrevious = useCallback(() => {
    const { queue, queueIndex } = stateRef.current;
    if (!queue.length) return;
    if (positionRef.current > 3 || queueIndex === 0) {
      player.seekTo(0);
      return;
    }
    openAt(queue, queueIndex - 1, { play: player.playing || undefined });
  }, [player, openAt]);

  // End of a hymn: repeat-one plays it again; otherwise continue through the queue.
  useEffect(() => {
    if (!status.didJustFinish) return;
    if (stateRef.current.repeatMode === 'one') {
      player.seekTo(0);
      player.play();
      return;
    }
    // The hymn played to its end, so the queue keeps playing.
    if (!advance(true)) {
      player.pause();
      player.seekTo(0);
    }
  }, [status.didJustFinish, advance, player]);

  const setSoundStyle = useCallback(
    (style: SoundStyle) => {
      const { currentHymn, soundStyle } = stateRef.current;
      if (style === soundStyle) return;
      dispatch({ type: 'SET_SOUND_STYLE', style });
      if (!currentHymn) return;
      const prevUri = resolveAudioUri(currentHymn, soundStyle);
      const nextUri = resolveAudioUri(currentHymn, style);
      if (!nextUri || prevUri === nextUri) return;
      // Two recordings don't line up note for note, so the hymn restarts in the new style,
      // keeping play/pause as it was.
      const wasPlaying = player.playing;
      player.replace({ uri: nextUri });
      if (wasPlaying) player.play();
    },
    [player],
  );

  const expandPlayer = useCallback(() => dispatch({ type: 'EXPAND' }), []);
  const collapsePlayer = useCallback(() => dispatch({ type: 'COLLAPSE' }), []);
  const toggleLike = useCallback(() => dispatch({ type: 'TOGGLE_LIKE' }), []);
  const setRepeatMode = useCallback(
    (mode: AudioState['repeatMode']) => dispatch({ type: 'SET_REPEAT', mode }),
    [],
  );
  const toggleShuffle = useCallback(() => {
    const { queue, queueIndex, shuffleEnabled, unshuffled } = stateRef.current;
    if (!shuffleEnabled) {
      // Current hymn stays and plays on; everything else follows in random order.
      if (queue.length > 1) {
        dispatch({ type: 'SET_QUEUE', queue: shuffleAround(queue, queueIndex), queueIndex: 0, unshuffled: queue, shuffle: true });
      } else dispatch({ type: 'TOGGLE_SHUFFLE' });
      return;
    }
    const current = queue[queueIndex];
    const restored = unshuffled ? restoreOrder(unshuffled, queue) : queue;
    const at = current ? restored.indexOf(current) : 0;
    dispatch({ type: 'SET_QUEUE', queue: restored, queueIndex: Math.max(0, at), unshuffled: null, shuffle: false });
  }, []);

  const setQueue = useCallback((queue: Hymn[], queueIndex: number) => dispatch({ type: 'SET_QUEUE', queue, queueIndex }), []);

  const jumpTo = useCallback(
    (index: number) => {
      const { queue } = stateRef.current;
      if (index < 0 || index >= queue.length) return;
      openAt(queue, index, { play: true });
    },
    [openAt],
  );

  const removeFromQueue = useCallback(
    (index: number) => {
      const { queue, queueIndex } = stateRef.current;
      if (index === queueIndex || index < 0 || index >= queue.length) return;
      setQueue(
        queue.filter((_, i) => i !== index),
        index < queueIndex ? queueIndex - 1 : queueIndex,
      );
    },
    [setQueue],
  );

  const moveInQueue = useCallback(
    (from: number, to: number) => {
      const { queue, queueIndex } = stateRef.current;
      if (from === to || from === queueIndex || from < 0 || from >= queue.length) return;
      const next = [...queue];
      const [item] = next.splice(from, 1);
      next.splice(Math.min(Math.max(to, 0), next.length), 0, item);
      const current = queue[queueIndex];
      setQueue(next, next.indexOf(current));
    },
    [setQueue],
  );

  const playNext = useCallback(
    (hymn: Hymn) => {
      const { queue, queueIndex, currentHymn } = stateRef.current;
      // Nothing open yet: the hymn starts a new queue.
      if (!currentHymn || !queue.length) return loadHymn(hymn, [hymn], 0);
      setQueue([...queue.slice(0, queueIndex + 1), hymn, ...queue.slice(queueIndex + 1)], queueIndex);
    },
    [loadHymn, setQueue],
  );

  const addToQueue = useCallback(
    (hymn: Hymn) => {
      const { queue, queueIndex, currentHymn } = stateRef.current;
      if (!currentHymn || !queue.length) return loadHymn(hymn, [hymn], 0);
      setQueue([...queue, hymn], queueIndex);
    },
    [loadHymn, setQueue],
  );

  const clearQueue = useCallback(() => {
    const { queue, queueIndex } = stateRef.current;
    const current = queue[queueIndex];
    if (!current) return;
    dispatch({ type: 'SET_QUEUE', queue: [current], queueIndex: 0, unshuffled: stateRef.current.unshuffled ? [current] : null });
  }, []);

  const openQueue = useCallback(() => dispatch({ type: 'SET_QUEUE_OPEN', open: true }), []);
  const closeQueue = useCallback(() => dispatch({ type: 'SET_QUEUE_OPEN', open: false }), []);

  const value: AudioContextValue = {
    currentHymn: state.currentHymn,
    queue: state.queue,
    queueIndex: state.queueIndex,
    isPlaying: status.playing,
    isLoading: status.isBuffering || !status.isLoaded,
    positionSecs: status.currentTime,
    durationSecs: status.duration,
    isLiked: state.isLiked,
    isPlayerVisible: state.isPlayerVisible,
    isExpanded: state.isExpanded,
    repeatMode: state.repeatMode,
    shuffleEnabled: state.shuffleEnabled,
    soundStyle: state.soundStyle,
    activeSoundStyle: state.soundStyle === 'acapella' && state.currentHymn?.acapellaUri ? 'acapella' : 'piano',
    setSoundStyle,
    play,
    pause,
    seekTo,
    loadHymn,
    skipNext,
    skipPrevious,
    expandPlayer,
    collapsePlayer,
    toggleLike,
    setRepeatMode,
    toggleShuffle,
    playAll,
    jumpTo,
    removeFromQueue,
    moveInQueue,
    playNext,
    addToQueue,
    clearQueue,
    isQueueOpen: state.isQueueOpen,
    openQueue,
    closeQueue,
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudioContext(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudioContext must be used inside AudioProvider');
  return ctx;
}
