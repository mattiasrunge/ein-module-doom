/** Which of Crispy Doom's games a WAD is played on: Doom, Heretic or Hexen. */
export type Engine = 'doom' | 'heretic' | 'hexen';

/**
 * A `.wad` in the WAD folder, as `doom-wads` answers it: what the Games page reads of it (its
 * `GameEntry`), and what the adapter needs to start it: the IWAD a PWAD is played with.
 */
export type Wad = {
  /** The file's name, which is also how a game's page and a card remember it. */
  id: string;
  /** What the Games page calls it: the game's title for a known IWAD, else the file's name. */
  title: string;
  state: 'installed';
  /** The file. */
  path: string;
  /** Its file's name and size, and what it is played with, as the Games page shows them under its title. */
  detail: string;
  /** What the game is, for an IWAD the module knows, shown under its title on its page. */
  description?: string;
  /** Bytes. */
  size: number;
  /** Its title screen, Doom's `TITLEPIC` or Heretic's and Hexen's `TITLE`, as a PNG `data:` URL; none when there is none to show. */
  cover?: string;
  /** Whether it is a whole game, an IWAD, or adds to one, a PWAD. */
  kind: 'IWAD' | 'PWAD';
  /** The game it is played on: an IWAD's own, a PWAD's IWAD's. */
  engine: Engine;
  /** A PWAD's IWAD, the one in the folder it is played with; none when there is none for it here. */
  iwad?: string;
  /** Its maps by their lumps' names (`E1M1`, `MAP01`): a PWAD's own, or its IWAD's when it has none. */
  maps: string[];
  /** Whether it can be hosted for others to join: it has maps, and a PWAD has its IWAD here. */
  hostable: boolean;
};

/** A WAD of the free game data `doom-fetch` fetches, while it is not in the folder. */
export type OfferedWad = {
  /** The file it is fetched as, and what `doom-fetch` takes. */
  id: string;
  title: string;
  state: 'offered';
  /** What it is, and the bytes fetching it downloads. */
  about: string;
  download: number;
};

/** A WAD as `doom-wads` answers it: in the folder, or offered to fetch. */
export type Game = Wad | OfferedWad;
