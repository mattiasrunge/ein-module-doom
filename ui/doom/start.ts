/**
 * What the page and the engine's worker share: what the engine is started with, and where the
 * player's kept files are in its file system. Free of the DOM and of the shell's kit, as a file the
 * worker imports must be.
 */
import type { Engine } from '../../lib/api.ts';

/**
 * What the engine's worker is started with: the URLs of the game's build, Crispy Doom's Doom,
 * Heretic or Hexen (`engine`), and its command line, `-iwad` and `-file` naming the WADs in its file
 * system; the name the player plays under with others, and the address of the hosted game it joins
 * once it has started, when it joins one.
 */
export type DoomStart = {
  engine: Engine;
  glue: string;
  wasm: string;
  args: string[];
  name?: string;
  join?: string;
};

/**
 * What the page sends the worker beyond the kit's input: the wheel turned, up above 0 and down
 * below, and a setting changed in the Keys dialog, as the settings file has it (`key_up`, `72`).
 */
export type DoomInput = { wheel?: number; set?: { name: string; value: string } };

/** Each engine's settings files: its own, with the keys bound, and Crispy's, with Crispy's settings (`crispy_mouselook`). */
export const SETTINGS: Record<Engine, { main: string; crispy: string }> = {
  doom: { main: 'default.cfg', crispy: 'crispy-doom.cfg' },
  heretic: { main: 'heretic.cfg', crispy: 'crispy-heretic.cfg' },
  hexen: { main: 'hexen.cfg', crispy: 'crispy-hexen.cfg' },
};

/** Where the engine keeps the saves (`-savedir`); the settings files are in its configuration directory, `/`. */
export const SAVES = '/saves';

/**
 * The files the player keeps of a game, by their names in their saves folder of it (the adapter's
 * `kept`): Doom's saves, `doomsav<slot>.dsg`, Heretic's, `hticsav<slot>.hsg`, and Hexen's, a folder
 * for each slot (`slot<slot>/`) of its `hex<slot>.hxs` and a `hex<slot><map>.hxs` for each map it
 * keeps; Crispy's save pages number the slots on past 9. The settings files (`SETTINGS`) are the
 * player's whatever WAD they play, kept once in `~/.doom` (`SHARED`).
 */
export const KEPT = /^(doomsav\d+\.dsg|hticsav\d+\.hsg|slot\d+\/hex\d+\.hxs|(crispy-)?(doom|heretic|hexen)\.cfg|default\.cfg)$/;
export const SHARED = /^((crispy-)?(doom|heretic|hexen)\.cfg|default\.cfg)$/;

/** Where a kept file is in the engine's file system: a settings file in `/`, a save in `SAVES`, a Hexen slot's files beside the others. */
export function enginePath(name: string): string {
  if (SHARED.test(name)) return `/${name}`;
  return `${SAVES}/${name.slice(name.lastIndexOf('/') + 1)}`;
}

/** A Hexen save's slot by its file's name: `hex<slot>.hxs` is the slot's own, `hex<slot><map>.hxs` a map's, the map always two digits. */
export function hexenSlot(file: string): number | undefined {
  const digits = /^hex(\d+)\.hxs$/.exec(file)?.[1];
  if (!digits) return undefined;
  return Number(digits.length <= 2 ? digits : digits.slice(0, -2));
}

/** Hexen's slots of its own, the game being played and the one to go back to on dying, which are not saves of the player's. */
export const HEXEN_WORKING_SLOTS = new Set([6, 7]);
