# ExpressYou

Chrome/Edge extension that sends my own memes and GIFs straight into web chats.
The media lives in this repo, so adding a new GIF is just a commit — no extension update needed.

Works in: **Instagram, Discord, WhatsApp, Telegram, Messenger, Facebook, X (Twitter), Slack, Microsoft Teams, Google Chat, Google Messages, LinkedIn, Reddit and Snapchat** (web versions).

## Install

1. Download this repo (Code → Download ZIP) and unzip it.
2. Open `chrome://extensions` (or `edge://extensions`), turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

## Use

In those chats a small smiley-bubble button sits inside the message box, at its right end:

1. Open a chat and click the smiley (or press **Alt+G**).
2. Click a meme. It's sent straight away.

Faster:
- Just start typing to search, then **Enter** sends the top match.
- **Arrow keys** move around the grid; **Enter** sends the one you're on. **Esc** closes.
- **Recent** (clock) keeps what you sent last; the **star** on any meme saves it to **Favorites**.

Memes go out as stickers, not photos: on WhatsApp they're sent through WhatsApp's own sticker maker (paperclip › Sticker), on Telegram as 512×512 WebP stickers, on Instagram and Discord as sticker-sized images (160–200px, since they don't take custom stickers), elsewhere as small images that upload in a blink. Animated reactions go as GIFs. The picker turns dark on dark chats. On any other site, click the extension icon (or press **Alt+G**) with the message box focused; the meme is pasted and you press **Enter** to send.

Memes are saved in your browser after the first load, so the picker opens instantly and still works offline. You only need the extension files (`manifest.json`, `background.js`, `popup.html`, `popup.js`, `paste.js`, `content.js`, `icons/`); the `media/` folder in your download isn't used.

## Add media

Put files in a folder under `media/` and push. Each folder is a category tab in the picker, so you only see that category.

```
media/
  anime/     anime reaction memes
  cursed/    cursed images
  doodles/   hand-drawn reaction faces
  emoji/     3D emoji memes
  hype/ lol/ love/ mood/ sad/ shook/   reactions by feeling
  text/      text-only replies (nvm, ugh ...)
```

Make a new folder to add a new category. Supported: `.gif` `.png` `.jpg` `.jpeg` `.webp`.
Name files by what they say (`do-i-care-no.jpg`), since search matches file names.

GIFs hosted elsewhere can be added without copying them: put a `links.json` in a category folder,
a list of `{ "name": "what it says", "url": "https://...gif", "thumb": "https://...webp (optional preview)" }`.
The `hype`, `lol`, `love`, `mood`, `sad` and `shook` tabs work this way, with 113 animated reactions
from Google's [Animated Noto Emoji](https://googlefonts.github.io/noto-emoji-animation/) (CC BY 4.0, see `media/CREDITS.md`).

If you fork or rename the repo, change `REPO` at the top of `popup.js`.
