import { Box, Text } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { type Engine, startEngine } from '../doom/engine.ts';
import { useGameLoop } from '../doom/loop.ts';
import { listWads } from '../doom/wads.ts';

/**
 * `/cards/doom/demo`: a game (`wad`, else the first one there is) on its own, as Doom runs when
 * nobody plays: its title screen, then the demos recorded in the WAD, one after the other, for
 * ever. Silent, since a page may make sound only after someone has clicked on it, and it takes no
 * keys. Doom starts the first demo a few seconds after its title screen.
 */
export default function DemoCard() {
  const [params] = useSearchParams();
  const name = params.get('wad');
  const canvas = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [problem, setProblem] = useState<string>();

  useEffect(() => {
    let current = true;
    setEngine(null);
    setProblem(undefined);
    (async () => {
      const wads = await listWads();
      const wad = wads.find((each) => each.name === name) ?? wads.find((each) => !each.otherGame);
      if (!wad) throw new Error(name ? `${name} is not in the WADs` : 'No WADs yet');
      if (wad.otherGame) throw new Error(`${wad.name} is ${wad.otherGame}, not Doom`);
      const started = await startEngine({ wad, wads, log: () => undefined });
      if (current) setEngine(started);
    })().catch((error) => {
      if (current) setProblem(error instanceof Error ? error.message : String(error));
    });
    return () => {
      current = false;
    };
  }, [name]);

  // A demo the engine cannot follow ends the game; the card says so rather than freeze.
  useGameLoop(engine, canvas, () => {
    setEngine(null);
    setProblem('The game stopped');
  });

  return (
    <Box
      w='100%'
      h='100%'
      bg='#000'
      style={{ containerType: 'size', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', position: 'relative' }}
    >
      {/* 320 by 200 at 4:3, as large as the tile holds. */}
      <canvas ref={canvas} width={320} height={200} style={{ width: 'min(100cqw, 133.333cqh)', aspectRatio: '4 / 3', imageRendering: 'pixelated', display: 'block' }} />
      {problem && <Text pos='absolute' c='gray.4' size='sm' ta='center' p='md'>{problem}</Text>}
    </Box>
  );
}
