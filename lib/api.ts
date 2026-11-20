/** A `.wad` in the WAD folder, as `doom-wads` answers it and the page lists it. */
export type Wad = {
  /** The file's name, which is also how the page and a card remember it. */
  name: string;
  /** What the list calls it: the game's title for a known IWAD, else the file's name. */
  title: string;
  /** Bytes. */
  size: number;
  /** The game it is when that is not Doom, which this engine cannot play: Heretic, Hexen, Strife. */
  otherGame?: string;
};
