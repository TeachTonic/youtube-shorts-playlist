import { useLayoutEffect, useRef, useState } from 'react';
import { includeAll, includedItems, MAX_DESCRIPTION, MAX_TITLE, moveIncluded, removeOccurrence, setIncluded, type Draft } from './draft';
import { importSession, MAX_IMPORT_BYTES } from './import-session';
import { loadDraft, saveDraft } from './storage';

export function App() {
  const [initial] = useState(() => loadDraft());
  const [draft, setDraft] = useState<Draft | null>(initial.draft);
  const [storageError, setStorageError] = useState<string | null>(initial.error);
  const [importError, setImportError] = useState('');
  const [notice, setNotice] = useState(initial.draft ? 'Your local draft has been restored.' : '');
  const [importing, setImporting] = useState(false);
  const importingRef = useRef(false);
  const lifetimeRef = useRef<symbol | null>(null);
  useLayoutEffect(() => {
    lifetimeRef.current = Symbol('editor lifetime');
    return () => {
      lifetimeRef.current = null;
      importingRef.current = false;
    };
  }, []);
  const included = draft ? includedItems(draft) : [];

  function persist(next: Draft) {
    setDraft(next);
    const result = saveDraft(next);
    setStorageError(result.ok ? null : result.error);
  }
  async function readFile(file: File) {
    const lifetime = lifetimeRef.current;
    if (lifetime === null || importingRef.current) return;
    const isCurrent = () => lifetimeRef.current === lifetime;
    importingRef.current = true; setImporting(true); setImportError('');
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('This file is too large. Use a Phase 0 export smaller than 5 MB.');
      const text = await file.text();
      if (!isCurrent()) return;
      const next = importSession(text);
      if (!isCurrent()) return;
      if ((draft !== null || initial.existing) &&
          !window.confirm('Replace the current local draft? Its edits will be replaced. Your original session export and extension data will not change.')) return;
      if (!isCurrent()) return;
      persist(next);
      setNotice(`Imported ${next.items.length} encounters. Each repeat is a separate occurrence.`);
    } catch (error) {
      if (isCurrent()) setImportError(error instanceof Error && error.message.trim()
        ? error.message
        : 'Could not read or import this file. Your draft has not changed. Try selecting the file again or choose another finished-session JSON export.');
    } finally {
      if (isCurrent()) {
        importingRef.current = false; setImporting(false);
      }
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#main"><span className="brand-mark" aria-hidden="true">w.</span><span>watch what<br /><strong>i watched.</strong></span></a>
        <span className="local-badge"><span aria-hidden="true" /> Local workspace</span>
      </header>

      <main id="main">
        <section className="intro" aria-labelledby="page-title">
          <div><p className="eyebrow">A session. Your sequence.</p><h1 id="page-title">Keep the good parts.</h1>
            <p className="intro-copy">Turn your Shorts encounters into a sequence worth keeping.<br className="wide-break" /> Choose the moments. Make the order your own.</p></div>
          <div className="privacy-note"><span className="privacy-symbol" aria-hidden="true">↳</span><div><strong>Just here. Just yours.</strong><p>Nothing is uploaded.<br />Your draft stays in this browser.</p></div></div>
        </section>

        <section className="import-bar" aria-label="Import a session">
          <div className="step-number" aria-hidden="true">01</div>
          <div className="import-copy"><h2>{draft ? 'Bring in another session' : 'Start with a finished session'}</h2>
            <p>Choose the JSON export from your capture extension. The original stays untouched.</p></div>
          <label className={`import-button ${importing ? 'is-disabled' : ''}`}>
            <span aria-hidden="true">↑</span> {importing ? 'Reading session…' : draft ? 'Replace session' : 'Import session'}
            <input aria-label="Import finished session JSON" type="file" accept=".json,application/json" disabled={importing}
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                if (file) void readFile(file);
              }} />
          </label>
          <span className="file-hint">JSON · up to 5 MB</span>
        </section>

        {importError && <p className="alert error" role="alert">{importError}</p>}
        {storageError && <div className="alert error" role="alert"><span>{storageError}</span>
          {draft && <button type="button" onClick={() => persist(draft)} disabled={importing}>Retry saving</button>}</div>}
        <p className="notice" role="status">{notice || 'A capture records encounters, not proof of viewing.'}</p>

        <fieldset className="editor" disabled={importing}>
          <legend className="sr-only">Local playlist editor</legend>
          <div className="working-column">
            <section className="details panel" aria-labelledby="details-heading">
              <div className="section-heading"><span className="step-number" aria-hidden="true">02</span><h2 id="details-heading">Give it a name</h2><span className="save-status">{storageError ? 'Not saved' : draft ? 'Saved locally' : 'No draft yet'}</span></div>
              <label htmlFor="title">Playlist title <span className="field-hint">You can decide later</span></label>
              <input id="title" type="text" maxLength={MAX_TITLE} value={draft?.title ?? ''} disabled={!draft}
                placeholder="A little rabbit hole worth revisiting" onChange={event => { if (draft) persist({ ...draft, title: event.target.value }); }} />
              <div className="field-bottom"><span>Only your own words. No video metadata is fetched.</span><span>{draft?.title.length ?? 0}/{MAX_TITLE}</span></div>
              <label htmlFor="description">Description <span className="field-hint">Optional</span></label>
              <textarea id="description" rows={3} maxLength={MAX_DESCRIPTION} value={draft?.description ?? ''} disabled={!draft}
                placeholder="What ties this sequence together?" onChange={event => { if (draft) persist({ ...draft, description: event.target.value }); }} />
              <div className="field-bottom"><span /><span>{draft?.description.length ?? 0}/{MAX_DESCRIPTION}</span></div>
            </section>

            <section className="panel encounters" aria-labelledby="encounters-heading">
              <div className="section-heading"><span className="step-number" aria-hidden="true">03</span><h2 id="encounters-heading">Pick your encounters</h2><span className="count-pill">{draft?.items.length ?? 0}</span></div>
              <p className="section-copy">Encounter order stays fixed when you reorder Your Cut. Repeats stay separate; removing one only changes this draft.</p>
              <div className="list-toolbar"><span>{included.length} included</span><div>
                <button type="button" disabled={!draft?.items.length} onClick={() => { if (draft) persist(includeAll(draft, true)); }}>Select all</button>
                <button type="button" disabled={!included.length} onClick={() => { if (draft) persist(includeAll(draft, false)); }}>Deselect all</button>
              </div></div>
              {!draft?.items.length ? <div className="empty-list"><div className="stack-icon" aria-hidden="true"><span /><span /><span /></div>
                <h3>{draft ? 'A clean slate.' : 'Your session starts here.'}</h3>
                <p>{draft ? 'All occurrences were removed from this draft. Import a session to begin again.' : 'Import a finished capture to see each encounter, in order. Nothing is selected unless you chose it during capture.'}</p>
              </div> : <ol className="encounter-list" aria-label="Encounter occurrences">
                {draft.items.map((item, index) => <li key={item.id} className={item.included ? 'encounter is-included' : 'encounter'}>
                  <label className="occurrence-label">
                    <input type="checkbox" checked={item.included} aria-label={`Include occurrence ${index + 1}: ${item.videoId}`}
                      onChange={event => persist(setIncluded(draft, item.id, event.target.checked))} />
                    <span className="ordinal">{String(index + 1).padStart(2, '0')}</span>
                    <span className="video-symbol" aria-hidden="true">▶</span>
                    <span className="video-info"><strong>{item.videoId}</strong><span>YouTube Short · occurrence {index + 1}</span></span>
                  </label>
                  <button className="remove-button" type="button" aria-label={`Remove occurrence ${index + 1}: ${item.videoId}`}
                    onClick={() => { persist(removeOccurrence(draft, item.id)); setNotice('Occurrence removed from this draft. The source export is unchanged.'); }}>Remove</button>
                </li>)}
              </ol>}
            </section>
          </div>

          <aside className="sequence panel" aria-labelledby="sequence-heading">
            <div className="sequence-top"><p className="eyebrow">Your cut</p><span className="sequence-count">{included.length} selected</span></div>
            <h2 id="sequence-heading">{draft?.title.trim() || 'An untitled sequence'}</h2>
            {draft?.description && <p className="sequence-description">{draft.description}</p>}
            <p className="section-copy">Use the arrows to set the sequence. Each entry is its own occurrence.</p>
            {included.length === 0 ? <div className="empty-sequence"><span aria-hidden="true">↗</span><h3>Make the first pick.</h3><p>Select encounters on the left.<br />Your sequence will take shape here.</p></div> :
              <ol className="sequence-list" aria-label="Selected sequence">
                {included.map((item, index) => <li key={item.id}>
                  <span className="sequence-position">{String(index + 1).padStart(2, '0')}</span>
                  <div className="sequence-video"><strong>{item.videoId}</strong><span>YouTube Short</span></div>
                  <div className="move-controls">
                    <button type="button" disabled={index === 0} aria-label={`Move selected occurrence ${index + 1} up`}
                      onClick={() => { if (draft) persist(moveIncluded(draft, item.id, -1)); }}><span aria-hidden="true">↑</span></button>
                    <button type="button" disabled={index === included.length - 1} aria-label={`Move selected occurrence ${index + 1} down`}
                      onClick={() => { if (draft) persist(moveIncluded(draft, item.id, 1)); }}><span aria-hidden="true">↓</span></button>
                  </div>
                </li>)}
              </ol>}
            <div className="sequence-footer"><span aria-hidden="true">●</span><p>A local draft, not a public playlist.<br />
              {included.length > 0 && !storageError && !importing ? <a href="./viewer.html">View saved sequence →</a> : 'Select encounters and save to view your sequence.'}
            </p></div>
          </aside>
        </fieldset>
        <footer className="footer"><span>Watch what I watched.</span><span>One draft · saved in this browser · no account needed</span></footer>
      </main>
    </div>
  );
}
