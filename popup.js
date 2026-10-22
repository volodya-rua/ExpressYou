// Public repo that holds the media/ folder. Change this if you fork or rename it.
const REPO = 'volodya-rua/ExpressYou';
const TYPES = { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
// One newsprint paper colour per tab, in tab order: Recent, Favorites, GIFs, then each folder.
const PAPERS = ['#f2b8c6', '#d9e86a', '#c9b8f0', '#f7c59f', '#a8d8ea', '#b8e6c9'];
const RECENT = 'Recent', FAVS = 'Favorites', GIFS = 'GIFs', MAX_RECENT = 12, COLS = 3; // COLS matches the grid in popup.html
const HINT = 'Click a meme to send it. Arrow keys move, Enter sends.';
// GIPHY's free key allows 100 calls an hour, so trending is reused for a while and typing waits for a pause.
const GIPHY = 'https://api.giphy.com/v1/gifs', TRENDING_FOR = 15 * 60e3, TYPING_PAUSE = 350;
// content.js opens this page in a frame inside the chat; there we hand the file to the page instead of injecting.
const EMBEDDED = window !== top;
const PARENT = location.ancestorOrigins?.[0];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8l2.5 5.1 5.6.8-4.05 3.95.95 5.6L12 16.6l-5 2.65.95-5.6L3.9 9.7l5.6-.8z"/></svg>';
const ICONS = { [RECENT]: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>', [FAVS]: STAR };

const $ = s => document.querySelector(s);
const h = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const ext = p => p.split(/[?#]/)[0].split('.').pop().toLowerCase();
const raw = p => `https://raw.githubusercontent.com/${REPO}/HEAD/${p.split('/').map(encodeURIComponent).join('/')}`;
const status = (t, alert = false) => { $('#status').textContent = t; $('#status').classList.toggle('alert', alert); };
const setNight = on => document.documentElement.classList.toggle('night', on);
let items = [], tabs = [RECENT, FAVS, GIFS], tab = RECENT, recent = [], favs = [], hint = HINT;
let giphyKey = '', pinned = {}, gifs = { q: null, items: [] }, gifTimer;

// chrome.storage is shared by the toolbar popup and the in-chat panel (localStorage would be split per site).
const store = globalThis.chrome?.storage?.local;
const saved = async keys => { try { return await store.get(keys); } catch { return {}; } };
const save = data => store?.set(data).catch(() => {});
// GIPHY GIFs aren't in the repo, so the ones in Recent or Favorites are kept here to show them again.
function remember(item) {
  if (item.path.startsWith('giphy:')) pinned[item.path] = item;
  const keep = new Set([...recent, ...favs]);
  for (const p of Object.keys(pinned)) if (!keep.has(p)) delete pinned[p];
  save({ pinned });
}
const saveRecent = item => { recent = [item.path, ...recent.filter(p => p !== item.path)].slice(0, MAX_RECENT); remember(item); return save({ recent }); };
const toggleFav = item => { favs = favs.includes(item.path) ? favs.filter(p => p !== item.path) : [item.path, ...favs]; remember(item); save({ favs }); render(); };
const byPath = paths => paths.map(p => items.find(i => i.path === p) ?? pinned[p]).filter(Boolean);
const inTab = t => t === RECENT ? byPath(recent) : t === FAVS ? byPath(favs) : items.filter(i => i.tab === t);

// Each meme is downloaded once and kept in the browser's cache by its git hash (a changed file gets a new
// hash), so the grid shows instantly on later opens, even offline, and a pick never waits on the network.
// ponytail: cached copies of deleted memes are never pruned; clear the cache if the repo ever gets huge
const cache = globalThis.caches?.open('expressyou-memes').catch(() => null);
const files = new Map(); // path -> Promise<{ blob, url }>
function getFile(item) {
  if (!files.has(item.path)) {
    files.set(item.path, (async () => {
      // Repo files are keyed by git hash; linked and GIPHY GIFs (item.url) by their own address.
      const key = item.sha ? `https://expressyou.cache/${item.sha}` : item.url, c = key && await cache;
      let res = await c?.match(key);
      if (!res) {
        res = await fetch(item.url ?? raw(item.path));
        if (!res.ok) throw new Error(`Download failed (${res.status}). Try again.`);
        c?.put(key, res.clone()).catch(() => {});
      }
      const blob = new Blob([await res.arrayBuffer()], { type: TYPES[ext(item.name)] });
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
      saveRecent(item); // not awaited: the storage write is already on its way
      return parent.postMessage({ expressyou: 'paste', dataUrl, name: item.name }, PARENT);
    }
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    // Supported chat sites run content.js, which knows the box and sends; anywhere else we only paste.
    let ok = await chrome.tabs.sendMessage(active.id, { expressyou: 'paste', dataUrl, name: item.name }).catch(() => undefined);
    if (ok === undefined) ok = (await chrome.scripting.executeScript({ target: { tabId: active.id }, func: pasteFile, args: [dataUrl, item.name] }))[0].result;
    if (!ok) throw new Error('No message box here. Click into a chat first, then pick again.');
    await saveRecent(item);
    window.close();
  } catch (e) {
    cell.classList.remove('sending');
    status(/Cannot access|cannot be scripted/i.test(e.message) ? "Can't paste on this page. Open a chat and try again." : e.message, true);
  }
}

// GIPHY: trending when the search box is empty, otherwise a search. Small animated WebP previews in the
// grid; the GIF that gets sent is GIPHY's "downsized" one (under 2 MB) so it pastes and uploads fast.
async function fetchGifs(q) {
  try {
    const s = q ? null : (await saved('trending')).trending;
    let data = s && Date.now() - s.at < TRENDING_FOR ? s.data : null;
    if (!data) {
      const res = await fetch(`${GIPHY}/${q ? 'search' : 'trending'}?api_key=${encodeURIComponent(giphyKey)}&limit=36&rating=pg-13${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      if (res.status === 401 || res.status === 403) throw Object.assign(new Error("GIPHY didn't accept that key. Check it and save it again."), { badKey: true });
      if (res.status === 429) throw new Error("This key used up GIPHY's 100 searches for the hour. Try again later.");
      if (!res.ok) throw new Error(`GIPHY answered ${res.status}. Try again in a moment.`);
      data = (await res.json()).data.map(g => {
        const title = (g.title || 'gif').replace(/\s+GIF(\s+by\s+.*)?$/i, '').trim() || 'gif';
        const i = g.images;
        return { path: `giphy:${g.id}`, url: (i.downsized ?? i.original).url, thumb: (i.fixed_width_downsampled ?? i.fixed_width).webp ?? i.fixed_width.url, label: title.toLowerCase(), name: `${title.replace(/\W+/g, '-').toLowerCase()}.gif`, tab: GIFS };
      });
      if (!q) save({ trending: { at: Date.now(), data } });
    }
    gifs = { q, items: data };
  } catch (e) {
    gifs = { q, items: [], error: e instanceof TypeError ? 'Check your internet connection, then try again.' : e.message, badKey: e.badKey };
  }
  if (tab === GIFS && $('#q').value.trim().toLowerCase() === q) render();
}

function keyForm(problem) {
  const input = h('input', { className: 'key', type: 'text', placeholder: 'Paste your GIPHY API key', autocomplete: 'off', spellcheck: false, ariaLabel: 'GIPHY API key' });
  const saveKey = () => {
    giphyKey = input.value.trim();
    if (!giphyKey) return input.focus();
    save({ giphyKey, trending: null });
    gifs = { q: null, items: [] };
    render();
  };
  input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); saveKey(); } };
  return empty('Search all of GIPHY.', problem ?? 'Trending GIFs and search need a free GIPHY key (one-time setup):',
    h('ol', {},
      h('li', {}, 'Open ', h('a', { href: 'https://developers.giphy.com/dashboard/', target: '_blank', rel: 'noreferrer' }, 'developers.giphy.com'), ' and sign in.'),
      h('li', {}, 'Create an app and pick ', h('b', {}, 'API'), ' (not SDK).'),
      h('li', {}, 'Copy its key and paste it here.')),
    h('div', { className: 'keyrow' }, input, h('button', { className: 'retry', onclick: saveKey }, 'Save')),
    h('p', { className: 'small' }, 'The key stays in this browser only.'));
}

const empty = (title, text, ...extra) => h('div', { className: 'empty' }, h('strong', {}, title), text ? h('p', {}, text) : '', ...extra);
// Show each arrow only while there are more categories beyond that end of the bar.
const updateArrows = () => {
  const t = $('#tabs');
  $('.scroll.prev').hidden = t.scrollLeft <= 1;
  $('.scroll.next').hidden = t.scrollLeft + t.clientWidth >= t.scrollWidth - 1;
};
const ghosts = () => Array.from({ length: 9 }, () => h('i', { className: 'ghost' }));

function cellFor(item, top) {
  const cell = h('div', { className: top ? 'cell top' : 'cell' });
  const fallback = () => img.replaceWith(h('span', { className: 'alt' }, item.label));
  const img = h('img', { alt: '', decoding: 'async', onerror: fallback });
  // Linked and GIPHY GIFs show a lighter animated preview, loaded only when scrolled into view; the GIF
  // itself is fetched on hover so the click sends at once. Repo files show the same download they send.
  if (item.thumb) Object.assign(img, { loading: 'lazy', src: item.thumb });
  else getFile(item).then(f => { img.src = f.url; }, fallback);
  const named = () => { status(item.label); getFile(item).catch(() => {}); }, unnamed = () => status(hint);
  const pick = h('button', { className: 'pick', ariaLabel: `Send ${item.label}`, onclick: () => send(item, cell), onmouseenter: named, onfocus: named, onmouseleave: unnamed, onblur: unnamed }, img);
  const faved = favs.includes(item.path);
  const fav = h('button', { className: 'fav', innerHTML: STAR, ariaPressed: String(faved), title: faved ? 'Remove from favorites' : 'Add to favorites', ariaLabel: `${faved ? 'Remove' : 'Add'} ${item.label} ${faved ? 'from' : 'to'} favorites`, onclick: () => toggleFav(item) });
  cell.append(pick, fav);
  return cell;
}

function gifGrid(q) {
  if (!giphyKey) return [keyForm()];
  if (gifs.q !== q) {
    clearTimeout(gifTimer);
    gifTimer = setTimeout(() => fetchGifs(q), q ? TYPING_PAUSE : 0);
  }
  if (gifs.badKey) return [keyForm(gifs.error)];
  if (gifs.error) return [empty("Can't load GIFs.", gifs.error)];
  if (gifs.q === q && !gifs.items.length) return [empty('No GIFs.', `GIPHY has nothing for “${q}”. Try another word.`)];
  if (!gifs.items.length) return ghosts();
  const changeKey = h('button', { className: 'link', onclick: () => { giphyKey = ''; save({ giphyKey: '', trending: null }); gifs = { q: null, items: [] }; render(); } }, 'Change GIPHY key');
  return [...gifs.items.map((i, n) => cellFor(i, q && !n)), h('div', { className: 'gridfoot' }, changeKey)];
}

function render() {
  const q = $('#q').value.trim().toLowerCase(), onGifs = tab === GIFS;
  document.documentElement.style.setProperty('--paper', PAPERS[tabs.indexOf(tab) % PAPERS.length]);
  $('#q').placeholder = onGifs ? 'Search GIPHY…' : 'Search memes…  (/ or just type)';
  $('#tabs').replaceChildren(...tabs.map(t => {
    const b = h('button', { ariaPressed: String(t === tab && (!q || onGifs)), onclick: () => { tab = t; $('#q').value = ''; render(); } });
    if (ICONS[t]) Object.assign(b, { innerHTML: ICONS[t], title: t, ariaLabel: t, className: 'icon' });
    else b.append(t, t === GIFS ? '' : h('span', { className: 'n' }, String(inTab(t).length)));
    return b;
  }));
  $('#tabs [aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  updateArrows();

  if (onGifs) {
    hint = giphyKey ? `Powered by GIPHY · ${q ? 'Enter sends the first.' : 'Trending now. Type to search.'}` : 'Powered by GIPHY';
    $('#grid').replaceChildren(...gifGrid(q));
    return status(hint);
  }
  const shown = q ? items.filter(i => i.label.includes(q)) : inTab(tab);
  hint = q && shown.length ? `${shown.length} ${shown.length === 1 ? 'hit' : 'hits'} in all folders. Enter sends the first.` : HINT;
  $('#grid').replaceChildren(...shown.length ? shown.map((i, n) => cellFor(i, q && !n)) : [
    q ? empty('No hits.', `Nothing is called “${q}”. Try another word, or search GIPHY in the GIFs tab.`)
      : !items.length ? empty('No memes yet.', 'Add images to a folder under media/ in the repo, then reopen.')
      : tab === FAVS ? empty('No favorites yet.', 'Tap the star on any meme to keep it here.')
      : empty('Nothing yet.', 'Memes you send show up here for next time.'),
  ]);
  status(hint);
}

function show(list, pickTab) {
  items = list;
  tabs = [RECENT, FAVS, GIFS, ...[...new Set(items.map(i => i.tab))].sort()];
  if (pickTab || !tabs.includes(tab)) tab = recent.length ? RECENT : favs.length ? FAVS : tabs[3] ?? RECENT;
  $('#count').textContent = `${items.length} memes`;
  render();
}

async function load() {
  const s = await saved(['recent', 'favs', 'tree', 'giphyKey', 'pinned']);
  recent = s.recent ?? [];
  favs = s.favs ?? [];
  giphyKey = s.giphyKey ?? '';
  pinned = s.pinned ?? {};
  const known = s.tree?.repo === REPO ? s.tree : null;
  // Show the saved list right away, then refresh it from GitHub in the background.
  if (known) show(known.items, true);
  else { $('#grid').replaceChildren(...ghosts()); status('Loading memes…'); }
  try {
    // Browser HTTP cache revalidates this with ETags; 304s don't count against GitHub's 60/hour limit.
    const res = await fetch(`https://api.github.com/repos/${REPO}/git/trees/HEAD?recursive=1`);
    if (res.status === 403 || res.status === 429) throw new Error("GitHub's hourly limit was hit. Try again in a few minutes.");
    if (!res.ok) throw new Error(`GitHub answered ${res.status}. Try again in a moment.`);
    const json = await res.json();
    if (json.sha === known?.sha) return; // nothing new
    const blobs = json.tree.filter(f => f.type === 'blob' && f.path.startsWith('media/'));
    const repoFiles = blobs.filter(f => TYPES[ext(f.path)]).map(f => {
      const parts = f.path.split('/'), name = parts.at(-1);
      // "do-i-care-no.jpg" -> "do i care no", so search works with spaces
      return { path: f.path, sha: f.sha, name, label: name.replace(/\.\w+$/, '').replace(/[-_]/g, ' ').toLowerCase(), tab: parts.length > 2 ? parts[1] : 'other' };
    });
    // media/<tab>/*.json lists GIFs hosted elsewhere: [{ "name": "...", "url": "...gif", "thumb": "...webp" }].
    const links = await Promise.all(blobs.filter(f => /^media\/[^/]+\/[^/]+\.json$/.test(f.path)).map(async f => {
      try {
        const tab = f.path.split('/')[1];
        return (await (await fetch(raw(f.path))).json()).filter(l => l.url && TYPES[ext(l.url)]).map(l => ({
          path: l.url, url: l.url, thumb: l.thumb, label: l.name.toLowerCase(), tab,
          name: `${l.name.trim().replace(/\s+/g, '-')}.${ext(l.url)}`,
        }));
      } catch { return []; } // one broken list shouldn't hide everything else
    }));
    const list = [...repoFiles, ...links.flat()];
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
// Category bar scrolling: arrows, mouse wheel or touchpad (either direction), drag, and arrow keys.
const strip = $('#tabs');
strip.onscroll = updateArrows;
addEventListener('resize', updateArrows);
$('.scroll.prev').onclick = () => strip.scrollBy({ left: -strip.clientWidth * .7, behavior: 'smooth' });
$('.scroll.next').onclick = () => strip.scrollBy({ left: strip.clientWidth * .7, behavior: 'smooth' });
strip.onwheel = e => {
  if (strip.scrollWidth <= strip.clientWidth) return;
  e.preventDefault();
  strip.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
};
let drag = null, dragged = false;
strip.onpointerdown = e => { if (e.button === 0 && e.pointerType === 'mouse') drag = { x: e.clientX, left: strip.scrollLeft }; }; // touch already swipes natively
addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  if (!dragged && Math.abs(dx) < 5) return; // a small wobble is still a click
  dragged = true;
  strip.classList.add('dragging');
  strip.scrollLeft = drag.left - dx;
});
addEventListener('pointerup', () => { drag = null; strip.classList.remove('dragging'); setTimeout(() => { dragged = false; }); });
strip.addEventListener('click', e => { if (dragged) e.stopPropagation(); }, true); // the drag's release isn't a tab click
strip.onkeydown = e => {
  const tabsNow = [...strip.children], i = tabsNow.indexOf(document.activeElement);
  const next = tabsNow[i + ({ ArrowRight: 1, ArrowLeft: -1 }[e.key] ?? NaN)];
  if (i < 0 || !next) return;
  e.preventDefault();
  next.focus();
  next.scrollIntoView({ block: 'nearest', inline: 'nearest' });
};
addEventListener('keydown', e => {
  // In the chat panel, Esc closes it (the first Esc clears a search, like any search box).
  if (e.key === 'Escape' && EMBEDDED && !$('#q').value) return parent.postMessage({ expressyou: 'close' }, PARENT);
  if (document.activeElement.tagName === 'INPUT' || e.ctrlKey || e.metaKey || e.altKey) return;
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
