// src/audio/layers.ts
// Continuous background layers: each is built once (oscillators/looping
// noise sources start immediately and just sit at gain 0 until needed), so
// there's no per-frame node churn — only a per-frame gain lerp. Consumes
// Layer/SMOOTHING/Levels from the already-merged audioLevels.ts; never
// re-derives those constants.
import { Layer, Levels, SMOOTHING } from "../game/feel/audioLevels";
import { noiseBuffer } from "./noise";

export interface LayerControl {
  gain: GainNode;
  setLevel(target: number, dt: number): void;
  setHint(h: number): void;
}

export type Layers = Record<Layer, LayerControl>;

// Exponential smoothing toward `target`: `attack`/`release` (seconds) are
// time constants from audioLevels.ts's SMOOTHING table, picked by direction
// of travel so rising and falling can have different feel.
function lerpTarget(current: number, target: number, dt: number, attack: number, release: number): number {
  const tau = target > current ? attack : release;
  if (tau <= 0) return target;
  const k = 1 - Math.exp(-dt / tau);
  return current + (target - current) * k;
}

function makeSmoothedGain(
  ctx: AudioContext,
  dest: AudioNode,
  layer: Layer,
): { gain: GainNode; setLevel(target: number, dt: number): void } {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(dest);
  const { attack, release } = SMOOTHING[layer];
  let level = 0;
  return {
    gain,
    setLevel(target, dt) {
      level = lerpTarget(level, target, dt, attack, release);
      gain.gain.value = level;
    },
  };
}

function createEngineLayer(ctx: AudioContext, dest: AudioNode): LayerControl {
  const { gain, setLevel } = makeSmoothedGain(ctx, dest, "engine");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 400;
  lp.connect(gain);
  const baseFreq = 55;
  const oscs = [-3, 3].map((cents) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = baseFreq;
    osc.detune.value = cents;
    osc.connect(lp);
    osc.start();
    return osc;
  });
  return {
    gain,
    setLevel,
    setHint(h) {
      for (const osc of oscs) osc.frequency.value = baseFreq * h;
    },
  };
}

function createWindLayer(ctx: AudioContext, dest: AudioNode): LayerControl {
  const { gain, setLevel } = makeSmoothedGain(ctx, dest, "wind");
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.Q.value = 0.7;
  bp.frequency.value = 300;
  bp.connect(gain);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2, "pink");
  src.loop = true;
  src.connect(bp);
  src.start();
  return {
    gain,
    setLevel,
    // windCutoff hint arrives already 0..1 (audioLevels.ts); map to 300-1800Hz.
    setHint(h) {
      bp.frequency.value = 300 + h * 1500;
    },
  };
}

function createWarpBedLayer(ctx: AudioContext, dest: AudioNode): LayerControl {
  const { gain, setLevel } = makeSmoothedGain(ctx, dest, "warpBed");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 900;
  lp.connect(gain);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2, "brown");
  src.loop = true;
  src.connect(lp);
  src.start();

  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 110;
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.4; // relative mix under the shared layer gain
  drone.connect(droneGain);
  droneGain.connect(gain);
  drone.start();

  return { gain, setLevel, setHint() {} };
}

function createRumbleLayer(ctx: AudioContext, dest: AudioNode): LayerControl {
  const { gain, setLevel } = makeSmoothedGain(ctx, dest, "rumble");
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 90;
  lp.connect(gain);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2, "brown");
  src.loop = true;
  src.connect(lp);
  src.start();
  return { gain, setLevel, setHint() {} };
}

// 880/660 Hz square double-beep, gated on/off at 2 Hz. The gate: a 2 Hz
// square LFO through a 2-point WaveShaper that maps its -1..1 swing onto a
// clean 0..1 pulse, fed straight into gateGain's AudioParam (whose intrinsic
// value is 0, so the incoming signal IS the gain — the standard WebAudio
// param-modulation trick).
function createDangerLayer(ctx: AudioContext, dest: AudioNode): LayerControl {
  const { gain: outGain, setLevel } = makeSmoothedGain(ctx, dest, "danger");

  const gateGain = ctx.createGain();
  gateGain.gain.value = 0;
  gateGain.connect(outGain);

  const lfo = ctx.createOscillator();
  lfo.type = "square";
  lfo.frequency.value = 2;
  const lfoShape = ctx.createWaveShaper();
  lfoShape.curve = new Float32Array([0, 1]);
  lfo.connect(lfoShape);
  lfoShape.connect(gateGain.gain);
  lfo.start();

  for (const f of [880, 660]) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = f;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.2;
    osc.connect(toneGain);
    toneGain.connect(gateGain);
    osc.start();
  }

  return { gain: outGain, setLevel, setHint() {} };
}

export function createLayers(ctx: AudioContext, dest: AudioNode): Layers {
  return {
    engine: createEngineLayer(ctx, dest),
    wind: createWindLayer(ctx, dest),
    warpBed: createWarpBedLayer(ctx, dest),
    rumble: createRumbleLayer(ctx, dest),
    danger: createDangerLayer(ctx, dest),
  };
}

// Convenience for AudioDirector: apply a full Levels reading to all layers
// and their modulation hints in one call.
export function applyLevels(layers: Layers, levels: Levels, dt: number): void {
  layers.engine.setLevel(levels.engine, dt);
  layers.engine.setHint(levels.enginePitch);
  layers.wind.setLevel(levels.wind, dt);
  layers.wind.setHint(levels.windCutoff);
  layers.warpBed.setLevel(levels.warpBed, dt);
  layers.rumble.setLevel(levels.rumble, dt);
  layers.danger.setLevel(levels.danger, dt);
}
