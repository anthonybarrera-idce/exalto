import { createContext, useContext, useState } from 'react';

import type { Hymn } from '@/context/audio-context';

/** 'practice' (the voices practice tool) is only offered in the full player, for hymns with practice notes. */
export type ViewMode = 'hymnal' | 'audio' | 'practice';

/** Display order of the modes in the switcher. */
const MODE_ORDER: ViewMode[] = ['hymnal', 'audio', 'practice'];

/**
 * The modes a hymn actually supports, in switcher order: Read when it has lyrics, Listen when it
 * has a recording (piano or a cappella), Practice when it has practice notes. Never empty: a hymn
 * with nothing yet still opens as Read, which shows the "no lyrics yet" message.
 */
export function hymnModes(hymn: Hymn, hasPractice: boolean): ViewMode[] {
  const has: Record<ViewMode, boolean> = {
    hymnal: !!hymn.lyrics?.length,
    audio: !!(hymn.audioUri || hymn.acapellaUri),
    practice: hasPractice,
  };
  const modes = MODE_ORDER.filter((m) => has[m]);
  return modes.length ? modes : ['hymnal'];
}

interface ViewModeContextValue {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null);

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>('audio');
  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode(): ViewModeContextValue {
  const ctx = useContext(ViewModeContext);
  if (!ctx) throw new Error('useViewMode must be used inside ViewModeProvider');
  return ctx;
}
