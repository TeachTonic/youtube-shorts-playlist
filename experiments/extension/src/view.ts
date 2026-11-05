import './view.css';
import type { Command, Reply, State } from './model';
const element = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing view element: ' + id);
  return node as T;
};
const text = (id: string, value: string): void => { const node = document.getElementById(id); if (node) node.textContent = value; };
let state: State | undefined;
let busy = false;
let tableSignature = '';
async function send(command: Command): Promise<void> {
  let message: { command: Command; tabId?: number; windowId?: number } = { command };
  if (command === 'start' || command === 'resume' || command === 'include') {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tabs.length !== 1 || !tab || tab.active !== true ||
        typeof tab.id !== 'number' || !Number.isSafeInteger(tab.id) || tab.id < 0 ||
        !Number.isSafeInteger(tab.windowId) || tab.windowId < 0)
      throw new Error('Select one active tab in this window and reopen the popup.');
    message = { command, tabId: tab.id, windowId: tab.windowId };
  }
  const reply = await chrome.runtime.sendMessage<unknown, Reply>(message);
  if (reply.state) { state = reply.state; render(reply.state); }
  if (!reply.ok) throw new Error(reply.error ?? 'Operation failed.');
  if (command === 'start' || command === 'resume') window.close();
}
function rows(id: string, values: string[][]): void {
  const target = document.getElementById(id);
  if (!target) return;
  target.replaceChildren(...values.map(values => {
    const row = document.createElement('tr');
    for (const value of values) { const cell = document.createElement('td'); cell.textContent = value; row.append(cell); }
    return row;
  }));
}
function render(value: State): void {
  const phase = value.session?.phase;
  const labels = { capturing: 'Capturing', paused: 'Paused', finishing: 'Finishing', finished: 'Not capturing (finished)' };
  text('status', phase ? labels[phase] : 'Not capturing');
  text('counts', value.encounters.length + ' / ' + value.encounters.filter(item => item.selected).length);
  const current = value.encounters.find(item => item.id === value.session?.currentEncounterId);
  text('video', current?.videoId ?? '—');
  text('mechanism', current?.mechanism ?? '—');
  const last = value.diagnostics.at(-1);
  text('last', last ? last.timestamp + ' · ' + last.source + ' · ' + last.reason : '—');
  text('session', 'Session: ' + (value.session?.id ?? 'none') + ' · Capture tab: ' + (value.session?.tabId ?? 'unbound'));
  element<HTMLInputElement>('polling').checked = value.pollingEnabled;
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-command]')) {
    const command = button.dataset.command;
    button.disabled = busy || (command === 'start' ? !!value.session :
      command === 'pause' || command === 'include' ? phase !== 'capturing' :
      command === 'resume' ? phase !== 'paused' :
      command === 'finish' ? phase !== 'capturing' && phase !== 'paused' :
      command === 'reset' ? phase !== 'finished' : false);
  }
  const signature = JSON.stringify([value.encounters, value.diagnostics.length, value.droppedDiagnostics, last]);
  if (signature !== tableSignature) {
    tableSignature = signature;
    rows('encounters', value.encounters.map(item => [String(item.ordinal), item.videoId, item.selected ? 'Yes' : 'No', item.mechanism, item.detectedAt]));
    rows('logs', value.diagnostics.slice(-250).reverse().map(item => [item.timestamp, String(item.tabId), item.url,
      item.videoId ?? '—', item.source, String(item.accepted), item.reason]));
  }
  text('logCount', 'Showing latest 250; ' + value.diagnostics.length + ' retained; ' + value.droppedDiagnostics + ' older events discarded (5,000-event cap). Export includes all retained events.');
}
async function action(command: Command): Promise<void> {
  if (busy) return;
  busy = true;
  if (command !== 'get' && command !== 'poll') text('error', '');
  if (state) render(state);
  if (command === 'finish') text('status', 'Finishing');
  try { await send(command); }
  catch (error) { text('error', error instanceof Error ? error.message : 'Extension unavailable.'); }
  finally { busy = false; if (state) render(state); }
}
document.querySelectorAll<HTMLButtonElement>('[data-command]').forEach(button => {
  button.addEventListener('click', () => {
    if (button.dataset.command === 'reset' && !confirm('Permanently delete this local session and its diagnostics? Export first.')) return;
    void action(button.dataset.command as Command);
  });
});
element<HTMLInputElement>('polling').addEventListener('change', event => {
  void action((event.target as HTMLInputElement).checked ? 'enablePolling' : 'disablePolling');
});
document.getElementById('diagnostics')?.addEventListener('click', () => {
  void chrome.windows.create({ url: chrome.runtime.getURL('diagnostic.html'), type: 'popup', focused: false, width: 1100, height: 750 });
});
document.getElementById('export')?.addEventListener('click', () => {
  const output = element<HTMLTextAreaElement>('exportText');
  output.value = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), state }, null, 2);
  output.hidden = false; output.focus(); output.select();
});
void action('get');
setInterval(() => {
  if (!busy) void action(state?.pollingEnabled ? 'poll' : 'get');
}, 500);
