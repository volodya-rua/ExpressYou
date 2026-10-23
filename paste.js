// Pastes an image into a chat's message box like Ctrl+V would and, when asked (the supported chat
// sites, via content.js), sends it. Shared by content.js and the toolbar popup, which injects pasteFile
// alone with chrome.scripting on other sites, so pasteFile must stay self-contained (its WhatsApp branch
// only runs from content.js, where the helpers below are loaded too).
function pasteFile(dataUrl, name, box, autoSend = false) {
  if (!box) {
    const a = document.activeElement;
    box = a && (a.isContentEditable || a.tagName === 'TEXTAREA') ? a
      : [...document.querySelectorAll('[contenteditable="true"][role="textbox"], footer [contenteditable="true"]')].pop();
  }
  if (!box) return false;
  const [head, b64] = dataUrl.split(',');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const dt = new DataTransfer();
  dt.items.add(new File([bytes], name, { type: head.slice(5, head.indexOf(';')) }));
  box.focus();
  box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  if (!autoSend) return true;
  if (location.hostname === 'web.whatsapp.com') { clickWhatsAppSend(box); return true; }

  const enter = () => {
    const a = document.activeElement, el = a?.isContentEditable || a?.tagName === 'TEXTAREA' ? a : box;
    for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  };
  // Elsewhere the site shows its own preview of the pasted image (a blob: <img>, in the box or in a dialog
  // like Telegram's) once it has taken it: press Enter the moment it appears, again while it is still there,
  // and stop once it's gone, because then the meme was sent. Sites that show no preview get timed presses.
  // Enter on an already-emptied box sends nothing, so the extra presses can't double-send.
  let preview, presses = 0;
  const press = () => { if (presses < 4 && !(preview && !preview.isConnected)) { presses++; enter(); } };
  const found = n => n.nodeType === 1 && (n.matches('img[src^="blob:"]') ? n : n.querySelector('img[src^="blob:"]'));
  const watch = new MutationObserver(records => {
    for (const r of records) for (const n of r.type === 'attributes' ? [r.target] : r.addedNodes) {
      const img = found(n);
      if (img) { preview = img; watch.disconnect(); return setTimeout(press); }
    }
  });
  watch.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  setTimeout(() => watch.disconnect(), 1500);
  for (const ms of [250, 700, 1300]) setTimeout(press, ms);
  return true;
}

// WhatsApp opens a preview (or its sticker maker) with its own send button, outside the footer: click it
// the moment it shows, and again if it is still there a moment later (it ignores clicks while loading).
function clickWhatsAppSend(box) {
  const start = Date.now();
  let clicked = false;
  const poll = () => {
    const icon = [...document.querySelectorAll('[data-icon="send"], [data-icon="wds-ic-send-filled"]')].find(i => !i.closest('footer'));
    const button = icon?.closest('button, [role="button"]');
    if (button) { button.click(); clicked = true; } else if (clicked) return; // the preview closed: it was sent
    if (Date.now() - start > 4000) { // never saw a preview: fall back to Enter in the box
      if (!clicked && box) for (const type of ['keydown', 'keyup']) box.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      return;
    }
    setTimeout(poll, button ? 250 : 50);
  };
  poll();
}

// WhatsApp Web sends anything pasted or dropped as a photo; only its own sticker maker (attach menu ›
// Sticker) makes stickers. So the meme is handed to that, the way a person would: open the attach menu and
// give the Sticker option the file. Resolves false when the option can't be found, so the caller can paste.
async function whatsappSticker(file) {
  const attach = [...document.querySelectorAll('footer [data-icon], footer [aria-label], footer [title]')]
    .find(e => /^(plus|plus-rounded|attach-menu-plus|clip)$/.test(e.getAttribute('data-icon') ?? '') || /attach/i.test(e.getAttribute('aria-label') ?? e.getAttribute('title') ?? ''))
    ?.closest('button, [role="button"]');
  if (!attach) return false;
  attach.click();
  const input = await waitFor(stickerInput, 1500);
  if (!input) { attach.click(); return false; } // close the menu again
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}
// The menu's sticker option, by its label or icon; failing that, its only image-only file picker
// (the photo option also takes videos, the document option takes anything).
function stickerInput() {
  const inputs = [...document.querySelectorAll('input[type="file"]')];
  return inputs.find(i => { const item = i.closest('li, [role="menuitem"], [role="button"]'); return item && (/sticker/i.test(item.textContent) || item.querySelector('[data-icon*="sticker"]')); })
    ?? inputs.find(i => /image\//.test(i.accept) && !/video|\*\/\*|^\*$/.test(i.accept));
}
function waitFor(check, ms) {
  return new Promise(resolve => {
    const start = Date.now();
    (function poll() { const v = check(); if (v || Date.now() - start > ms) resolve(v); else setTimeout(poll, 50); })();
  });
}
