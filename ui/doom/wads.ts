import { shq } from '@ein/ui/lib';
import { execCommand } from '@ein/ui/signals';
import type { Wad } from '../../lib/api.ts';
import { IWADS, WADS } from '../../lib/wads.ts';

export type { Wad };
export { WADS };

/**
 * The WADs in `WADS`, as `doom-wads` lists them. The folder is made when it is not there yet, so the
 * list is empty rather than an error before Freedoom lands, and an upload has somewhere to go.
 */
export async function listWads(): Promise<Wad[]> {
  await execCommand(`mkdir -p ${shq(WADS)}`);
  return await execCommand<Wad[]>('doom-wads');
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
