// Public repo that holds the media/ folder. Change this if you fork or rename it.
const REPO = 'volodya-rua/gif-emoji';
const TYPES = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };

const $ = s => document.querySelector(s);
const ext = p => p.split('.').pop().toLowerCase();
const raw = p => `https://raw.githubusercontent.com/${REPO}/HEAD/${p.split('/').map(encodeURIComponent).join('/')}`;
const status = t => $('#status').textContent = t;
let items = [], tabs = [], tab;

// Runs inside the chat page: pastes the file into the message box like Ctrl+V would.
function pasteFile(dataUrl, name) {
  const a = document.activeElement;
  const box = a && (a.isContentEditable || a.tagName === 'TEXTAREA') ? a
    : [...document.querySelectorAll('[contenteditable="true"][role="textbox"], footer [contenteditable="true"]')].pop();
  if (!box) return false;
  const [head, b64] = dataUrl.split(',');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], name, { type: head.slice(5, head.indexOf(';')) }));
  box.focus();
  box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  return true;
}

async function send(item) {
  try {
    status('Sending…');
    const res = await fetch(raw(item.path));
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const blob = new Blob([await res.arrayBuffer()], { type: TYPES[ext(item.path)] });
    const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: active.id }, func: pasteFile, args: [dataUrl, item.name] });
    if (!result) return status('Open a chat and click the message box first.');
    window.close(); // focus goes back to the chat, press Enter to send
  } catch (e) {
    status(`Error: ${e.message}`);
  }
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  $('#tabs').replaceChildren(...tabs.map(t => {
    const b = document.createElement('button');
    b.textContent = t;
    b.className = t === tab && !q ? 'on' : '';
    b.onclick = () => { tab = t; $('#q').value = ''; render(); };
    return b;
  }));
  $('#grid').replaceChildren(...items.filter(i => q ? i.name.toLowerCase().includes(q) : i.tab === tab).map(i => {
    const b = document.createElement('button');
    const img = new Image();
    img.src = raw(i.path);
    img.alt = img.title = i.name;
    img.loading = 'lazy';
    b.append(img);
    b.onclick = () => send(i);
    return b;
  }));
}

(async () => {
  try {
    // Browser HTTP cache revalidates this with ETags; 304s don't count against GitHub's 60/hour limit.
    const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`);
    if (!res.ok) throw new Error(`GitHub said ${res.status}`);
    items = (await res.json()).tree
      .filter(f => f.type === 'blob' && f.path.startsWith('media/') && TYPES[ext(f.path)])
      .map(f => { const parts = f.path.split('/'); return { path: f.path, name: parts.at(-1), tab: parts.length > 2 ? parts[1] : 'other' }; });
    tabs = [...new Set(items.map(i => i.tab))];
    tab = tabs[0];
    status(items.length ? '' : 'No media yet. Add files to media/gifs or media/emojis in the repo.');
    render();
  } catch (e) {
    status(`Could not load ${REPO}: ${e.message}`);
  }
})();
$('#q').oninput = render;
