# Third-party code and fonts the app makes PDFs with

Elbowpatch itself is MIT (see [LICENSE](LICENSE)). The code and fonts below are loaded only when a PDF is first made (docs/decisions/0019). Their licences allow this, and ask that their notices travel with them.

| What | Licence | Notice |
|---|---|---|
| [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 | MIT | Copyright (c) 2019 Andrew Dillon |
| [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) 1.1.1, a fork of fontkit | MIT | Copyright (c) 2014-present Devon Govett and contributors |
| [@pdf-lib/standard-fonts](https://github.com/Hopding/standard-fonts) 1.0.0 | MIT | Copyright (c) 2018 Andrew Dillon |
| [@pdf-lib/upng](https://github.com/Hopding/upng) 1.0.1 | MIT | Copyright (c) 2017 Photopea |
| Inside fontkit's build: a Brotli decoder, from Google | Apache-2.0 | Copyright 2013 Google Inc. |
| Inside fontkit's build: parts of Node's `util`; a text segmenter | MIT | Copyright Joyent, Inc. and other Node contributors; Copyright (c) 2012 Niklas von Hertzen |
| [pako](https://github.com/nodeca/pako) 1.0.11 | MIT and Zlib | Copyright (C) 2014-2017 by Vitaly Puzrin and Andrei Tuputcyn |
| Literata 3.103, fixed instances of it | SIL Open Font License 1.1 | Copyright 2017 The Literata Project Authors; text in `app/src/ui/styles/fonts/OFL-Literata.txt` |
| EB Garamond 1.003, fixed instances of it | SIL Open Font License 1.1 | Copyright 2017 The EB Garamond Project Authors; text in `app/src/ui/styles/fonts/OFL-EB-Garamond.txt` |

The fixed font files in `app/src/pdf/fonts/` are made from the two fonts above by `app/scripts/pdf-fonts.mjs`: instanced to one weight and cut to three files for each: Latin with extended Latin and Vietnamese, Cyrillic, and Greek. No other font is added: a character none of them holds is drawn by the browser with a font already on the writer's device and appears in the file only as a picture, never as a copy of that font. Their licence and copyright notices are kept inside the files. Neither font's licence reserves a font name.

`pdfjs-dist` (Apache-2.0) reads a PDF back in the tests. It is a development dependency and is never part of the app.
