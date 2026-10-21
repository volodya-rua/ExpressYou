// Public repo that holds the media/ folder. Change this if you fork or rename it.
const REPO = 'volodya-rua/ExpressYou';
const TYPES = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
// One newsprint paper colour per tab: Recent first, then each folder in order.
const PAPERS = ['#f2b8c6', '#d9e86a', '#c9b8f0', '#f7c59f', '#a8d8ea', '#b8e6c9'];
const RECENT = 'Recent', MAX_RECENT = 12;
const HINT = 'Click a meme to send it.';
// content.js opens this page in a frame inside the chat; there we hand the file to the page instead of injecting.
const EMBEDDED = window !== top;
const PARENT = location.ancestorOrigins?.[0];

const $ = s => document.querySelector(s);
const h = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const ext = p => p.split('.').pop().toLowerCase();
const raw = p => `https://raw.githubusercontent.com/${REPO}/HEAD/${p.split('/').map(encodeURIComponent).join('/')}`;
const status = (t, alert = false) => { $('#status').textContent = t; $('#status').classList.toggle('alert', alert); };
let items = [], tabs = [RECENT], tab = RECENT, recent = [];

// chrome.storage is shared by the toolbar popup and the in-chat panel (localStorage would be split per site).
const store = globalThis.chrome?.storage?.local;
async function loadRecent() { try { recent = (await store.get('recent')).recent ?? []; } catch { recent = []; } }
async function saveRecent(path) { recent = [path, ...recent.filter(p => p !== path)].slice(0, MAX_RECENT); try { await store?.set({ recent }); } catch {} }
const recentItems = () => recent.map(p => items.find(i => i.path === p)).filter(Boolean);
const inTab = t => t === RECENT ? recentItems() : items.filter(i => i.tab === t);

// The grid and the send share one download per meme, so a pick goes out without waiting on the network.
const files = new Map(); // path -> Promise<{ blob, url }>
function getFile(item) {
  if (!files.has(item.path)) {
    files.set(item.path, fetch(raw(item.path)).then(async res => {
      if (!res.ok) throw new Error(`Download failed (${res.status}). Try again.`);
      const blob = new Blob([await res.arrayBuffer()], { type: TYPES[ext(item.path)] });
      return { blob, url: URL.createObjectURL(blob) };
    }).catch(e => { files.delete(item.path); throw e; }));
  }
  return files.get(item.path);
}

async function send(item, cell) {
  cell.classList.add('sending');
  status('Sending…');
  try {
    const { blob } = await getFile(item);
    const dataUrl = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
    if (EMBEDDED) {
      saveRecent(item.path); // not awaited: the storage write is already on its way
      return parent.postMessage({ expressyou: 'paste', dataUrl, name: item.name }, PARENT);
    }
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: active.id }, func: pasteFile, args: [dataUrl, item.name] });
    if (!result) throw new Error('No message box here. Click into a chat first, then pick again.');
    await saveRecent(item.path);
    window.close(); // pasteFile sends it on the chat sites; elsewhere you press Enter
  } catch (e) {
    cell.classList.remove('sending');
    status(/Cannot access|cannot be scripted/i.test(e.message) ? "Can't paste on this page. Open Instagram, Discord or WhatsApp Web." : e.message, true);
  }
}

const empty = (title, text, ...extra) => h('div', { className: 'empty' }, h('strong', {}, title), text ? h('p', {}, text) : '', ...extra);
const fadeTabs = () => { const t = $('#tabs'); t.classList.toggle('more', t.scrollLeft + t.clientWidth < t.scrollWidth - 1); };

function render() {
  const q = $('#q').value.trim().toLowerCase();
  document.documentElement.style.setProperty('--paper', PAPERS[tabs.indexOf(tab) % PAPERS.length]);
  $('#tabs').replaceChildren(...tabs.map(t => h('button', {
    ariaPressed: String(t === tab && !q),
    onclick: () => { tab = t; $('#q').value = ''; render(); },
  }, h('span', {}, t, t === RECENT ? '' : h('span', { className: 'n' }, String(inTab(t).length))))));
  $('#tabs [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  fadeTabs();

  const shown = q ? items.filter(i => i.label.includes(q)) : inTab(tab);
  $('#grid').replaceChildren(...shown.length ? shown.map((i, n) => {
    const b = h('button', { className: q && !n ? 'cell top' : 'cell', title: i.label, onclick: () => send(i, b) });
    const fallback = () => img.replaceWith(h('span', { className: 'alt' }, i.label));
    const img = h('img', { alt: i.label, onerror: fallback });
    getFile(i).then(f => { img.src = f.url; }, fallback);
    b.append(img);
    return b;
  }) : [
    q ? empty('No hits.', `Nothing is called “${q}”. Try another word.`)
      : !items.length ? empty('No memes yet.', 'Add images to a folder under media/ in the repo, then reopen.')
      : empty('Nothing yet.', 'Memes you send show up here for next time.'),
  ]);
  status(q && shown.length ? `${shown.length} ${shown.length === 1 ? 'hit' : 'hits'} in all folders. Enter sends the first.` : HINT);
}

async function load() {
  $('#grid').replaceChildren(...Array.from({ length: 9 }, () => h('i', { className: 'ghost' })));
  status('Loading memes…');
  try {
    // Browser HTTP cache revalidates this with ETags; 304s don't count against GitHub's 60/hour limit.
    const [res] = await Promise.all([fetch(`https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`), loadRecent()]);
    if (res.status === 403 || res.status === 429) throw new Error("GitHub's hourly limit was hit. Try again in a few minutes.");
    if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again in a moment.`);
    items = (await res.json()).tree
      .filter(f => f.type === 'blob' && f.path.startsWith('media/') && TYPES[ext(f.path)])
      .map(f => {
        const parts = f.path.split('/'), name = parts.at(-1);
        // "do-i-care-no.jpg" -> "do i care no", so search works with spaces
        return { path: f.path, name, label: name.replace(/\.\w+$/, '').replace(/[-_]/g, ' ').toLowerCase(), tab: parts.length > 2 ? parts[1] : 'other' };
      });
    tabs = [RECENT, ...new Set(items.map(i => i.tab))];
    tab = recentItems().length || tabs.length < 2 ? RECENT : tabs[1];
    $('#count').textContent = `${items.length} memes`;
    render();
  } catch (e) {
    $('#grid').replaceChildren(empty("Can't reach GitHub.", '', h('button', { className: 'retry', onclick: load }, 'Try again')));
    status(e instanceof TypeError ? 'Check your internet connection, then try again.' : e.message, true); // TypeError = fetch itself failed
  }
}

document.documentElement.classList.toggle('embedded', EMBEDDED);
$('#q').oninput = render;
$('#q').onkeydown = e => { if (e.key === 'Enter') $('#grid .cell')?.click(); }; // Enter sends the top hit
$('#tabs').onscroll = fadeTabs;
// In the chat panel, Esc closes it (the first Esc clears a search, like any search box).
addEventListener('keydown', e => { if (EMBEDDED && e.key === 'Escape' && !$('#q').value) parent.postMessage({ expressyou: 'close' }, PARENT); });
$('#q').focus(); // autofocus is ignored inside a frame
load();
