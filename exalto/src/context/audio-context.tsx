import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createContext, useCallback, useContext, useEffect, useReducer } from 'react';

export interface Hymn {
  id: string;
  title: string;
  artist: string;
  hymnNumber?: number;
  artworkColor?: string;
  artworkUri?: string;
  audioUri: string;
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
}

type AudioAction =
  | { type: 'LOAD'; hymn: Hymn; queue: Hymn[]; queueIndex: number }
  | { type: 'TOGGLE_LIKE' }
  | { type: 'EXPAND' }
  | { type: 'COLLAPSE' }
  | { type: 'SET_REPEAT'; mode: AudioState['repeatMode'] }
  | { type: 'TOGGLE_SHUFFLE' }
  | { type: 'SET_QUEUE_INDEX'; index: number };

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

  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
  }, []);

  const loadHymn = useCallback(
    (hymn: Hymn, queue: Hymn[] = [hymn], startIndex = 0) => {
      player.replace({ uri: hymn.audioUri });
      player.play();
      dispatch({ type: 'LOAD', hymn, queue, queueIndex: startIndex });
    },
    [player],
  );

  const play = useCallback(() => player.play(), [player]);
  const pause = useCallback(() => player.pause(), [player]);
  const seekTo = useCallback((secs: number) => player.seekTo(secs), [player]);

  const skipNext = useCallback(() => {
    const { queue, queueIndex, repeatMode, shuffleEnabled } = state;
    if (!queue.length) return;
    let nextIndex: number;
    if (shuffleEnabled) {
      nextIndex = Math.floor(Math.random() * queue.length);
    } else if (queueIndex < queue.length - 1) {
      nextIndex = queueIndex + 1;
    } else if (repeatMode === 'all') {
      nextIndex = 0;
    } else {
      return;
    }
    const nextHymn = queue[nextIndex];
    player.replace({ uri: nextHymn.audioUri });
    player.play();
    dispatch({ type: 'LOAD', hymn: nextHymn, queue, queueIndex: nextIndex });
  }, [state, player]);

  const skipPrevious = useCallback(() => {
    const { queue, queueIndex } = state;
    if (!queue.length) return;
    if (status.currentTime > 3) {
      player.seekTo(0);
      return;
    }
    const prevIndex = queueIndex > 0 ? queueIndex - 1 : 0;
    const prevHymn = queue[prevIndex];
    player.replace({ uri: prevHymn.audioUri });
    player.play();
    dispatch({ type: 'LOAD', hymn: prevHymn, queue, queueIndex: prevIndex });
  }, [state, player, status.currentTime]);

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
