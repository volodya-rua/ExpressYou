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

  // WhatsApp opens an image preview with its own send button (the one outside the footer);
  // Discord and Instagram attach the image to the box and send on Enter.
  const start = Date.now();
  const send = () => {
    const icon = [...document.querySelectorAll('[data-icon="send"], [data-icon="wds-ic-send-filled"]')].find(i => !i.closest('footer'));
    const button = icon?.closest('button, [role="button"]');
    if (button) return button.click();
    if (location.hostname === 'web.whatsapp.com' && Date.now() - start < 4000) return setTimeout(send, 150);
    const el = document.activeElement?.isContentEditable || document.activeElement?.tagName === 'TEXTAREA' ? document.activeElement : box;
    for (const type of ['keydown', 'keyup']) el.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  };
  // ponytail: fixed 600ms for the site to attach the image; watch for its attachment UI instead if this proves flaky
  setTimeout(send, 600);
  return true;
}
