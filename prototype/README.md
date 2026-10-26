# Paged writing prototype

A throwaway prototype of the page in `DESIGN.md`: the piece is laid out into book pages as you type, and you turn pages instead of scrolling. It is not the app. Pieces are kept in this browser's local storage only.

- `index.html`: the live prototype.
- `screens.html`: still frames for Figma — phone (390 × 844) and desktop (1440 × 900), in paper and night: the library, writing, page two, tools open, text settings and the empty first page.

## Open it

On the Mac, double-click `index.html`.

On a phone (the keyboard is the part worth testing), serve the folder and open it from the phone on the same Wi-Fi:

```
python3 -m http.server 8000 -d prototype
```

Then open `http://<your Mac's local IP>:8000` on the phone.

## Try

- It opens on the library. Pick a piece, or + for a new one. **Library** at the top left of the page goes back; a new piece left empty is not kept.
- Type anywhere. When a page fills, the next page begins and the view turns to it.
- Turn pages with PageDown / PageUp, Alt + ← / →, or a swipe.
- The round button bottom right opens the tools:
  - the page and word count
  - time machine (not built)
  - text settings
  - paper / night
- At night, paragraphs before the one you are in dim.
- Settings in the library and the time machine are placeholders. Your piece from the earlier prototype is carried into the library once.
- Paper or night follows the system until you choose. With reduced motion on, the page turn is an instant cut.

## Into Figma

1. Install the **html.to.design** Figma plugin and its Chrome extension.
2. Serve the folder (command above) and open `http://localhost:8000/screens.html` in Chrome, then import with the extension. A page opened from disk needs "Allow access to file URLs" switched on for the extension.
3. Each frame arrives as its own Figma frame. Install Literata from Google Fonts first, so the text layers keep the face.

The page turn, the dimming and the live reflow do not come through to Figma. They stay in `index.html`.
