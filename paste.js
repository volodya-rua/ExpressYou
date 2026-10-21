// Pastes an image into a chat's message box like Ctrl+V would. Shared by the toolbar popup
// (injected with chrome.scripting) and the in-chat button (content.js), so it must stay
// self-contained: no outside variables.
function pasteFile(dataUrl, name, box) {
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
  return true;
}
