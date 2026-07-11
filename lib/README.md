# Third-party libraries bundled in this folder

This project itself is MIT-licensed (see `/LICENSE`). The files in this
`lib/` folder are unmodified third-party builds distributed under their
own license and are **not** covered by that MIT license.

## p5.js

- File: `p5.min.js`
- Version: 1.9.0
- License: GNU Lesser General Public License v2.1 (LGPL-2.1) — full text in `LGPL-2.1.txt`
- Copyright: © The p5.js contributors ([processing/p5.js](https://github.com/processing/p5.js))
- Obtained unmodified from the official cdnjs mirror:
  https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js

## p5.sound

- File: `p5.sound.min.js`
- Version: 1.0.1
- License: GNU Lesser General Public License v2.1 (LGPL-2.1) — full text in `LGPL-2.1.txt`
- Copyright: © The p5.js contributors ([processing/p5.sound.js](https://github.com/processing/p5.sound.js))
- Obtained unmodified from the official cdnjs mirror:
  https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/addons/p5.sound.min.js

## Why these are bundled

p5.js Relay auto-inserts a `<script>` tag pointing to one of these files
into the *destination* page's HTML (e.g. CodePen) when the code being
transferred is a p5.js sketch that doesn't already load p5.js itself.
Chrome Web Store's Manifest V3 policy prohibits referencing remotely
hosted code, so a local copy is shipped inside the extension package
(exposed to destination pages via `web_accessible_resources` in
`manifest.json`) instead of loading from a CDN at runtime. See
`CHANGELOG.md` entry 2.6.2 for details.

Per LGPL-2.1 §6, this notice, the unmodified license text, and a
pointer to the original source are provided alongside the library
files. Neither file has been modified from the official release.
