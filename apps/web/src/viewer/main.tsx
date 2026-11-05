import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Viewer } from './Viewer';
import './viewer.css';
const root = document.getElementById('root');
if (!root) throw new Error('Missing viewer root.');
createRoot(root).render(<StrictMode><Viewer /></StrictMode>);
// Returning from the back/forward cache must not retain a destroyed player controller.
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
