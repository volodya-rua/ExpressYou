// Puts an ExpressYou button inside the chat's message box, at its right end. It opens the
// picker (popup.html) in a panel and sends whatever you pick in that chat.
// Wrapped so background.js can inject a fresh copy into an open tab after a reload.
(() => {
const PICKER = chrome.runtime.getURL('popup.html');
const PICKER_ORIGIN = new URL(PICKER).origin;

const host = document.createElement('div');
const root = host.attachShadow({ mode: 'closed' }); // keeps the site's CSS out of our button
root.innerHTML = `<style>
  button { position: fixed; z-index: 2147483647; width: 26px; height: 26px; padding: 0; display: grid; place-items: center; border: 2px solid #111; border-radius: 0; background: #f2b8c6; cursor: pointer; }
  button:hover, button[aria-expanded="true"] { background: #fff; }
  button:focus-visible { outline: 2px solid #111; outline-offset: 2px; }
  iframe { position: fixed; z-index: 2147483647; width: 360px; border: 2px solid #111; background: #f2b8c6; box-shadow: 0 10px 30px rgb(0 0 0 / .35); }
  [hidden] { display: none !important; }
  .notice { position: fixed; z-index: 2147483647; max-width: 300px; padding: 8px 10px; background: #111; color: #fff; font: 600 12px/1.35 system-ui, sans-serif; }
</style>
<button type="button" title="ExpressYou memes" aria-label="Open ExpressYou memes" aria-expanded="false">
  <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#111" stroke-width="2" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><path d="M6.5 12q3.5 3.5 7 0M7.5 7.5v1M12.5 7.5v1"/></svg>
</button>`;
const btn = root.querySelector('button');
let box, panel, isOpen = false;

// The message box is the last editable textbox on the page (WhatsApp's search box comes before it).
const findBox = () => [...document.querySelectorAll('[contenteditable="true"][role="textbox"], footer [contenteditable="true"]')].pop();

// Pad the box's right end once so typed text never runs under the button.
const padded = new WeakSet();
function makeRoom(el) {
  if (padded.has(el)) return;
  padded.add(el);
  if (parseFloat(getComputedStyle(el).paddingRight) >= 32) return;
  const width = el.getBoundingClientRect().width;
  el.style.paddingRight = '32px';
  if (el.getBoundingClientRect().width > width + 1) el.style.boxSizing = 'border-box'; // a width:100% box would grow instead
}

function place() {
  if (!chrome.runtime?.id) { clearInterval(timer); host.remove(); return; } // extension reloaded: the fresh copy takes over
  if (isOpen) return; // stay put while the panel is open
  box = findBox();
  const r = box?.getBoundingClientRect();
  btn.hidden = !r?.width; // no chat open: no button (the host stays, so a loaded picker survives chat switches)
  if (btn.hidden) return;
  if (!host.isConnected) document.documentElement.append(host);
  makeRoom(box);
  // Right end of the box, centred on its last line so it stays put as a long message grows upward.
  btn.style.top = `${r.bottom - Math.min(r.height, 36) / 2 - 13}px`;
  btn.style.left = `${r.right - 29}px`;
}

// The picker loads once (starting when the pointer reaches the button) and is then only shown and
// hidden, so it opens instantly with its memes already downloaded.
function loadPanel() {
  if (panel) return;
  panel = Object.assign(document.createElement('iframe'), { src: PICKER, title: 'ExpressYou memes', hidden: true });
  root.append(panel);
}

function openPanel() {
  loadPanel();
  const height = Math.min(560, innerHeight - 16), r = btn.getBoundingClientRect();
  Object.assign(panel.style, {
    height: `${height}px`,
    top: `${Math.max(8, r.top - height - 8)}px`,
    left: `${Math.max(8, Math.min(innerWidth - 372, r.right - 364))}px`,
  });
  panel.hidden = false;
  isOpen = true;
  btn.setAttribute('aria-expanded', 'true');
  panel.contentWindow.postMessage({ expressyou: 'shown' }, PICKER_ORIGIN); // picker clears its search and refreshes Recent
  panel.focus();
}

function closePanel(refocus = true) {
  if (panel) panel.hidden = true;
  isOpen = false;
  btn.setAttribute('aria-expanded', 'false');
  if (refocus) box?.focus();
}

function notice(text) {
  const n = Object.assign(document.createElement('div'), { className: 'notice', role: 'alert', textContent: text });
  const r = btn.getBoundingClientRect();
  Object.assign(n.style, { top: `${Math.max(8, r.top - 48)}px`, right: `${Math.max(8, innerWidth - r.right)}px` });
  root.append(n);
  setTimeout(() => n.remove(), 4000);
}

btn.onclick = () => isOpen ? closePanel() : openPanel();
btn.onpointerenter = btn.onfocus = loadPanel;
// Only trust messages from our own picker frame.
addEventListener('message', e => {
  if (!isOpen || e.source !== panel.contentWindow || e.origin !== PICKER_ORIGIN || !e.data?.expressyou) return;
  closePanel(); // close first so the site's own attachment preview keeps focus after the paste
  if (e.data.expressyou !== 'paste') return;
  // The site may have rebuilt its message box while the panel was open.
  if (!pasteFile(e.data.dataUrl, e.data.name, box?.isConnected ? box : findBox(), true)) notice("Couldn't find the message box. Click into the chat and pick again.");
});
document.addEventListener('mousedown', e => { if (isOpen && !e.composedPath().includes(host)) closePanel(false); }, true);
document.addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') closePanel(); }, true);

// ponytail: polls every 500ms to follow the chat box through single-page navigation; a MutationObserver if this ever shows up in profiles
const timer = setInterval(place, 500);
addEventListener('resize', place);
place();
})();
