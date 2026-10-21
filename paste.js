// Pastes an image into a chat's message box like Ctrl+V would and, when asked (the supported chat
// sites, via content.js), sends it. Shared by content.js and the toolbar popup, which injects it with
// chrome.scripting on other sites, so it must stay self-contained: no outside variables.
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

  const enter = () => {
    const a = document.activeElement, el = a?.isContentEditable || a?.tagName === 'TEXTAREA' ? a : box;
    for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  };
  if (location.hostname === 'web.whatsapp.com') {
    // WhatsApp opens an image preview with its own send button (the one outside the footer): click it the
    // moment it shows, and again if it is still there a moment later (it ignores clicks while still loading).
    const start = Date.now();
    let clicked = false;
    const poll = () => {
      const icon = [...document.querySelectorAll('[data-icon="send"], [data-icon="wds-ic-send-filled"]')].find(i => !i.closest('footer'));
      const button = icon?.closest('button, [role="button"]');
      if (button) { button.click(); clicked = true; } else if (clicked) return; // preview closed: it was sent
      if (Date.now() - start > 4000) return clicked || enter(); // never saw the preview: fall back to Enter
      setTimeout(poll, button ? 250 : 50);
    };
    poll();
    return true;
  }

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
