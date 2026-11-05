import { useEffect, useRef, useState } from 'react';
import { loadDraft } from '../storage';
import { includedItems } from '../draft';
import { createPlayback, type PlaybackStatus } from './player';

function OccurrencePlayer({ videoId }: { videoId: string }) {
  const mount = useRef<HTMLDivElement>(null);
  const playback = useRef<ReturnType<typeof createPlayback> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<PlaybackStatus>({ phase: 'idle', message: 'Press Play to load this item from YouTube.' });
  useEffect(() => {
    if (!mount.current) return;
    setStatus({ phase: 'idle', message: 'Press Play to load this item from YouTube.' });
    const controller = createPlayback(mount.current, videoId, setStatus);
    playback.current = controller;
    const leave = () => controller.destroy();
    window.addEventListener('pagehide', leave);
    return () => { window.removeEventListener('pagehide', leave); controller.destroy(); playback.current = null; };
  }, [videoId, attempt]);
  return <>
    <div className="playback-actions">
      {status.phase === 'error'
        ? <button onClick={() => setAttempt(value => value + 1)}>Try again</button>
        : <button disabled={status.phase === 'loading'} onClick={() => { void playback.current?.play(); }}>{status.phase === 'loading' ? 'Loading…' : 'Play'}</button>}
      <a href={'https://www.youtube.com/shorts/' + videoId} target="_blank" rel="noopener">Open in YouTube ↗</a>
    </div>
    <p className={status.phase === 'error' ? 'player-status error' : 'player-status'} role={status.phase === 'error' ? 'alert' : 'status'}>{status.message}</p>
    <div className="portrait-player" ref={mount} aria-label="YouTube player area" />
  </>;
}

export function Viewer() {
  // Read once: a stable local snapshot, never a writer to the editor's draft.
  const [loaded] = useState(() => loadDraft());
  const [position, setPosition] = useState(0);
  const items = loaded.draft ? includedItems(loaded.draft) : [];
  const item = items[position];
  return <main className="viewer">
    <header><a href="./index.html">← Back to editor</a><span>Local sequence · not a share link</span></header>
    <p className="eyebrow">Watch what I watched.</p>
    <h1>{loaded.draft?.title.trim() || 'An untitled sequence'}</h1>
    {loaded.draft?.description && <p className="description">{loaded.draft.description}</p>}
    <p className="privacy">YouTube is contacted only after Play. Playback uses the official player and may require a second Play gesture. No automatic playback or advancement.</p>
    {loaded.error ? <p role="alert">{loaded.error}</p> : !item ? <p role="status">No selected occurrences. Return to the editor, select some encounters and save your draft.</p> :
      <div className="viewing-layout">
        <section aria-label="Current occurrence">
          <nav className="navigation" aria-label="Sequence navigation">
            <button disabled={position === 0} onClick={() => setPosition(value => value - 1)}>Previous</button>
            <p aria-live="polite" aria-atomic="true">{position + 1} of {items.length}</p>
            <button disabled={position === items.length - 1} onClick={() => setPosition(value => value + 1)}>Next</button>
          </nav>
          <h2>Occurrence {position + 1} <span>{item.videoId}</span></h2>
          <OccurrencePlayer key={item.id} videoId={item.videoId} />
        </section>
        <aside aria-label="Ordered sequence"><h2>Your sequence</h2>
          <ol>{items.map((entry, index) => <li key={entry.id}>
            <button aria-current={index === position ? 'step' : undefined} onClick={() => setPosition(index)}
              aria-label={'Go to occurrence ' + (index + 1) + ': ' + entry.videoId}>
              <span>{String(index + 1).padStart(2, '0')}</span><strong>{entry.videoId}</strong>{index === position && <small>Current</small>}
            </button>
          </li>)}</ol>
        </aside>
      </div>}
    <footer>This viewer reads your saved draft in this browser only. Repeated video IDs remain separate occurrences.</footer>
  </main>;
}
