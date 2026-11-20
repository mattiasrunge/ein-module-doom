/**
 * The game's sound on Web Audio. Doom's sound effects are short 8-bit clips in the WAD; the engine
 * hands each over once (`load`) and then plays it on one of its channels with a volume and a
 * stereo separation, as the DOS sound card did. The music is an OPL2/OPL3 synthesiser emulated in
 * the engine (`engine/opl_ein.c`); a processor node asks it for samples as it needs them.
 */

/** Frames the music is asked for at a time: about 85 ms at 48 kHz, short enough to follow the game. */
const MUSIC_FRAMES = 4096;

/** What the engine calls (`engine/ein_sound.c`); handed to the Emscripten module as `einSound`. */
export type SfxSink = {
  load(lump: number, samples: Uint8Array, rate: number): void;
  start(channel: number, lump: number, volume: number, separation: number): void;
  update(channel: number, volume: number, separation: number): void;
  stop(channel: number): void;
  playing(channel: number): boolean;
};

/** The game's audio: the sink the engine plays effects into, and the music once it can be pulled. */
export type Sound = {
  context: AudioContext;
  sfx: SfxSink;
  /** Pull music from `render`, which fills `left` and `right` with the next samples. */
  music(render: (left: Float32Array, right: Float32Array) => void): void;
  muted(): boolean;
  setMuted(muted: boolean): void;
  close(): void;
};

/** A clip on a channel: its source, and the nodes that set its volume and side. */
type Voice = { source: AudioBufferSourceNode; gain: GainNode; pan: StereoPannerNode; done: boolean };

/**
 * Open the game's audio. Call it from the click that starts the game: a browser lets a page make
 * sound only after the person has done something on it.
 */
export function openSound(): Sound {
  const context = new AudioContext();
  const master = context.createGain();
  master.connect(context.destination);
  const clips = new Map<number, AudioBuffer>();
  const voices = new Map<number, Voice>();
  let processor: ScriptProcessorNode | undefined;

  // Doom's volume is 0 to 127; its separation 0 (left) to 254 (right), 128 the middle.
  const level = (volume: number) => Math.max(0, Math.min(127, volume)) / 127;
  const side = (separation: number) => Math.max(-1, Math.min(1, (separation - 128) / 127));

  const stop = (channel: number) => {
    const voice = voices.get(channel);
    if (!voice) return;
    voices.delete(channel);
    voice.source.onended = null;
    try {
      voice.source.stop();
    } catch {
      // Stopping a source that already ended throws in some browsers; it is stopped either way.
    }
    voice.source.disconnect();
    voice.gain.disconnect();
  };

  const sfx: SfxSink = {
    load(lump, samples, rate) {
      // Unsigned 8-bit, 128 the silence.
      const buffer = context.createBuffer(1, Math.max(1, samples.length), rate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) data[i] = (samples[i] - 128) / 128;
      clips.set(lump, buffer);
    },
    start(channel, lump, volume, separation) {
      stop(channel);
      const buffer = clips.get(lump);
      if (!buffer) return;
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = level(volume);
      const pan = context.createStereoPanner();
      pan.pan.value = side(separation);
      source.connect(gain).connect(pan).connect(master);
      const voice: Voice = { source, gain, pan, done: false };
      source.onended = () => {
        voice.done = true;
        if (voices.get(channel) === voice) stop(channel);
      };
      voices.set(channel, voice);
      source.start();
    },
    update(channel, volume, separation) {
      const voice = voices.get(channel);
      if (!voice) return;
      voice.gain.gain.value = level(volume);
      voice.pan.pan.value = side(separation);
    },
    stop,
    playing: (channel) => {
      const voice = voices.get(channel);
      return !!voice && !voice.done;
    },
  };

  return {
    context,
    sfx,
    music(render) {
      // A ScriptProcessorNode runs on the page's own thread, where the engine is: an AudioWorklet
      // would need the engine on the audio thread too.
      processor = context.createScriptProcessor(MUSIC_FRAMES, 0, 2);
      processor.onaudioprocess = (event) => render(event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1));
      processor.connect(master);
    },
    muted: () => master.gain.value === 0,
    setMuted(muted) {
      master.gain.value = muted ? 0 : 1;
    },
    close() {
      for (const channel of [...voices.keys()]) stop(channel);
      if (processor) {
        processor.onaudioprocess = null;
        processor.disconnect();
      }
      void context.close();
    },
  };
}
