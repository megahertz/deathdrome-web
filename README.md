# deathdrome-web

Unofficial TypeScript remake of the 1996 PC game DeathDrome, written from
scratch.

**[Play in the browser](https://megahertz.github.io/deathdrome-web/)**

![Gameplay on a phone with touch controls](other/screenshot.jpg)

## Game files

Original game data is not included. Choose or drop a demo ZIP, CD ISO, or ZIP
containing a BIN/CUE disc. Files are unpacked and cached locally in your
browser. Later visits use the saved resources without reading the disc again.
The demo and data-only ISO have no music; use the full CD for music.

## Run

Requires Python 3 and Node.js 26+.

```sh
npm ci
npm start
```

Open http://localhost:8080/. The server prints a LAN address for phone testing.
It automatically loads `private/disc/Death-Drome_Win_EN.zip` if present. Use
`?image=URL` for another source, or add `&nocache` to bypass cached disc data.

## Controls

Arrows / WASD: drive · Alt: fire · Shift: weapon · Space: jump · Ctrl: barrier ·
Q: rear view · M: music · Esc: pause / back.

Phones: left joystick and right action buttons; tap the top of the screen to
pause.

## Graphics

**Options → GRAPHIC MODE**: **ORIGINAL** (default) or **ENHANCED**. Enhanced
adds full-window gameplay, an adaptive HUD, texture filtering, antialiasing,
bloom, lighting, shadows, particles and fog.

## Build

```sh
npm run build
npm run check:dist
```

Publish `dist/`.

## Development

```sh
npm run check   # types, formatting, lint, tests, build and publication checks
npm run format  # apply shared oxconfig formatting and safe lint fixes
```

`npm run test:portable` runs tests without private reference files.

## Layout

- `src/` — engine and loader.
- `public/` — publishable static files.
- `utils/` — development tools and tests (`npm test`).
- `private/` — original media and reference files; ignored by Git.
- `dist/` — generated build; ignored by Git.

## License

Code: [MIT](LICENSE). Dependencies: three.js (MIT), Pyodide (MPL-2.0), Python
(PSF), unshieldv3 (Apache-2.0).

Fan project, not affiliated with the owners of DeathDrome. DeathDrome © 1996
Viacom International Inc.
