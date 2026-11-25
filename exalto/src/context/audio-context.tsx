import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useReducer, useRef } from 'react';

import { useViewMode } from '@/context/view-mode-context';

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
}

/** Which recording of a hymn to play. */
export type SoundStyle = 'piano' | 'acapella';

/** The recording to play for a hymn in a style, falling back to piano when that style is missing. */
export function resolveAudioUri(hymn: Hymn, style: SoundStyle): string | undefined {
  return (style === 'acapella' && hymn.acapellaUri) || hymn.audioUri || hymn.acapellaUri;
}

interface AudioState {
  currentHymn: Hymn | null;
  queue: Hymn[];
  queueIndex: number;
  isLiked: boolean;
  isPlayerVisible: boolean;
  isExpanded: boolean;
  repeatMode: 'off' | 'one' | 'all';
  shuffleEnabled: boolean;
  soundStyle: SoundStyle;
}

type AudioAction =
  | { type: 'LOAD'; hymn: Hymn; queue: Hymn[]; queueIndex: number }
  | { type: 'TOGGLE_LIKE' }
  | { type: 'EXPAND' }
  | { type: 'COLLAPSE' }
  | { type: 'SET_REPEAT'; mode: AudioState['repeatMode'] }
  | { type: 'TOGGLE_SHUFFLE' }
  | { type: 'SET_QUEUE_INDEX'; index: number }
  | { type: 'SET_SOUND_STYLE'; style: SoundStyle };

function reducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.type) {
    case 'LOAD':
      return {
        ...state,
        currentHymn: action.hymn,
        queue: action.queue,
        queueIndex: action.queueIndex,
        isPlayerVisible: true,
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
    default:
      return state;
  }
}

const initialState: AudioState = {
  currentHymn: null,
  queue: [],
  queueIndex: 0,
  isLiked: false,
  isPlayerVisible: false,
  isExpanded: false,
  repeatMode: 'off',
  shuffleEnabled: false,
  soundStyle: 'piano',
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
  loadHymn: (hymn: Hymn, queue?: Hymn[], startIndex?: number) => void;
  skipNext: () => void;
  skipPrevious: () => void;
  expandPlayer: () => void;
  collapsePlayer: () => void;
  toggleLike: () => void;
  setRepeatMode: (mode: AudioState['repeatMode']) => void;
  toggleShuffle: () => void;
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

  const loadHymn = useCallback(
    (hymn: Hymn, queue: Hymn[] = [hymn], startIndex = 0) => {
      dispatch({ type: 'LOAD', hymn, queue, queueIndex: startIndex });
      const uri = resolveAudioUri(hymn, stateRef.current.soundStyle);
      if (uri) {
        player.replace({ uri });
        player.play();
      } else {
        // No recording yet: stop any playback and open the lyrics.
        player.pause();
        setViewMode('hymnal');
        dispatch({ type: 'EXPAND' });
      }
    },
    [player, setViewMode],
  );

  const play = useCallback(() => player.play(), [player]);
  const pause = useCallback(() => player.pause(), [player]);
  const seekTo = useCallback((secs: number) => player.seekTo(secs), [player]);

  /** Move to the next hymn in the queue. Returns false when there's nothing to move to. */
  const advance = useCallback((): boolean => {
    const { queue, queueIndex, repeatMode, shuffleEnabled } = stateRef.current;
    if (!queue.length) return false;
    let nextIndex: number;
    if (shuffleEnabled && queue.length > 1) {
      // Any hymn other than the current one.
      nextIndex = Math.floor(Math.random() * (queue.length - 1));
      if (nextIndex >= queueIndex) nextIndex += 1;
    } else if (queueIndex < queue.length - 1) {
      nextIndex = queueIndex + 1;
    } else if (repeatMode === 'all') {
      nextIndex = 0;
    } else {
      return false;
    }
    loadHymn(queue[nextIndex], queue, nextIndex);
    return true;
  }, [loadHymn]);

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
    loadHymn(queue[queueIndex - 1], queue, queueIndex - 1);
  }, [player, loadHymn]);

  // End of a hymn: repeat-one plays it again; otherwise continue through the queue.
  useEffect(() => {
    if (!status.didJustFinish) return;
    if (stateRef.current.repeatMode === 'one') {
      player.seekTo(0);
      player.play();
      return;
    }
    if (!advance()) {
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
  const toggleShuffle = useCallback(() => dispatch({ type: 'TOGGLE_SHUFFLE' }), []);

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
  };

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudioContext(): AudioContextValue {
  const ctx = useContext(AudioContext);
  if (!ctx) throw new Error('useAudioContext must be used inside AudioProvider');
  return ctx;
}
