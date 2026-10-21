# ExpressYou

Chrome/Edge extension that sends my own GIFs and emojis on **Instagram Web**, **Discord Web** and **WhatsApp Web**.
The media lives in this repo, so adding a new GIF is just a commit — no extension update needed.

## Install

1. Download this repo (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

## Use

On **Instagram, Discord and WhatsApp Web** a small pink smiley button sits just above the message box:

1. Open a chat and click the smiley button.
2. Click a meme. It drops into the message box.
3. Press **Enter** to send.

Faster: type in the search box and press **Enter** to send the top match. The **Recent** tab keeps the memes you sent last. **Esc** closes the panel.

On any other site, click the extension icon (or press **Alt+G**) with the message box focused.

Images load straight from this repo, so you only need the extension files (`manifest.json`, `popup.html`, `popup.js`, `paste.js`, `content.js`, `fonts/`); the `media/` folder in your download isn't used.

## Add media

Put files in a folder under `media/` and push. Each folder is a category tab in the picker, so you only see that category.

```
media/
  anime/     anime reaction memes
  doodles/   hand-drawn reaction faces
  emoji/     3D emoji memes
  text/      text-only replies (nvm, ugh ...)
```

Make a new folder to add a new category. Supported: `.gif` `.png` `.jpg` `.jpeg` `.webp`.
Name files by what they say (`do-i-care-no.jpg`), since search matches file names.

If you fork or rename the repo, change `REPO` at the top of `popup.js`.
