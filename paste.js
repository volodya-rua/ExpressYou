// Pastes an image into a chat's message box like Ctrl+V would, then on the chat sites sends it.
// Shared by the toolbar popup (injected with chrome.scripting) and the in-chat button (content.js),
// so it must stay self-contained: no outside variables.
function pasteFile(dataUrl, name, box, autoSend = /(^|\.)(instagram|discord|whatsapp)\.com$/.test(location.hostname)) {
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
      setTimeout(poll, button ? 400 : 50);
    };
    poll();
  } else {
    // Discord and Instagram attach the image to the box and send on Enter. Press it right after the paste,
    // then once more in case the site was still attaching; Enter on an already-emptied box sends nothing.
    setTimeout(enter, 60);
    setTimeout(enter, 400);
  }
  return true;
}
