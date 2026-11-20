import { fileUrl } from '@ein/ui/lib';
import { type Wad, WADS } from './wads.ts';

/** Pictures already drawn, by WAD name and size: a WAD replaced under its name draws again. */
const drawn = new Map<string, Promise<string | undefined>>();

/**
 * A WAD's title screen, `TITLEPIC`, as an image URL, or undefined when it has none or no palette
 * to colour it with (a PWAD without its own). Only the directory and the two lumps are fetched, with
 * HTTP ranges, not the whole WAD.
 */
export function titlePicture(wad: Wad): Promise<string | undefined> {
  const key = `${wad.name}:${wad.size}`;
  let picture = drawn.get(key);
  if (!picture) {
    picture = draw(`${WADS}/${wad.name}`).catch(() => undefined);
    drawn.set(key, picture);
  }
  return picture;
}

/** Bytes `start` to `start + length` of the file at `path`. */
async function range(path: string, start: number, length: number): Promise<Uint8Array> {
  const response = await fetch(fileUrl(path), { headers: { range: `bytes=${start}-${start + length - 1}` } });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // A server that ignores the range sends the whole file.
  return response.status === 206 ? bytes : bytes.subarray(start, start + length);
}

async function draw(path: string): Promise<string | undefined> {
  const header = new DataView((await range(path, 0, 12)).buffer);
  const count = header.getInt32(4, true);
  const offset = header.getInt32(8, true);
  const directory = await range(path, offset, count * 16);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  // The last lump of a name is the one Doom uses.
  const lumps = new Map<string, { at: number; size: number }>();
  for (let i = 0; i < count; i++) {
    const name = String.fromCharCode(...directory.subarray(i * 16 + 8, i * 16 + 16)).replace(/\0.*$/, '').toUpperCase();
    lumps.set(name, { at: view.getInt32(i * 16, true), size: view.getInt32(i * 16 + 4, true) });
  }
  const title = lumps.get('TITLEPIC');
  const palette = lumps.get('PLAYPAL');
  if (!title || !palette) return undefined;
  const [picture, colours] = await Promise.all([range(path, title.at, title.size), range(path, palette.at, 768)]);
  return toImage(picture, colours);
}

/**
 * Draw a picture in Doom's patch format: its width and height, then for each column the offset of
 * its posts, each post a starting row, a length and that many palette indexes between two padding
 * bytes, the column ending at row 255.
 */
function toImage(picture: Uint8Array, palette: Uint8Array): string | undefined {
  const view = new DataView(picture.buffer, picture.byteOffset, picture.byteLength);
  const width = view.getUint16(0, true);
  const height = view.getUint16(2, true);
  if (width === 0 || height === 0 || width > 1024 || height > 1024) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const image = context.createImageData(width, height);
  for (let x = 0; x < width; x++) {
    let at = view.getUint32(8 + x * 4, true);
    while (at < picture.length && picture[at] !== 0xff) {
      const top = picture[at];
      const length = picture[at + 1];
      for (let i = 0; i < length; i++) {
        const y = top + i;
        if (y >= height) break;
        const colour = picture[at + 3 + i] * 3;
        const pixel = (y * width + x) * 4;
        image.data[pixel] = palette[colour];
        image.data[pixel + 1] = palette[colour + 1];
        image.data[pixel + 2] = palette[colour + 2];
        image.data[pixel + 3] = 255;
      }
      at += length + 4;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas.toDataURL();
}
