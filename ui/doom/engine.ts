import { fileUrl } from '@ein/ui/lib';
import type { RunningGame, StartOptions, Written } from '@games/adapter';
import { startWorkerGame } from '@games/worker';
import type { Wad } from '../../lib/api.ts';
import { heardKept, heardRunning, heardWritten, inCrispy, moduleDefaults, settingsOf, withSetting } from './binds.ts';
import { scancode } from './keys.ts';
import { type DoomInput, type DoomStart, enginePath, SAVES, SETTINGS } from './start.ts';

/** Where the module's built engines sit in EiN's tree: `doom`, `heretic` and `hexen`, each a glue and its wasm. */
const ASSETS = '/usr/modules/doom/assets';

/**
 * A settings file as the game is started with it: a key from before Crispy Doom, which kept keys
 * above 127 that Crispy reads as none, is left out, so the game binds its default; the module's
 * defaults (`moduleDefaults`) the player has not set are added; and the sample rate is this
 * browser's (`ein_start`), not that of the one they were written in.
 */
function startingSettings(data: Uint8Array | undefined, defaults: [string, number][]): Uint8Array<ArrayBuffer> | undefined {
  let text = (data ? new TextDecoder().decode(data) : '')
    .split('\n')
    .filter((line) => !/^snd_samplerate\s/.test(line) && !(Number(/^key_\w+\s+(\d+)/.exec(line)?.[1]) > 127))
    .join('\n');
  const own = settingsOf(text);
  for (const [setting, value] of defaults) if (!own.has(setting)) text = withSetting(text, setting, String(value));
  return text ? new TextEncoder().encode(text) : undefined;
}

/**
 * Start `game`'s WAD, and the IWAD under it when it is a PWAD, on its engine, Crispy Doom's Doom,
 * Heretic or Hexen, in the module's engine worker (`engine-worker.ts`, `mod.json` `ui.workers`).
 * The game's file system has the WADs under their own names, which is what the games tell
 * themselves apart by, read from EiN as they ask for them; and the player's `kept` files where the
 * game reads them, its saves in `SAVES` listed by Load Game, its settings read as it starts.
 * `sound` plays what the engine mixes; without it the game is silent. `onKeep` hears each game
 * saved, and the settings as the game writes them, on Quit and as its menu closes.
 *
 * With `servers`, the network every server of the game is on, the game's menu has Join Game, which
 * finds them; with `online` the game joins that one as it starts, playing a game already under way
 * through to where the others are first (`engine/ein_net.c`). With others the player plays under
 * `name`, their account's.
 *
 * The keys go to the engine as SDL scancodes (`keys.ts`); the mouse, once the page has handed it
 * over, as its movement, its buttons in SDL's numbering (the browser's plus one) and its wheel.
 */
export async function startDoom(
  { game, sound, log, kept, onKeep, name, online, servers }: StartOptions<Wad>,
): Promise<RunningGame> {
  if (game.kind === 'PWAD' && !game.iwad) {
    throw new Error(
      `${game.id} adds to a game, and there is no IWAD here for it: drop the game's IWAD on the Games page`,
    );
  }
  const engine = game.engine;
  const folder = game.path.slice(0, game.path.lastIndexOf('/'));
  const wads = game.iwad ? ['-iwad', `/${game.iwad}`, '-file', `/${game.id}`] : ['-iwad', `/${game.id}`];
  const { main, crispy } = SETTINGS[engine];
  const defaults = Object.entries(moduleDefaults(engine));
  const settings = [main, crispy].flatMap((name) => {
    const data = startingSettings(
      kept.find((file) => file.name === name)?.data,
      defaults.filter(([setting]) => inCrispy(setting) === (name === crispy)),
    );
    return data ? [{ path: enginePath(name), data }] : [];
  });
  const saves = kept.filter((file) => !Object.values(SETTINGS).some((each) => each.main === file.name || each.crispy === file.name));
  // The drawing of the keys shows the settings the game starts with, and those it writes.
  heardKept(engine, kept);
  let post: ((input: DoomInput) => void) | undefined;
  const running = await startWorkerGame<DoomStart>('doom', 'engine', {
    payload: {
      engine,
      glue: fileUrl(`${ASSETS}/${engine}.js`),
      wasm: fileUrl(`${ASSETS}/${engine}.wasm`),
      args: [engine, ...wads, '-savedir', SAVES],
      ...(name ? { name } : {}),
      ...(online ? { join: online.address } : {}),
    },
    lazy: [
      { path: `/${game.id}`, url: fileUrl(game.path), size: game.size },
      ...(game.iwad ? [{ path: `/${game.iwad}`, url: fileUrl(`${folder}/${game.iwad}`) }] : []),
    ],
    files: [
      ...settings,
      ...saves.map(({ name, data }) => ({ path: enginePath(name), data })),
    ],
    controls(send) {
      post = (input) => send({ type: 'input', data: input });
      const press = (pressed: boolean, key: number | undefined): boolean => {
        if (key === undefined) return false;
        send({ type: 'key', pressed, key });
        return true;
      };
      return {
        key: (pressed, code) => press(pressed, scancode(code)),
        button(pressed, button) {
          send({ type: 'button', pressed, button: button + 1 });
          return true;
        },
        wheel: (up) => post?.({ wheel: up ? 1 : -1 }),
      };
    },
  }, {
    sound,
    log,
    onKeep: (written: Written) => {
      heardWritten(engine, written);
      onKeep?.(written);
    },
    online,
    servers,
  });
  heardRunning({ engine, post: (input) => post?.(input) });
  return {
    ...running,
    stop() {
      heardRunning(undefined);
      running.stop?.();
    },
  };
}
