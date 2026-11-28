import type { Command, NodeAttrs } from '@ein/client';
import type { Engine, Game, OfferedWad, Wad } from './api.ts';
import { rawTitlePng, titlePng } from './titlepic.ts';

/**
 * Where the game data is: a folder in the household's shared home, so everyone signed in plays
 * the same WADs and may add to them. The game data offered (`OFFERS`) is fetched here by
 * `doom-fetch`, and what is dropped on the Games page is uploaded here.
 */
export const WADS = '/groups/users/doom';

/** Free game data `doom-fetch` fetches, offered while one of its WADs is not here. */
type Offer = { about: string; wads: string[]; download: number };

const OFFERS: Offer[] = [
  {
    about: "Free game data for Doom's engine: Phase 1 plays as Doom, Phase 2 as Doom II. Fetching one fetches both.",
    wads: ['freedoom1.wad', 'freedoom2.wad'],
    download: 24_143_781,
  },
  {
    about: "The first episode of Raven Software's Heretic, its shareware release, which Raven let anyone play and pass on.",
    wads: ['heretic1.wad'],
    download: 2_898_794,
  },
  {
    about: "The first four levels of Raven Software's Hexen, its demo, which Raven let anyone play and pass on.",
    wads: ['hexen.wad'],
    download: 5_664_734,
  },
];

/**
 * The IWADs known by name, with their titles, in the order they came out, which is the list's, and
 * the order an IWAD for a PWAD is looked for in.
 */
const IWADS: { name: string; title: string; engine: Engine; maps: 'episodes' | 'levels'; description: string }[] = [
  {
    name: 'doom1.wad',
    title: 'Doom (shareware)',
    engine: 'doom',
    maps: 'episodes',
    description:
      "Knee-Deep in the Dead, the first episode of id Software's Doom (1993): a marine alone against the demons of Hell on Mars's moon Phobos, free to play and pass on.",
  },
  {
    name: 'doom.wad',
    title: 'Doom',
    engine: 'doom',
    maps: 'episodes',
    description: "id Software's 1993 first-person shooter: a marine alone against the demons of Hell on Mars's moons Phobos and Deimos, and beyond.",
  },
  {
    name: 'doom2.wad',
    title: 'Doom II',
    engine: 'doom',
    maps: 'levels',
    description: 'Doom II: Hell on Earth (1994): the demons have reached Earth, and the marine fights through thirty levels of a ruined city and back into Hell.',
  },
  {
    name: 'tnt.wad',
    title: 'Final Doom: TNT: Evilution',
    engine: 'doom',
    maps: 'levels',
    description: "Half of Final Doom (1996): thirty-two levels by TeamTNT, a research base on Jupiter's moon Io overrun by Hell, on Doom II's engine.",
  },
  {
    name: 'plutonia.wad',
    title: 'Final Doom: The Plutonia Experiment',
    engine: 'doom',
    maps: 'levels',
    description: "Half of Final Doom (1996): thirty-two hard levels by Dario and Milo Casali, on Doom II's engine.",
  },
  {
    name: 'freedoom1.wad',
    title: 'Freedoom: Phase 1',
    engine: 'doom',
    maps: 'episodes',
    description: "Free game data for Doom's engine, made by its community: four episodes of new levels, monsters and music, played as the first Doom is.",
  },
  {
    name: 'freedoom2.wad',
    title: 'Freedoom: Phase 2',
    engine: 'doom',
    maps: 'levels',
    description: "Free game data for Doom's engine, made by its community: thirty-two levels of new maps, monsters and music, played as Doom II is.",
  },
  { name: 'freedm.wad', title: 'FreeDM', engine: 'doom', maps: 'levels', description: "Freedoom's deathmatch levels, made for playing against each other." },
  {
    name: 'heretic1.wad',
    title: 'Heretic (shareware)',
    engine: 'heretic',
    maps: 'episodes',
    description:
      "City of the Damned, the first episode of Raven Software's Heretic (1994): an elf alone against the Serpent Riders' undead legions, with a wand and a bag of artifacts. Free to play and pass on.",
  },
  {
    name: 'heretic.wad',
    title: 'Heretic',
    engine: 'heretic',
    maps: 'episodes',
    description:
      "Raven Software's 1994 dark fantasy on Doom's engine: an elf against D'Sparil, the first of the Serpent Riders, through three episodes, or five in Shadow of the Serpent Riders, with artifacts to carry and a sky to look up at.",
  },
  {
    name: 'hexen.wad',
    title: 'Hexen',
    engine: 'hexen',
    maps: 'levels',
    description:
      "Hexen: Beyond Heretic (1995), Raven Software's sequel: a fighter, a cleric or a mage against Korax, the second Serpent Rider, through hubs of levels joined by portals and puzzles.",
  },
];

/** Hexen's demo, four of its levels, is a `hexen.wad` too, without the full game's fifth map. */
const HEXEN_DEMO = {
  title: 'Hexen (demo)',
  description: "The first four levels of Raven Software's Hexen: Beyond Heretic (1995): a fighter, a cleric or a mage in the Seven Portals hub. Free to play and pass on.",
};

/** WADs of Strife, the one game on Doom's engine Crispy Doom plays that this module does not build. The list leaves them out. */
const OTHER_GAMES: Record<string, string> = {
  'strife1.wad': 'Strife',
  'voices.wad': 'Strife voices',
};

/** Hexen's expansion, Deathkings of the Dark Citadel, played over the full Hexen as a PWAD is, whatever its header says: some releases have it an IWAD. */
const HEXDD = { name: 'hexdd.wad', title: 'Hexen: Deathkings of the Dark Citadel' };

const known = (name: string) => IWADS.find((iwad) => iwad.name === name.toLowerCase());

/** Known IWADs first, then the other WADs. */
const rank = (name: string) => {
  const at = IWADS.findIndex((iwad) => iwad.name === name.toLowerCase());
  return at !== -1 ? at : IWADS.length;
};

/** A map's lump's name: Doom's and Heretic's episodes' `E1M1`, Doom II's and Hexen's levels' `MAP01`. */
const MAP = /^(E\d+M\d+|MAP\d+)$/;

/** The maps of `wad`, by their lumps' names, in the order they are played: by episode, then by number. */
function mapsOf(wad: WadDirectory): string[] {
  const order = (map: string) => map.match(/\d+/g)!.map(Number);
  return [...wad.lumps.keys()].filter((lump) => MAP.test(lump)).sort((a, b) => {
    const [x, y] = [order(a), order(b)];
    return x[0] - y[0] || (x[1] ?? 0) - (y[1] ?? 0);
  });
}

/** In `rank`'s order, and by name within it. */
const byRank = (a: Wad, b: Wad): number => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);

/** `bytes` as a person reads a size: `28 MB`. */
const sizeText = (bytes: number): string =>
  bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} kB`;

/** Where a lump's bytes are in its WAD. */
type Lump = { at: number; size: number };

/** A WAD's header and directory: an IWAD is a whole game, a PWAD adds to one; its lumps by name, the last of a name the one Doom uses. */
type WadDirectory = { path: string; kind: 'IWAD' | 'PWAD'; lumps: Map<string, Lump> };

/** `length` bytes of the file at `path` from `at` on, fewer when it ends sooner. */
async function readRange(cmd: Command, path: string, at: number, length: number): Promise<Uint8Array> {
  const handle = await cmd.sys.vfs.open(cmd.access, path, { mode: 'r' });
  try {
    // 0 is SEEK_SET: from the start of the file.
    await handle.seek(at, 0);
    const bytes = new Uint8Array(length);
    let filled = 0;
    while (filled < length) {
      const chunk = await handle.read(length - filled);
      if (chunk.length === 0) break;
      bytes.set(chunk, filled);
      filled += chunk.length;
    }
    return bytes.subarray(0, filled);
  } finally {
    await handle.close();
  }
}

/** The header and directory of the WAD at `path`, reading only those; undefined when it is not a WAD. */
async function readDirectory(cmd: Command, path: string): Promise<WadDirectory | undefined> {
  const header = await readRange(cmd, path, 0, 12);
  const magic = String.fromCharCode(...header.subarray(0, 4));
  if (header.length < 12 || (magic !== 'IWAD' && magic !== 'PWAD')) return undefined;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const count = view.getInt32(4, true);
  const offset = view.getInt32(8, true);
  if (count < 0 || offset < 12) return undefined;
  const directory = await readRange(cmd, path, offset, count * 16);
  if (directory.length < count * 16) return undefined;
  const entries = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const lumps = new Map<string, Lump>();
  for (let i = 0; i < count; i++) {
    const name = String.fromCharCode(...directory.subarray(i * 16 + 8, i * 16 + 16)).replace(/\0.*$/s, '').toUpperCase();
    lumps.set(name, { at: entries.getInt32(i * 16, true), size: entries.getInt32(i * 16 + 4, true) });
  }
  return { path, kind: magic, lumps };
}

/**
 * The game an IWAD is, by its name when it is known, else by its lumps: Hexen's maps have scripts
 * (`BEHAVIOR`) and a `MAPINFO`, Heretic's title screen is a `TITLE` where Doom's is a `TITLEPIC`.
 */
function engineOf(name: string, iwad: WadDirectory): Engine {
  const named = known(name)?.engine;
  if (named) return named;
  if (iwad.lumps.has('MAPINFO') && iwad.lumps.has('BEHAVIOR')) return 'hexen';
  if (iwad.lumps.has('TITLE') && !iwad.lumps.has('TITLEPIC')) return 'heretic';
  return 'doom';
}

/** The IWADs here, by name, with the game each is, and whether it is Hexen's demo. */
type Here = { name: string; engine: Engine; demo: boolean }[];

/** Whether `name` is Hexen's demo: a `hexen.wad` without the full game's fifth map. */
const hexenDemo = (name: string, wad: WadDirectory): boolean => name.toLowerCase() === 'hexen.wad' && !wad.lumps.has('MAP05');

/**
 * The IWAD a PWAD is played with, out of the IWADs `here`: a Hexen one for a PWAD whose maps have
 * scripts (`BEHAVIOR`), else one with the same kind of maps, `MAP01` for Doom II's levels or `E1M1`
 * for Doom's and Heretic's episodes, Doom's before Heretic's, in `IWADS`' order and then any other
 * here of the game. The shareware and demo IWADs are never one, since the games refuse to add a
 * PWAD to them.
 */
function iwadFor(name: string, pwad: WadDirectory, here: Here): string | undefined {
  const lumps = [...pwad.lumps.keys()];
  const levels = lumps.some((lump) => /^MAP\d\d$/.test(lump));
  const episodes = lumps.some((lump) => /^E\dM\d$/.test(lump));
  const hexen = name.toLowerCase() === HEXDD.name || pwad.lumps.has('BEHAVIOR');
  const fits = (iwad: { engine: Engine; maps: 'episodes' | 'levels' }) =>
    hexen ? iwad.engine === 'hexen' : iwad.engine !== 'hexen' && (levels === episodes || iwad.maps === (levels ? 'levels' : 'episodes'));
  const full = here.filter((iwad) => !iwad.demo && !['doom1.wad', 'heretic1.wad'].includes(iwad.name.toLowerCase()));
  for (const iwad of IWADS.filter(fits)) {
    const found = full.find((each) => each.name.toLowerCase() === iwad.name);
    if (found) return found.name;
  }
  return full.find((each) => !known(each.name) && (hexen ? each.engine === 'hexen' : each.engine !== 'hexen'))?.name;
}

/**
 * A WAD's title screen as the game shows it, out of `wads`, the WADs it is played with, an IWAD and
 * a PWAD over it, in the order the game loads them: the last that has a lump is the one the game
 * uses, so a PWAD without a title screen or a palette of its own shows its IWAD's. Doom's is its
 * `TITLEPIC` (`titlePng`), Heretic's and Hexen's a `TITLE` of raw pixels (`rawTitlePng`). Only the
 * two lumps are read; undefined when there is no title screen or no palette.
 */
async function titlePicture(cmd: Command, wads: WadDirectory[]): Promise<string | undefined> {
  const find = (name: string) => wads.map((wad) => wad.lumps.has(name) ? { path: wad.path, ...wad.lumps.get(name)! } : undefined).filter((lump) => lump !== undefined).at(-1);
  const patch = find('TITLEPIC');
  const raw = patch ? undefined : find('TITLE');
  const title = patch ?? raw;
  const palette = find('PLAYPAL');
  if (!title || !palette) return undefined;
  const [picture, colours] = await Promise.all([readRange(cmd, title.path, title.at, title.size), readRange(cmd, palette.path, palette.at, 768)]);
  return await (patch ? titlePng(picture, colours) : rawTitlePng(picture, colours));
}

/**
 * The WADs in `WADS`, known IWADs first, then the free game data offered whose WADs are not there,
 * as `doom-wads` lists them. A file that is not a WAD, and a WAD of Strife (`OTHER_GAMES`), which
 * this module does not play, are left out.
 */
export async function findWads(cmd: Command): Promise<Game[]> {
  // No folder yet is no WADs yet: a fetch or a drop makes it.
  const children = await cmd.sys.vfs.children(cmd.access, WADS).catch(() => []);
  const names = children.filter((child) => child.node.type === 'file' && /\.wad$/i.test(child.name) && !OTHER_GAMES[child.name.toLowerCase()]).map((child) => child.name);
  const read = await Promise.all(names.map(async (name) => {
    const path = `${WADS}/${name}`;
    const [node, directory] = await Promise.all([
      cmd.sys.vfs.get<NodeAttrs & { size?: number }>(cmd.access, path),
      readDirectory(cmd, path).catch(() => undefined),
    ]);
    return directory && { name, size: node.attrs.size ?? 0, directory };
  }));
  const wads = read.filter((wad) => wad !== undefined);
  const kindOf = (name: string, directory: WadDirectory) => name.toLowerCase() === HEXDD.name ? 'PWAD' : directory.kind;
  const iwads = wads.filter((wad) => kindOf(wad.name, wad.directory) === 'IWAD').map((wad) => ({
    ...wad,
    engine: engineOf(wad.name, wad.directory),
    demo: hexenDemo(wad.name, wad.directory),
  }));
  const installed = await Promise.all(wads.map(async ({ name, size, directory }): Promise<Wad> => {
    const kind = kindOf(name, directory);
    const iwad = kind === 'PWAD' ? iwadFor(name, directory, iwads) : undefined;
    // What the game shows: the IWAD's lumps, and the PWAD's over them.
    const under = iwads.find((each) => each.name === iwad);
    const engine = under?.engine ?? (kind === 'IWAD' ? engineOf(name, directory) : name.toLowerCase() === HEXDD.name ? 'hexen' : 'doom');
    const cover = await titlePicture(cmd, under ? [under.directory, directory] : [directory]).catch(() => undefined);
    const naming = hexenDemo(name, directory) ? HEXEN_DEMO : name.toLowerCase() === HEXDD.name ? HEXDD : known(name);
    const title = naming?.title ?? name;
    const description = naming && 'description' in naming ? naming.description : undefined;
    const iwadTitle = (wad: string) => wad.toLowerCase() === 'hexen.wad' ? 'Hexen' : known(wad)?.title ?? wad;
    const played = kind === 'PWAD' ? iwad ? `on ${iwadTitle(iwad)}` : 'no IWAD here for it' : undefined;
    const detail = [title === name ? undefined : name, sizeText(size), played].filter(Boolean).join(' · ');
    // A PWAD is played on its own maps, and one without any on its IWAD's.
    const own = mapsOf(directory);
    const maps = own.length > 0 || !under ? own : mapsOf(under.directory);
    return {
      id: name,
      title,
      state: 'installed',
      path: `${WADS}/${name}`,
      detail,
      ...(description ? { description } : {}),
      size,
      ...(cover ? { cover } : {}),
      kind,
      engine,
      ...(iwad ? { iwad } : {}),
      maps,
      hostable: maps.length > 0 && (kind === 'IWAD' || under !== undefined),
    };
  }));
  const offered = OFFERS.flatMap((offer) =>
    offer.wads.filter((wad) => !names.some((name) => name.toLowerCase() === wad)).map((wad): OfferedWad => ({
      id: wad,
      // The Hexen offered is its demo.
      title: wad === 'hexen.wad' ? HEXEN_DEMO.title : known(wad)?.title ?? wad,
      state: 'offered',
      about: offer.about,
      download: offer.download,
    }))
  );
  return [...installed.sort(byRank), ...offered];
}
