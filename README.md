# GIF & Emoji

Chrome/Edge extension that sends my own GIFs and emojis on **Instagram Web**, **Discord Web** and **WhatsApp Web**.
The media lives in this repo, so adding a new GIF is just a commit — no extension update needed.

## Install

1. Download this repo (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

## Use

1. Open a chat and click the message box.
2. Click the extension icon (or press **Alt+G**).
3. Click a GIF/emoji, then press **Enter** to send.

## Add media

Put files in a folder under `media/` and push. Each folder becomes a tab in the picker.

```
media/
  gifs/     dance.gif, lol.gif ...
  emojis/   pepe.png, cat.webp ...
```

Supported: `.gif` `.png` `.jpg` `.jpeg` `.webp`. File names are used for search.

If you fork or rename the repo, change `REPO` at the top of `popup.js`.
