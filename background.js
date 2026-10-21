// After the extension is installed or reloaded, chat tabs that are already open keep the old
// in-page code until they're refreshed, so inject the fresh copy into them right away.
chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason !== 'install' && reason !== 'update') return; // not on Chrome's own updates: those tabs are still current
  const { matches, js } = chrome.runtime.getManifest().content_scripts[0];
  for (const tab of await chrome.tabs.query({ url: matches })) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: js }).catch(() => {}); // e.g. a tab that is still loading
  }
});

// Alt+G: in a supported chat the in-page picker toggles; anywhere else the toolbar popup opens.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'open-picker') return;
  const opened = await chrome.tabs.sendMessage(tab.id, { expressyou: 'toggle' }).catch(() => false);
  if (!opened) chrome.action.openPopup().catch(() => {});
});
