/**
 * The engine the doom-server service runs hosted games with (`GameServers`): each game is Crispy
 * Doom's server, in a worker of its own (`server-worker.ts`), so a slow moment never holds up EiN.
 * The server runs no game; it passes each player's ticcmds to the others, so it needs none of the
 * game's WADs, only how the game is played: its map, its mode, how many may play, and whose it is.
 * The service hands each player's frames to the worker through memory both share (a `Ring`), which
 * the server reads whenever it reads, and passes on each frame the worker sends.
 */
import type { Command } from '@ein/client';
import type { ServerInfo } from '@games/api';
import type { HostedGame, ServerEngine, ServerIo } from '@games/host';
import { FRAME_HEADER, Ring } from '@games/net';
import type { FromWorker, StartServer, ToWorker } from './server-worker.ts';

/** Where the module is in EiN's tree: the server's build in `assets/`, the worker in `lib/`. */
const MODULE = '/usr/modules/doom';

/**
 * The network a server plays on and the memory it reads its players' frames from (`@games/net`),
 * by its path in EiN's tree: the worker imports it from its text, as it imports nothing else.
 */
const NET = '/usr/modules/games/lib/net.ts';

/** The modes a game is hosted in, as the server takes them: deathmatch, or cooperative without it. */
export const MODES = ['deathmatch', 'coop'];

/** How hard a hosted game is: Hurt Me Plenty, Doom's own middle, on the games' scale of 1 to 5. */
const SKILL = 3;

/** The episode and the map a map's name is: `E2M4` is 2 and 4, `MAP07` 1 and 7; undefined for any other name. */
export function warpOf(map: string): [number, number] | undefined {
  const episode = /^E(\d)M(\d+)$/i.exec(map);
  if (episode) return [Number(episode[1]), Number(episode[2])];
  const level = /^MAP(\d+)$/i.exec(map);
  return level ? [1, Number(level[1])] : undefined;
}

/**
 * The server's command line for the game `info` asks for (`engine/ein_server.c`): its mode, map,
 * skill and how many may play, and the account that started it, one word, which the games' own
 * search for games lists it as. A deathmatch is played without the map's monsters, as players play
 * one: they would stand at the players' starts and kill whoever comes in.
 */
export function serverArgs(info: ServerInfo): string[] {
  const warp = warpOf(info.map);
  if (!warp) throw new Error(`${info.map} is not a map of Doom's, Heretic's or Hexen's`);
  if (!MODES.includes(info.mode)) throw new Error(`${info.title} is hosted in ${MODES.join(' or ')}, not ${info.mode}`);
  return [
    'doom-server',
    ...(info.mode === 'deathmatch' ? ['-deathmatch', '-nomonsters'] : []),
    '-warp',
    String(warp[0]),
    String(warp[1]),
    '-skill',
    String(SKILL),
    '-players',
    String(info.maxPlayers),
    '-servername',
    info.startedBy,
  ];
}

/** The file at `path`, whole. */
async function readWhole(cmd: Command, path: string): Promise<Uint8Array> {
  const handle = await cmd.sys.vfs.open(cmd.access, path, { mode: 'r' });
  try {
    return new Uint8Array(await new Response(handle.readable).arrayBuffer());
  } finally {
    await handle.close();
  }
}

/** The engine that runs `cmd`'s hosted games, each Crispy Doom's server in a worker. */
export function serverEngine(cmd: Command): ServerEngine {
  return { start: (info, io) => start(cmd, info, io) };
}

/** Start the game `info` asks for: the server's build, handed to a new worker with the game's command line. */
async function start(cmd: Command, info: ServerInfo, io: ServerIo): Promise<HostedGame> {
  const args = serverArgs(info);
  const urls: string[] = [];
  const blob = async (path: string, type: string) => {
    const url = URL.createObjectURL(new Blob([await readWhole(cmd, path) as Uint8Array<ArrayBuffer>], { type }));
    urls.push(url);
    return url;
  };
  try {
    const [wasm, glue, net, code] = await Promise.all([
      readWhole(cmd, `${MODULE}/assets/doom-server.wasm`),
      blob(`${MODULE}/assets/doom-server.js`, 'text/javascript'),
      blob(NET, 'application/typescript'),
      blob(`${MODULE}/lib/server-worker.ts`, 'application/typescript'),
    ]);
    const ring = new Ring();
    const worker = new Worker(code, { type: 'module' });
    const started = Promise.withResolvers<void>();
    let running = false;
    const ended = (error?: string) => {
      if (!running) started.reject(new Error(error ?? 'the server quit as it started'));
      else io.ended(error);
    };
    worker.onmessage = ({ data: message }: MessageEvent<FromWorker>) => {
      switch (message.type) {
        case 'send':
          io.send(message.ip, message.framed);
          break;
        case 'log':
          io.log(message.line);
          break;
        case 'started':
          running = true;
          started.resolve();
          break;
        case 'status': {
          const { map, players } = JSON.parse(message.status) as { map: string; players: { name: string; address: string }[] };
          io.status(map, players);
          break;
        }
        case 'ended':
          worker.terminate();
          ended(message.error);
          break;
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      ended(event.message);
    };
    const message: StartServer = { type: 'start', glue, net, wasm, args, ring: ring.buffer };
    worker.postMessage(message satisfies ToWorker, [wasm.buffer as ArrayBuffer]);
    try {
      await started.promise;
    } catch (error) {
      worker.terminate();
      throw error;
    }
    return {
      // A server too far behind to take more drops what does not fit, as the network would.
      deliver: (ip, framed) => void (framed.length >= FRAME_HEADER && ring.write(ip, framed)),
      // Nobody waits for a player whose link closed: the server drops them at once.
      left: (ip) => worker.postMessage({ type: 'left', ip } satisfies ToWorker),
      stop: () => worker.terminate(),
    };
  } finally {
    // The worker has imported them by the time it says it started, or failed.
    urls.forEach((url) => URL.revokeObjectURL(url));
  }
}
