import { ActionIcon, Box, Group, Loader, Menu, Paper, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { PageBar, TablerIcon } from '@ein/ui/components';
import { usePhone } from '@ein/ui/hooks';
import { formatBytes } from '@ein/ui/lib';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Engine, quitted, startEngine } from '../doom/engine.ts';
import { doomKey } from '../doom/keys.ts';
import { openSound, type Sound } from '../doom/sound.ts';
import { deleteWad, listWads, type Wad, WADS } from '../doom/wads.ts';

export const handle = { fullBleed: true, title: 'Doom', pattern: 'mixed' };

/** Where the game is: waiting for the click that starts it, loading, playing, or stopped by an error. */
type State =
  | { kind: 'idle' }
  | { kind: 'loading'; wad: Wad }
  | { kind: 'running'; wad: Wad; iwad?: string }
  | { kind: 'error'; message: string };

/** How many of Doom's last printed lines an error shows, since `I_Error` prints its reason before it exits. */
const LOG_TAIL = 6;

/** The browser remembers the WAD last chosen and whether the sound was off. */
const CHOSEN_KEY = 'doom.wad';
const MUTED_KEY = 'doom.muted';

const remembered = (key: string): string | null => {
  try {
    return globalThis.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const remember = (key: string, value: string) => {
  try {
    globalThis.localStorage.setItem(key, value);
  } catch {
    // A browser that keeps nothing chooses again next time.
  }
};

/** The bar's round buttons: finger-sized on a phone, as the app header's are. */
const BAR_BUTTON = { size: 36, icon: 22 };

/**
 * The module's page: the WADs there are in a box at the left, as Chat's recent chats are, and the
 * game beside them. A click on a WAD plays it, which is also the click a browser wants before a
 * page may make sound. WADs dropped anywhere on the page are uploaded into `WADS` and listed. While
 * the game has focus it takes every key it knows before the shell does, so Alt (strafe), Escape
 * (Doom's menu) and the rest reach the game rather than the shell's shortcuts.
 */
export default function Doom() {
  const phone = usePhone();
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Engine | null>(null);
  const sound = useRef<Sound | null>(null);
  const log = useRef<string[]>([]);
  const [wads, setWads] = useState<Wad[] | null>(null);
  const [listError, setListError] = useState<string>();
  const [chosen, setChosen] = useState(() => remembered(CHOSEN_KEY));
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMuted] = useState(() => remembered(MUTED_KEY) === '1');

  const selected = wads?.find((wad) => wad.name === chosen) ?? wads?.[0];

  const refresh = useCallback(() => {
    listWads().then((found) => {
      setWads(found);
      setListError(undefined);
    }).catch((error) => setListError(error instanceof Error ? error.message : String(error)));
  }, []);
  useEffect(refresh, [refresh]);

  const stop = useCallback(() => {
    engine.current = null;
    sound.current?.close();
    sound.current = null;
  }, []);
  useEffect(() => stop, [stop]);

  const play = useCallback(async (wad: Wad) => {
    stop();
    setChosen(wad.name);
    remember(CHOSEN_KEY, wad.name);
    if (wad.otherGame) {
      setState({
        kind: 'error',
        message: `${wad.name} is ${wad.otherGame}, not Doom. This page plays Doom's games only: Doom, Doom II, Final Doom and Freedoom, and WADs made for them.`,
      });
      return;
    }
    log.current = [];
    setState({ kind: 'loading', wad });
    frame.current?.focus();
    // Opened in the click, before anything is awaited: a browser lets a page make sound only then.
    const audio = openSound();
    audio.setMuted(muted);
    sound.current = audio;
    try {
      const started = await startEngine({
        wad,
        wads: wads ?? [],
        sound: audio,
        log: (line) => {
          log.current = [...log.current.slice(-(LOG_TAIL - 1)), line];
          console.info(`[doom] ${line}`);
        },
      });
      // Another WAD was chosen while this one loaded.
      if (sound.current !== audio) return;
      engine.current = started;
      setState({ kind: 'running', wad, ...(started.iwad ? { iwad: started.iwad } : {}) });
      frame.current?.focus();
    } catch (error) {
      if (sound.current !== audio) return;
      stop();
      setState({ kind: 'error', message: describe(error, log.current) });
    }
  }, [wads, muted, stop]);

  const remove = useCallback(async (wad: Wad) => {
    if (!globalThis.confirm(`Delete ${wad.name}? Everyone who plays here loses it.`)) return;
    if (state.kind !== 'idle' && state.kind !== 'error' && state.wad.name === wad.name) {
      stop();
      setState({ kind: 'idle' });
    }
    try {
      await deleteWad(wad.name);
    } catch (error) {
      setListError(error instanceof Error ? error.message : String(error));
    }
    refresh();
  }, [state, stop, refresh]);

  // The loop: as many tics as are due on every animation frame, and a blit when Doom drew.
  useEffect(() => {
    const game = engine.current;
    const context = canvas.current?.getContext('2d');
    if (state.kind !== 'running' || !game || !context) return;
    const image = context.createImageData(game.width, game.height);
    let drawn = -1;
    let request = 0;
    const step = () => {
      if (engine.current !== game) return;
      try {
        game.tick();
      } catch (error) {
        stop();
        // Quit from Doom's menu leaves the page as it was before Play.
        if (quitted(error)) setState({ kind: 'idle' });
        else setState({ kind: 'error', message: describe(error, log.current) });
        return;
      }
      if (game.frames() !== drawn) {
        drawn = game.frames();
        game.draw(image);
        context.putImageData(image, 0, 0);
      }
      request = requestAnimationFrame(step);
    };
    request = requestAnimationFrame(step);
    return () => cancelAnimationFrame(request);
  }, [state, stop]);

  // A hidden page draws no frames, so the game stands still; its music waits with it.
  useEffect(() => {
    const onVisibility = () => {
      const context = sound.current?.context;
      if (!context) return;
      if (document.hidden) void context.suspend();
      else void context.resume();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Keys, in the capture phase on the window so the shell's own listeners (on the document, and
  // the window's bubbling phase) never see them while the game has focus.
  useEffect(() => {
    if (state.kind !== 'running') return;
    const held = new Set<number>();
    const focused = () => !!frame.current && frame.current.contains(document.activeElement);
    const onKey = (event: KeyboardEvent) => {
      const game = engine.current;
      if (!game || !focused() || event.metaKey) return;
      const key = doomKey(event.code);
      if (key === undefined) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pressed = event.type === 'keydown';
      if (pressed && event.repeat) return;
      if (pressed) held.add(key);
      else held.delete(key);
      game.key(pressed, key);
    };
    // A key held while focus leaves would never come up for the game: let go of them all.
    const release = () => {
      for (const key of held) engine.current?.key(false, key);
      held.clear();
    };
    const node = frame.current;
    globalThis.addEventListener('keydown', onKey, { capture: true });
    globalThis.addEventListener('keyup', onKey, { capture: true });
    globalThis.addEventListener('blur', release);
    node?.addEventListener('focusout', release);
    return () => {
      globalThis.removeEventListener('keydown', onKey, { capture: true });
      globalThis.removeEventListener('keyup', onKey, { capture: true });
      globalThis.removeEventListener('blur', release);
      node?.removeEventListener('focusout', release);
    };
  }, [state]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void frame.current?.requestFullscreen().catch(() => undefined);
    frame.current?.focus();
  };

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    remember(MUTED_KEY, next ? '1' : '0');
    sound.current?.setMuted(next);
    frame.current?.focus();
  };

  const list = { wads, error: listError, active: state.kind === 'loading' || state.kind === 'running' ? state.wad.name : selected?.name, onPlay: play };

  return (
    <Paper
      radius={0}
      bg='var(--mrx-surface-base)'
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100dvh - var(--app-shell-header-offset, 48px))',
        minHeight: phone ? undefined : 420,
        overflow: 'hidden',
      }}
    >
      <PageBar
        title='Doom'
        pattern='mixed'
        band
        controls={
          <>
            {phone && <WadMenu {...list} />}
            <BarButton label={muted ? 'Sound on' : 'Sound off'} icon={muted ? 'volume-off' : 'volume'} onClick={toggleMuted} data-doom-mute />
            <BarButton label='Fullscreen' icon='maximize' disabled={state.kind !== 'running'} onClick={toggleFullscreen} data-doom-fullscreen />
          </>
        }
        actions={{ upload: { path: WADS, name: 'Doom', onUploaded: refresh } }}
      />
      <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <WadPane {...list} onDelete={remove} />
        <Box
          ref={frame}
          tabIndex={0}
          data-doom-state={state.kind}
          onMouseDown={() => frame.current?.focus()}
          p={fullscreen ? 0 : 'md'}
          style={{
            flex: 1,
            minWidth: 0,
            outline: 'none',
            containerType: 'size',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 'var(--mantine-spacing-xs)',
            background: fullscreen ? '#000' : undefined,
          }}
        >
          {/* 320 by 200 drawn at 4:3, the shape Doom's pixels had on a CRT, as large as fits beside the line under it. */}
          <Box
            pos='relative'
            style={{
              width: fullscreen ? 'min(100cqw, 133.333cqh)' : 'min(100cqw, calc((100cqh - 2.5rem) * 4 / 3))',
              aspectRatio: '4 / 3',
              background: '#000',
              flex: 'none',
            }}
          >
            <canvas
              ref={canvas}
              width={320}
              height={200}
              // The pointer is no use to the game, which takes no mouse, and would stand over its view.
              style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block', cursor: state.kind === 'running' ? 'none' : undefined }}
            />
            {state.kind !== 'running' && (
              <Stack
                pos='absolute'
                inset={0}
                align='center'
                justify='center'
                gap='md'
                p='md'
                // While a WAD loads, or after the game stopped, the last frame stays dimmed behind.
                bg={state.kind === 'loading' || state.kind === 'error' ? 'rgba(0, 0, 0, 0.75)' : undefined}
                style={{ overflow: 'auto' }}
              >
                {state.kind === 'error' && (
                  <Stack gap={4} maw={640} w='100%' data-doom-error>
                    <Text c='red.5' fw={600}>Doom stopped</Text>
                    <Text c='gray.3' size='sm' style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>{state.message}</Text>
                  </Stack>
                )}
                {state.kind === 'loading'
                  ? <Loader color='red' />
                  : selected && !selected.otherGame
                  ? (
                    <UnstyledButton onClick={() => void play(selected)} data-doom-play style={{ textAlign: 'center' }}>
                      <Stack align='center' gap={6}>
                        <TablerIcon name='player-play' size={56} color='var(--mantine-color-red-6)' />
                        <Text c='gray.3' fw={600}>{state.kind === 'error' ? 'Play again' : 'Play'} {selected.title}</Text>
                      </Stack>
                    </UnstyledButton>
                  )
                  : !selected && <Text c='gray.4' ta='center' size='sm'>{wads ? 'No game data yet. Drop a WAD file on the page.' : ''}</Text>}
              </Stack>
            )}
          </Box>
          {!fullscreen && (
            <Text c='dimmed' size='xs' ta='center' lineClamp={2} maw={960}>
              {state.kind === 'running' ? `${state.wad.title}${state.iwad ? ` on ${state.iwad}` : ''}. ` : ''}
              Click the game to give it the keyboard. Arrows move, Ctrl fires, Space opens doors, Shift runs, Alt strafes, Escape is the menu.
            </Text>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

type ListProps = {
  wads: Wad[] | null;
  error?: string;
  /** The WAD playing, loading, or chosen to play next. */
  active?: string;
  onPlay: (wad: Wad) => void;
};

/** The WADs, each a row that plays it; `onDelete` gives each a button that deletes it, `onPick` hears a row chosen. */
function WadList({ wads, error, active, onPlay, onDelete, onPick }: ListProps & { onDelete?: (wad: Wad) => void; onPick?: () => void }) {
  if (error) return <Text size='sm' c='red' p='sm'>{error}</Text>;
  if (!wads) return <Loader size='sm' m='sm' />;
  if (wads.length === 0) {
    return (
      <Text size='sm' c='dimmed' p='sm'>
        No WADs yet. Freedoom is fetched when the module is installed and shows up here when it is in; drop a WAD file on the page to add your own.
      </Text>
    );
  }
  return (
    <Stack gap={2}>
      {wads.map((wad) => (
        <Group key={wad.name} gap={4} wrap='nowrap' align='center'>
          <UnstyledButton
            onClick={() => {
              onPick?.();
              onPlay(wad);
            }}
            data-doom-wad={wad.name}
            style={{
              flex: 1,
              minWidth: 0,
              padding: '8px 10px',
              borderRadius: 'var(--mantine-radius-sm)',
              background: wad.name === active ? 'var(--mrx-surface-raised)' : undefined,
            }}
          >
            <Text size='sm' truncate fw={wad.name === active ? 600 : 400} c={wad.otherGame ? 'dimmed' : undefined}>{wad.title}</Text>
            <Text size='xs' c='dimmed' truncate>
              {wad.otherGame ? `${wad.name} · not playable here` : wad.title === wad.name ? formatBytes(wad.size) : `${wad.name} · ${formatBytes(wad.size)}`}
            </Text>
          </UnstyledButton>
          {onDelete && (
            <Tooltip label='Delete WAD'>
              <ActionIcon variant='subtle' color='gray' size='sm' onClick={() => onDelete(wad)} aria-label={`Delete ${wad.name}`}>
                <TablerIcon name='trash' size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      ))}
    </Stack>
  );
}

/** The WADs beside the game, in a bordered box in the page's margin as Chat's recent chats are. */
function WadPane(props: ListProps & { onDelete: (wad: Wad) => void }) {
  return (
    <Box w={300} h='100%' p='md' pr={0} style={{ flex: '0 0 300px', overflow: 'hidden' }} visibleFrom='sm'>
      <Paper h='100%' p='sm' radius='md' withBorder>
        <Stack gap='xs' h='100%'>
          <ScrollArea type='auto' scrollbars='y' offsetScrollbars='y' style={{ flex: 1, minHeight: 0 }}>
            <WadList {...props} />
          </ScrollArea>
          <Text size='xs' c='dimmed'>Drop WAD files anywhere on the page to add them.</Text>
        </Stack>
      </Paper>
    </Box>
  );
}

/** On a phone, where there is no room for the box beside the game, the WADs are a menu in the bar. */
function WadMenu(props: ListProps) {
  const [opened, setOpened] = useState(false);
  return (
    <Menu shadow='md' width={320} position='bottom-end' opened={opened} onChange={setOpened}>
      <Menu.Target>
        <Tooltip label='WADs'>
          <ActionIcon variant='subtle' size={BAR_BUTTON.size} aria-label='WADs'>
            <TablerIcon name='list' size={BAR_BUTTON.icon} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>WADs</Menu.Label>
        <ScrollArea.Autosize mah={420} type='auto' scrollbars='y' px={4} styles={{ content: { minWidth: 0 } }}>
          <WadList {...props} onPick={() => setOpened(false)} />
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}

function BarButton({ label, icon, onClick, disabled, ...data }: { label: string; icon: string; onClick: () => void; disabled?: boolean } & Record<`data-${string}`, boolean>) {
  const phone = usePhone();
  return (
    <Tooltip label={label}>
      <ActionIcon variant='subtle' size={phone ? BAR_BUTTON.size : undefined} onClick={onClick} disabled={disabled} aria-label={label} {...data}>
        <TablerIcon name={icon} size={phone ? BAR_BUTTON.icon : 17} />
      </ActionIcon>
    </Tooltip>
  );
}

/** An error and the last lines Doom printed, which say why when the game itself gave up. */
function describe(error: unknown, lines: string[]): string {
  // Doom ends with exit(-1) when it gives up (`I_Error`); Emscripten throws its own ExitStatus,
  // not an Error, and the lines before it say why.
  const exit = error as { name?: string; status?: number } | null;
  const message = error instanceof Error ? error.message : exit?.name === 'ExitStatus' ? `Doom exited with status ${exit.status}` : String(error);
  return [message, ...lines].join('\n');
}
