import { shq } from '@ein/ui/lib';
import { execCommand } from '@ein/ui/signals';

/**
 * Where the game data is: a folder in the household's shared home, so everyone signed in plays
 * the same WADs and may add to them. The module's `freedoom` service puts Freedoom here when the
 * module is installed, and what is dropped on the page is uploaded here.
 */
export const WADS = '/groups/users/doom';

/** A `.wad` in `WADS`, as the page lists it. */
export type Wad = {
  /** The file's name, which is also how the page remembers it. */
  name: string;
  /** What the list calls it: the game's title for a known IWAD, else the file's name. */
  title: string;
  /** Bytes. */
  size: number;
};

/**
 * The IWADs the page knows by name, with their titles, in the order the page picks one when none
 * has been chosen and when a PWAD needs one: the games first, then Freedoom.
 */
const IWADS: { name: string; title: string; maps: 'episodes' | 'levels' }[] = [
  { name: 'doom2.wad', title: 'Doom II', maps: 'levels' },
  { name: 'doom.wad', title: 'The Ultimate Doom', maps: 'episodes' },
  { name: 'plutonia.wad', title: 'Final Doom: The Plutonia Experiment', maps: 'levels' },
  { name: 'tnt.wad', title: 'Final Doom: TNT: Evilution', maps: 'levels' },
  { name: 'doom1.wad', title: 'Doom (shareware)', maps: 'episodes' },
  { name: 'freedoom1.wad', title: 'Freedoom: Phase 1', maps: 'episodes' },
  { name: 'freedoom2.wad', title: 'Freedoom: Phase 2', maps: 'levels' },
  { name: 'freedm.wad', title: 'FreeDM', maps: 'levels' },
];

const known = (name: string) => IWADS.find((iwad) => iwad.name === name.toLowerCase());
const rank = (name: string) => {
  const at = IWADS.findIndex((iwad) => iwad.name === name.toLowerCase());
  return at === -1 ? IWADS.length : at;
};

/** What `ls -l` answers in JSON mode for each entry: only the parts the page reads. */
type Entry = { name: string; node: { type: string; attrs: { size?: number } } };

/**
 * The WADs in `WADS`, known IWADs first in `IWADS`' order, then the rest by name. The folder is
 * made when it is not there yet, so the list is empty rather than an error before Freedoom lands.
 */
export async function listWads(): Promise<Wad[]> {
  await execCommand(`mkdir -p ${shq(WADS)}`);
  const entries = await execCommand<Entry[]>(`ls -l ${shq(WADS)}`);
  return entries
    .filter((entry) => entry.node.type === 'file' && /\.wad$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, title: known(entry.name)?.title ?? entry.name, size: entry.node.attrs.size ?? 0 }))
    .sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

export async function deleteWad(name: string): Promise<void> {
  await execCommand(`rm ${shq(`${WADS}/${name}`)}`);
}

/** A WAD's header and lump names: an IWAD is a whole game, a PWAD adds to one. */
export type WadHeader = { kind: 'IWAD' | 'PWAD'; lumps: string[] };

/** Read a WAD's header and directory; throws when the bytes are not a WAD. */
export function readWad(bytes: Uint8Array): WadHeader {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (bytes.length < 12 || (magic !== 'IWAD' && magic !== 'PWAD')) throw new Error('not a WAD file: it does not start with IWAD or PWAD');
  const count = view.getInt32(4, true);
  const offset = view.getInt32(8, true);
  if (count < 0 || offset < 12 || offset + count * 16 > bytes.length) throw new Error('not a WAD file: its directory lies outside it');
  const lumps: string[] = [];
  for (let i = 0; i < count; i++) {
    const name = bytes.subarray(offset + i * 16 + 8, offset + i * 16 + 16);
    const end = name.indexOf(0);
    lumps.push(String.fromCharCode(...(end === -1 ? name : name.subarray(0, end))).toUpperCase());
  }
  return { kind: magic, lumps };
}

/**
 * The IWAD a PWAD is played with, out of the WADs there are: one with the same kind of maps,
 * `MAP01` for Doom II's levels or `E1M1` for Doom's episodes, in `IWADS`' order. The shareware
 * IWAD is never one, since Doom refuses to add a PWAD to it.
 */
export function iwadFor(pwad: WadHeader, wads: Wad[]): Wad | undefined {
  const levels = pwad.lumps.some((lump) => /^MAP\d\d$/.test(lump));
  const episodes = pwad.lumps.some((lump) => /^E\dM\d$/.test(lump));
  const fits = IWADS.filter((iwad) => iwad.name !== 'doom1.wad' && (levels === episodes || iwad.maps === (levels ? 'levels' : 'episodes')));
  for (const iwad of fits) {
    const wad = wads.find((each) => each.name.toLowerCase() === iwad.name);
    if (wad) return wad;
  }
  return undefined;
}
