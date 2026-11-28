import { execCommand } from '@ein/ui/signals';
import type { GameAdapter } from '@games/adapter';
import type { Game } from '../lib/api.ts';
import { startDoom } from './doom/engine.ts';
import { DoomPad } from './doom/pad.tsx';
import { KEPT, SHARED } from './doom/start.ts';

/**
 * Doom, Heretic and Hexen on the games module's page for a game and its dashboard card: a game is a
 * WAD. A game is hosted for others to join on its page (Start server), which the doom-server service
 * runs; Join at the foot of the frame, or Join Game in the game's own menu, enters one, a game under
 * way too.
 */
export const adapter: GameAdapter<Game> = {
  module: 'doom',
  title: 'Doom',
  list: () => execCommand<Game[]>('doom-wads'),
  async start({ game, ...options }) {
    if (game.state !== 'installed') {
      throw new Error(`${game.title} is not here yet`);
    }
    return await startDoom({ game, ...options });
  },
  help:
    "The mouse looks and fires, its right button runs forward, WASD or the arrows move, E uses, Space jumps (in Heretic it flies up), Shift runs, Escape is the menu, Tab the map. The menu's Join Game finds the games hosted here.",
  // The player's keys on the keyboard and the mouse, which the games page shows where a keyboard
  // plays, beside the menu's and the map's keys; they change in the Keys dialog.
  keys: {
    Pad: DoomPad,
    shortcuts: [
      { key: 'Esc', icon: 'menu-2', label: 'Menu' },
      { key: 'Tab', icon: 'map', label: 'Map' },
      { key: 'F2', icon: 'device-floppy', label: 'Save' },
      { key: 'F3', icon: 'folder-open', label: 'Load' },
    ],
  },
  pointer: true,
  kept: { pattern: KEPT, depth: 1, shared: SHARED },
};
