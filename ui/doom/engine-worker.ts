/// <reference lib="webworker" />
/**
 * The module's engine worker (`engine.ts` starts it): Crispy Doom's Doom, Heretic or Hexen,
 * Emscripten's builds in `assets/`, runs here rather than in the page, on the games module's kit
 * (`@games/engine`). The WADs are read from EiN as the game asks for them, a piece at a time with
 * range requests, so a level is downloaded as it is played; the player's saves and settings are
 * given whole. Each tick runs the game's frame and answers with it, the sound effects mixed over the
 * music for the time since the last tick, and whether the game's menu is up.
 *
 * What the game writes, its saves and its settings, goes back to the page as it changes: after each
 * tick the worker looks at the settings files and the saves folder, which change only as the game
 * saves, quits or closes a menu, and hands over each file written since. A Hexen slot is a folder of
 * its files, handed over whole, so the maps a save no longer has are gone from the player's too.
 */
import { argv, type Boot, type EmscriptenFS, type EmscriptenModule, type Engine, FrameCanvas, heapSound, type Kept, serveEngine, startEmscripten } from '@games/engine';
import { type DoomInput, type DoomStart, HEXEN_WORKING_SLOTS, hexenSlot, SAVES, SETTINGS } from './start.ts';

/** What the engine's platform layer exports (`engine/ein_main.c`, `engine/ein_video.c`, `engine/ein_sound.c`), beside Emscripten's own. */
type CrispyModule = Omit<EmscriptenModule, 'FS'> & {
  // Emscripten's stat says when a file was written, and its size, beside its mode.
  FS: Omit<EmscriptenFS, 'stat'> & { stat(path: string): { mode: number; size: number; mtime: Date } };
  _ein_start(
    argc: number,
    argv: number,
    sampleRate: number,
    width: number,
    height: number,
  ): void;
  _ein_join(address: number): void;
  _ein_tick(): void;
  _ein_key(pressed: number, scancode: number): void;
  _ein_button(pressed: number, button: number): void;
  _ein_wheel(y: number): void;
  _ein_mouse(dx: number, dy: number): void;
  _ein_save_config(): void;
  _ein_set_variable(name: number, value: number): number;
  _ein_menu(): number;
  _ein_screen(): number;
  _ein_width(): number;
  _ein_height(): number;
  _ein_frames(): number;
  _ein_audio_render(at: number, frames: number): void;
};

let game: CrispyModule;
let boot: Boot<DoomStart>;
let drawn = 0;
const frames = new FrameCanvas(640, 480);
let sound: ((count: number) => Int16Array<ArrayBuffer>) | undefined;

/** When each file the game may write was last seen written, as its modification time and size: those it was given count as seen. */
const seen = new Map<string, string>();

const stamp = (path: string): string | undefined => {
  try {
    const { mtime, size } = game.FS.stat(path);
    return `${mtime.getTime()}:${size}`;
  } catch {
    return undefined;
  }
};

/** The files in the saves folder. */
const saves = (): string[] => {
  try {
    return game.FS.readdir(SAVES).filter((name) => name !== '.' && name !== '..');
  } catch {
    return [];
  }
};

/** Whether `path` was written since it was last seen, noting it as seen. */
function written(path: string): boolean {
  const now = stamp(path);
  if (now === seen.get(path)) return false;
  if (now === undefined) seen.delete(path);
  else seen.set(path, now);
  return true;
}

/**
 * Hand the page each settings file and save the game wrote since this last looked: Doom's and
 * Heretic's saves a file each, a Hexen slot a folder of its files (`slot<slot>/`), all of them or
 * none once the slot was cleared.
 */
function keepWritten(): void {
  const { main, crispy } = SETTINGS[boot.payload.engine];
  const files: Kept[] = [];
  for (const name of [main, crispy]) {
    if (written(`/${name}`)) {
      files.push({ name, data: game.FS.readFile(`/${name}`) });
    }
  }
  const names = saves();
  if (boot.payload.engine !== 'hexen') {
    for (const name of names) {
      if (
        /^(doomsav\d+\.dsg|hticsav\d+\.hsg)$/.test(name) &&
        written(`${SAVES}/${name}`)
      ) files.push({ name, data: game.FS.readFile(`${SAVES}/${name}`) });
    }
  }
  if (files.length) boot.keep({ files });
  if (boot.payload.engine !== 'hexen') return;
  // Hexen's slots: those with a file written, and those with a file gone.
  const slots = new Map<number, string[]>();
  for (const name of names) {
    const slot = hexenSlot(name);
    if (slot !== undefined && !HEXEN_WORKING_SLOTS.has(slot)) {
      slots.set(slot, [...slots.get(slot) ?? [], name]);
    }
  }
  const changed = new Set<number>();
  for (const [slot, inside] of slots) {
    if (inside.map((name) => written(`${SAVES}/${name}`)).some(Boolean)) {
      changed.add(slot);
    }
  }
  for (const path of [...seen.keys()]) {
    const name = path.slice(SAVES.length + 1);
    const slot = path.startsWith(`${SAVES}/`) ? hexenSlot(name) : undefined;
    if (slot !== undefined && !names.includes(name)) {
      seen.delete(path);
      changed.add(slot);
    }
  }
  for (const slot of changed) {
    const folder = `slot${slot}`;
    boot.keep({
      folder,
      files: (slots.get(slot) ?? []).map((name) => ({
        name: `${folder}/${name}`,
        data: game.FS.readFile(`${SAVES}/${name}`),
      })),
    });
  }
}

/** Set the setting `name` to `value`, as the settings file would. */
function setVariable(name: string, value: string): void {
  const at = game.stringToNewUTF8(name);
  const to = game.stringToNewUTF8(value);
  game._ein_set_variable(at, to);
  game._free?.(at);
  game._free?.(to);
}

const engine: Engine<DoomStart> = {
  async boot(started) {
    boot = started;
    game = await startEmscripten<CrispyModule>(boot, boot.payload);
    for (const name of Object.values(SETTINGS[boot.payload.engine])) {
      written(`/${name}`);
    }
    for (const name of saves()) written(`${SAVES}/${name}`);
    // Without sound the music is made at a rate nothing asks for, and never pulled.
    if (boot.sampleRate) {
      sound = heapSound(game, (at, count) => game._ein_audio_render(at, count));
    }
    try {
      game._ein_start(
        boot.payload.args.length,
        argv(game, boot.payload.args),
        boot.sampleRate ?? 48000,
        boot.screen.width,
        boot.screen.height,
      );
    } catch (error) {
      // The game unwinds its start once its loop would begin (`EIN_MainLoop`): it has started.
      if (error !== 'unwind') throw error;
    }
    // With others the player plays under their account's name; the page's Join joins its server.
    if (boot.payload.name) setVariable('player_name', boot.payload.name);
    if (boot.payload.join) {
      const address = game.stringToNewUTF8(boot.payload.join);
      game._ein_join(address);
      game._free?.(address);
    }
  },
  tick() {
    game._ein_tick();
    keepWritten();
  },
  frame() {
    if (game._ein_frames() === drawn) return undefined;
    drawn = game._ein_frames();
    return frames.rgba(
      new Uint8Array(game.HEAPU8.buffer, game._ein_screen()),
      game._ein_width(),
      game._ein_height(),
    );
  },
  sound: (count) => sound?.(count),
  key: (pressed, scancode) => game._ein_key(pressed ? 1 : 0, scancode),
  mouse: (dx, dy) => game._ein_mouse(dx, dy),
  button: (pressed, button) => game._ein_button(pressed ? 1 : 0, button),
  input(data) {
    const input = data as DoomInput;
    if (input.wheel) game._ein_wheel(input.wheel);
    if (input.set) setVariable(input.set.name, input.set.value);
  },
  menu: () => game._ein_menu() !== 0,
  keep() {
    game._ein_save_config();
    keepWritten();
  },
};

serveEngine(engine);
