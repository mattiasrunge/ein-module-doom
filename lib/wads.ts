import type { Wad } from './api.ts';

/**
 * Where the game data is: a folder in the household's shared home, so everyone signed in plays
 * the same WADs and may add to them. The module's `freedoom` service puts Freedoom here when the
 * module is installed, and what is dropped on the page is uploaded here.
 */
export const WADS = '/groups/users/doom';

/**
 * The IWADs the page knows by name, with their titles, in the order they came out, which is the
 * list's, and the order an IWAD for a PWAD is looked for in.
 */
export const IWADS: { name: string; title: string; maps: 'episodes' | 'levels' }[] = [
  { name: 'doom1.wad', title: 'Doom (shareware)', maps: 'episodes' },
  { name: 'doom.wad', title: 'Doom', maps: 'episodes' },
  { name: 'doom2.wad', title: 'Doom II', maps: 'levels' },
  { name: 'tnt.wad', title: 'Final Doom: TNT: Evilution', maps: 'levels' },
  { name: 'plutonia.wad', title: 'Final Doom: The Plutonia Experiment', maps: 'levels' },
  { name: 'freedoom1.wad', title: 'Freedoom: Phase 1', maps: 'episodes' },
  { name: 'freedoom2.wad', title: 'Freedoom: Phase 2', maps: 'levels' },
  { name: 'freedm.wad', title: 'FreeDM', maps: 'levels' },
];

/**
 * IWADs of the other games on Doom's engine, which doomgeneric does not play: each needs an engine
 * of its own. The list names them and says so rather than loading them to fail.
 */
const OTHER_GAMES: Record<string, string> = {
  'heretic.wad': 'Heretic',
  'heretic1.wad': 'Heretic (shareware)',
  'hexen.wad': 'Hexen',
  'hexdd.wad': 'Hexen: Deathkings of the Dark Citadel',
  'strife1.wad': 'Strife',
  'voices.wad': 'Strife voices',
};

const known = (name: string) => IWADS.find((iwad) => iwad.name === name.toLowerCase());

/** Known IWADs first, then the other WADs, then the other games' IWADs, which do not play here. */
const rank = (name: string) => {
  const at = IWADS.findIndex((iwad) => iwad.name === name.toLowerCase());
  return at !== -1 ? at : OTHER_GAMES[name.toLowerCase()] ? IWADS.length + 1 : IWADS.length;
};

/** The file `name` of `size` bytes as a `Wad`, or undefined when it is no `.wad`. */
export function wadOf(name: string, size: number): Wad | undefined {
  if (!/\.wad$/i.test(name)) return undefined;
  const other = OTHER_GAMES[name.toLowerCase()];
  return { name, title: other ?? known(name)?.title ?? name, size, ...(other ? { otherGame: other } : {}) };
}

/** In `rank`'s order, and by name within it. */
export const byRank = (a: Wad, b: Wad): number => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name);
