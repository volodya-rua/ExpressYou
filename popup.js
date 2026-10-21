// Public repo that holds the media/ folder. Change this if you fork or rename it.
const REPO = 'volodya-rua/ExpressYou';
const TYPES = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
// One newsprint paper colour per tab, in tab order: Recent, Favorites, then each folder.
const PAPERS = ['#f2b8c6', '#d9e86a', '#c9b8f0', '#f7c59f', '#a8d8ea', '#b8e6c9'];
const RECENT = 'Recent', FAVS = 'Favorites', MAX_RECENT = 12, COLS = 3; // COLS matches the grid in popup.html
const HINT = 'Click a meme to send it. Arrow keys move, Enter sends.';
// content.js opens this page in a frame inside the chat; there we hand the file to the page instead of injecting.
const EMBEDDED = window !== top;
const PARENT = location.ancestorOrigins?.[0];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z"/></svg>';
const ICONS = { [RECENT]: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>', [FAVS]: STAR };

const $ = s => document.querySelector(s);
const h = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const ext = p => p.split('.').pop().toLowerCase();
const raw = p => `https://raw.githubusercontent.com/${REPO}/HEAD/${p.split('/').map(encodeURIComponent).join('/')}`;
const status = (t, alert = false) => { $('#status').textContent = t; $('#status').classList.toggle('alert', alert); };
const setNight = on => document.documentElement.classList.toggle('night', on);
let items = [], tabs = [RECENT, FAVS], tab = RECENT, recent = [], favs = [], hint = HINT;

// chrome.storage is shared by the toolbar popup and the in-chat panel (localStorage would be split per site).
const store = globalThis.chrome?.storage?.local;
const saved = async keys => { try { return await store.get(keys); } catch { return {}; } };
const save = data => store?.set(data).catch(() => {});
const saveRecent = path => { recent = [path, ...recent.filter(p => p !== path)].slice(0, MAX_RECENT); return save({ recent }); };
const toggleFav = path => { favs = favs.includes(path) ? favs.filter(p => p !== path) : [path, ...favs]; save({ favs }); render(); };
const byPath = paths => paths.map(p => items.find(i => i.path === p)).filter(Boolean);
const inTab = t => t === RECENT ? byPath(recent) : t === FAVS ? byPath(favs) : items.filter(i => i.tab === t);

// Each meme is downloaded once and kept in the browser's cache by its git hash (a changed file gets a new
// hash), so the grid shows instantly on later opens, even offline, and a pick never waits on the network.
// ponytail: cached copies of deleted memes are never pruned; clear the cache if the repo ever gets huge
const cache = globalThis.caches?.open('expressyou-memes').catch(() => null);
const files = new Map(); // path -> Promise<{ blob, url }>
function getFile(item) {
  if (!files.has(item.path)) {
    files.set(item.path, (async () => {
      const key = item.sha && `https://expressyou.cache/${item.sha}`, c = key && await cache;
      let res = await c?.match(key);
      if (!res) {
        res = await fetch(raw(item.path));
        if (!res.ok) throw new Error(`Download failed (${res.status}). Try again.`);
        c?.put(key, res.clone()).catch(() => {});
      }
      const blob = new Blob([await res.arrayBuffer()], { type: TYPES[ext(item.path)] });
      return { blob, url: URL.createObjectURL(blob) };
    })().catch(e => { files.delete(item.path); throw e; }));
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
    // Supported chat sites run content.js, which knows the box and sends; anywhere else we only paste.
    let ok = await chrome.tabs.sendMessage(active.id, { expressyou: 'paste', dataUrl, name: item.name }).catch(() => undefined);
    if (ok === undefined) ok = (await chrome.scripting.executeScript({ target: { tabId: active.id }, func: pasteFile, args: [dataUrl, item.name] }))[0].result;
    if (!ok) throw new Error('No message box here. Click into a chat first, then pick again.');
    await saveRecent(item.path);
    window.close();
  } catch (e) {
    cell.classList.remove('sending');
    status(/Cannot access|cannot be scripted/i.test(e.message) ? "Can't paste on this page. Open a chat and try again." : e.message, true);
  }
}

const empty = (title, text, ...extra) => h('div', { className: 'empty' }, h('strong', {}, title), text ? h('p', {}, text) : '', ...extra);
const fadeTabs = () => { const t = $('#tabs'); t.classList.toggle('more', t.scrollLeft + t.clientWidth < t.scrollWidth - 1); };

function cellFor(item, top) {
  const cell = h('div', { className: top ? 'cell top' : 'cell' });
  const fallback = () => img.replaceWith(h('span', { className: 'alt' }, item.label));
  const img = h('img', { alt: '', decoding: 'async', onerror: fallback });
  getFile(item).then(f => { img.src = f.url; }, fallback);
  const named = () => status(item.label), unnamed = () => status(hint);
  const pick = h('button', { className: 'pick', ariaLabel: `Send ${item.label}`, onclick: () => send(item, cell), onmouseenter: named, onfocus: named, onmouseleave: unnamed, onblur: unnamed }, img);
  const faved = favs.includes(item.path);
  const fav = h('button', { className: 'fav', innerHTML: STAR, ariaPressed: String(faved), title: faved ? 'Remove from favorites' : 'Add to favorites', ariaLabel: `${faved ? 'Remove' : 'Add'} ${item.label} ${faved ? 'from' : 'to'} favorites`, onclick: () => toggleFav(item.path) });
  cell.append(pick, fav);
  return cell;
}

function render() {
  const q = $('#q').value.trim().toLowerCase();
  document.documentElement.style.setProperty('--paper', PAPERS[tabs.indexOf(tab) % PAPERS.length]);
  $('#tabs').replaceChildren(...tabs.map(t => {
    const b = h('button', { ariaPressed: String(t === tab && !q), onclick: () => { tab = t; $('#q').value = ''; render(); } });
    if (ICONS[t]) Object.assign(b, { innerHTML: ICONS[t], title: t, ariaLabel: t, className: 'icon' });
    else b.append(t, h('span', { className: 'n' }, String(inTab(t).length)));
    return b;
  }));
  $('#tabs [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  fadeTabs();

  const shown = q ? items.filter(i => i.label.includes(q)) : inTab(tab);
  hint = q && shown.length ? `${shown.length} ${shown.length === 1 ? 'hit' : 'hits'} in all folders. Enter sends the first.` : HINT;
  $('#grid').replaceChildren(...shown.length ? shown.map((i, n) => cellFor(i, q && !n)) : [
    q ? empty('No hits.', `Nothing is called “${q}”. Try another word.`)
      : !items.length ? empty('No memes yet.', 'Add images to a folder under media/ in the repo, then reopen.')
      : tab === FAVS ? empty('No favorites yet.', 'Tap the star on any meme to keep it here.')
      : empty('Nothing yet.', 'Memes you send show up here for next time.'),
  ]);
  status(hint);
}

function show(list, pickTab) {
  items = list;
  tabs = [RECENT, FAVS, ...new Set(items.map(i => i.tab))];
  if (pickTab || !tabs.includes(tab)) tab = recent.length ? RECENT : favs.length ? FAVS : tabs[2] ?? RECENT;
  $('#count').textContent = `${items.length} memes`;
  render();
}

async function load() {
  const s = await saved(['recent', 'favs', 'tree']);
  recent = s.recent ?? [];
  favs = s.favs ?? [];
  const known = s.tree?.repo === REPO ? s.tree : null;
  // Show the saved list right away, then refresh it from GitHub in the background.
  if (known) show(known.items, true);
  else { $('#grid').replaceChildren(...Array.from({ length: 9 }, () => h('i', { className: 'ghost' }))); status('Loading memes…'); }
  try {
    // Browser HTTP cache revalidates this with ETags; 304s don't count against GitHub's 60/hour limit.
    const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`);
    if (res.status === 403 || res.status === 429) throw new Error("GitHub's hourly limit was hit. Try again in a few minutes.");
    if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again in a moment.`);
    const json = await res.json();
    if (json.sha === known?.sha) return; // nothing new
    const list = json.tree
      .filter(f => f.type === 'blob' && f.path.startsWith('media/') && TYPES[ext(f.path)])
      .map(f => {
        const parts = f.path.split('/'), name = parts.at(-1);
        // "do-i-care-no.jpg" -> "do i care no", so search works with spaces
        return { path: f.path, sha: f.sha, name, label: name.replace(/\.\w+$/, '').replace(/[-_]/g, ' ').toLowerCase(), tab: parts.length > 2 ? parts[1] : 'other' };
      });
    save({ tree: { repo: REPO, sha: json.sha, items: list } });
    show(list, !known);
  } catch (e) {
    if (known) return; // keep showing the saved memes
    $('#grid').replaceChildren(empty("Can't reach GitHub.", '', h('button', { className: 'retry', onclick: load }, 'Try again')));
    status(e instanceof TypeError ? 'Check your internet connection, then try again.' : e.message, true); // TypeError = fetch itself failed
  }
}

document.documentElement.classList.toggle('embedded', EMBEDDED);
// In a chat, content.js says whether the site is dark; the toolbar popup follows the system setting.
setNight(EMBEDDED ? new URLSearchParams(location.search).has('night') : matchMedia('(prefers-color-scheme: dark)').matches);
$('#q').oninput = render;
$('#q').onkeydown = e => {
  if (e.key === 'Enter') $('#grid .pick')?.click(); // Enter sends the top hit
  if (e.key === 'ArrowDown') { e.preventDefault(); $('#grid .pick')?.focus(); }
};
// Arrow keys move around the grid; Up from the top row goes back to search.
$('#grid').onkeydown = e => {
  const picks = [...$('#grid').querySelectorAll('.pick')], i = picks.indexOf(document.activeElement);
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: COLS, ArrowUp: -COLS }[e.key];
  if (i < 0 || !step) return;
  e.preventDefault();
  (picks[i + step] ?? (i + step < 0 ? $('#q') : null))?.focus();
};
$('#tabs').onscroll = fadeTabs;
addEventListener('keydown', e => {
  // In the chat panel, Esc closes it (the first Esc clears a search, like any search box).
  if (e.key === 'Escape' && EMBEDDED && !$('#q').value) return parent.postMessage({ expressyou: 'close' }, PARENT);
  if (document.activeElement === $('#q') || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
  else if (e.key.length === 1 && e.key !== ' ') $('#q').focus(); // start typing anywhere to search
});
// The panel stays loaded between opens; each time it's shown, start fresh with Recent up to date.
addEventListener('message', e => {
  if (!EMBEDDED || e.source !== parent || e.origin !== PARENT || e.data?.expressyou !== 'shown') return;
  setNight(!!e.data.night);
  $('#q').value = '';
  if (items.length) render();
  $('#q').focus();
});
$('#q').focus(); // autofocus is ignored inside a frame
load();
