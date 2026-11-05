export type Phase = 'capturing' | 'paused' | 'finishing' | 'finished';
export type Source = 'start' | 'resume' | 'include' | 'webNavigation.onCommitted'
  | 'webNavigation.onHistoryStateUpdated' | 'tabs.onActivated' | 'windows.onFocusChanged' | 'url-comparison';
export interface Encounter {
  id: string; ordinal: number; provider: 'YouTube'; videoId: string;
  detectedUrl: string; detectedAt: string; mechanism: Source; selected: boolean; sessionId: string;
}
export interface Diagnostic {
  timestamp: string; tabId: number | null; url: string; videoId: string | null;
  source: string; accepted: boolean; reason: string;
}
export interface Session {
  id: string; tabId: number | null; phase: Phase; startedAt: string;
  finishedAt: string | null; currentVideoId: string | null; currentEncounterId: string | null;
}
export interface State {
  session: Session | null; encounters: Encounter[]; diagnostics: Diagnostic[];
  droppedDiagnostics: number; pollingEnabled: boolean;
}
export const emptyState = (): State => ({
  session: null, encounters: [], diagnostics: [], droppedDiagnostics: 0, pollingEnabled: false,
});
export interface Observation {
  tabId: number; url: string; at: string; source: Source; foreground: boolean;
}
export type Command = 'start' | 'pause' | 'resume' | 'include' | 'finish' | 'reset' | 'get' | 'poll' | 'enablePolling' | 'disablePolling';
export interface Reply { ok: boolean; state?: State; error?: string }
