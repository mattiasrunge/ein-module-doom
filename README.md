# doom

A module for [EiN](https://einhq.eu) that plays Doom in the browser, with sound and music, on a
page of its own at `/doom`.

The engine is [doomgeneric](https://github.com/ozkl/doomgeneric) built to WebAssembly with
Emscripten, single-threaded, with a platform layer of its own (`engine/doomgeneric_ein.c`) and no
SDL. The page loads it at runtime from the module's `assets/` directory, drives it from
`requestAnimationFrame` and draws its 320 by 200 frames on a canvas, shown at 4:3.

It is not one of EiN's own modules and has nothing to do with a family's archive.

## Install

As an administrator, open **Settings → Modules**, choose **Install**, and give
`https://github.com/fredrik/ein-module-doom` under **From a repository**.

Doom appears in the sidebar. While the module installs, it fetches
[Freedoom](https://freedoom.github.io), free game data for Doom's engine, so there is something to
play straight away: **Freedoom: Phase 1** plays as Doom, **Freedoom: Phase 2** as Doom II.

## Play

The page lists the WADs there are at the left; on a phone they are behind the list button in the
page's bar. Choose one to play it. The page remembers the one you played last.

Click the game first, so it has the keyboard. Arrows move, Ctrl fires, Space opens doors, Shift
runs, Alt strafes, Escape opens Doom's menu, Enter picks. While the game has the focus it takes
these keys before EiN does, Alt+letter included; click outside it to give them back. The buttons in
the bar turn the sound off and on and show the game full screen.

## Add your own WADs

Drag one or more `.wad` files from your computer and drop them anywhere on the page, or choose
**Upload** in the page's bar. They are uploaded and appear in the list.

- An IWAD is a whole game: `doom.wad`, `doom2.wad`, `plutonia.wad`, `tnt.wad`, or the shareware
  `doom1.wad`. The list calls a known one by its game's name.
- A PWAD adds levels or changes to a game. Choosing one plays it over an IWAD with the same kind of
  maps: one with `MAP01` levels over Doom II (or Final Doom, or Freedoom: Phase 2), one with `E1M1`
  episodes over Doom (or Freedoom: Phase 1). Doom will not add a PWAD to the shareware IWAD.

The WADs are kept in `/groups/users/doom`, the household's shared folder, so everyone with an
account plays the same ones and may add to them, and they stay when the module is updated or
installed again. The bin beside a WAD deletes it for everyone. A deleted Freedoom WAD stays deleted;
to fetch Freedoom again, delete `.freedoom-0.13.0` in that folder and restart the `freedoom` service
on the **Status**'s services tab.

## Sound

The sound effects play through the browser's Web Audio, at the volume and side Doom gives each. The
music is Doom's own: its MUS tracks played on an emulated OPL3, the FM chip of the Sound Blaster and
AdLib cards, by [Chocolate Doom](https://www.chocolate-doom.org)'s OPL music code and the
[Nuked OPL3](https://github.com/nukeykt/Nuked-OPL3) emulator. Doom's **Options → Sound Volume**
sets both.

## Not yet

No mouse, and saved games last only as long as the page.

## Layout

| Path                                 | What it is for                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `mod.json`, `ui/nav.json`            | The manifest and the sidebar entry.                                                                                              |
| `ui/pages/doom.tsx`                  | The page: the list of WADs, uploads, the game loop, keyboard, sound and fullscreen.                                              |
| `ui/doom/wads.ts`                    | Lists, deletes and reads WADs, and finds the IWAD a PWAD is played over.                                                         |
| `ui/doom/engine.ts`                  | Loads the glue, the wasm and the WADs, and wraps the engine's exports.                                                           |
| `ui/doom/sound.ts`                   | The sound effects and the music on Web Audio.                                                                                    |
| `ui/doom/keys.ts`                    | Browser key codes to Doom's.                                                                                                     |
| `services/freedoom/`                 | Fetches Freedoom into the WAD folder once, checked against its release's SHA-256, then ends.                                     |
| `engine/doomgeneric_ein.c`           | doomgeneric's platform layer for the page.                                                                                       |
| `engine/ein_sound.c`                 | The sound module: hands each effect's samples to the page once, then plays them on its channels.                                 |
| `engine/opl_ein.c`                   | Chocolate Doom's OPL library on Nuked OPL3, rendering music when the page asks for samples.                                      |
| `engine/ein_chocolate.h`             | What Chocolate Doom's music code expects of its own headers that doomgeneric's lack.                                             |
| `engine/Containerfile`               | The build: pinned emsdk image, doomgeneric commit and Chocolate Doom release.                                                    |
| `engine/nonblocking-wipe.patch`      | Runs the screen melt a frame at a time instead of in a loop that froze the page for a second.                                    |
| `assets/doom.js`, `assets/doom.wasm` | The built engine, committed, since a module is installed as its repository stands. `assets/doom-build.txt` says what built them. |
| `scripts/build-engine.sh`            | Rebuilds `assets/doom.js` and `assets/doom.wasm`.                                                                                |
| `test/smoke.mjs`                     | Signs in with headless Chrome, plays a little, saves screenshots.                                                                |
| `deno.jsonc`                         | Generated from `mod.json` by core's `deno task sync:modules`, for type-checking in a core checkout.                              |

## Building the engine

Needs only docker with buildx, or podman; nothing is installed on the host.

    scripts/build-engine.sh

It builds `engine/Containerfile` and exports the result into `assets/` with the local exporter. The
source of the committed `assets/doom.wasm` is doomgeneric at the commit `engine/Containerfile`
pins, with `engine/nonblocking-wipe.patch` applied, Chocolate Doom's `i_oplmusic.c`,
`midifile.c`, `opl3.c` and `opl_queue.c` at the release it pins, and the `engine/` files added.

## Developing

Mount the checkout read-only in EiN's container as `/modules-dev/doom` and set
`DEV_MODULES_PATH=/modules-dev`; EiN sets the module up when it starts, and it runs instead of an
installed one. After a change to a page, run `ui-build doom` in EiN's terminal and reload the
browser; after a change to `mod.json` or a service, `mod setup doom`. A file in `assets/` is read
as it is.

The smoke test wants a running EiN with the module and a WAD, Google Chrome, and Node 22 or later:

    EIN_PASSWORD=... node test/smoke.mjs --out /some/directory

## Licence

GPL-2.0-or-later, as doomgeneric and Chocolate Doom are: see `LICENSE`. Doom's source is © id
Software and the Chocolate Doom and doomgeneric authors; their notices are in the source the build
fetches. Nuked OPL3 (`opl3.c`) is LGPL-2.1-or-later, © Nuke.YKT. `assets/doom.js` is Emscripten's
runtime, under the MIT licence. Freedoom, which the module fetches and does not ship, is under its
own BSD-style licence.
