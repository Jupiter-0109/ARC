/**
 * ARC - Web Audio Sound Synthesizer Engine
 * Synthesizes retro and soothing chimes without external audio assets.
 * Supports: Chime, Bell, Retro 8-bit, Soft Marimba, and Break-Over alerts.
 */

import { store } from './store.js';

const SOUND_STORAGE_KEY = 'arc_sound_config';

const DEFAULT_SOUND_SETTINGS = {
  enabled: true,
  sound: 'chime', // 'chime' | 'bell' | 'retro' | 'marimba'
  volume: 0.8,    // 0.0 to 1.0
  repeat: true    // repeat 3 times, 5s apart until dismissed
};

let audioContext = null;
let repeatTimeoutId = null;
let repeatCount = 0;
const MAX_REPEATS = 3;
const REPEAT_INTERVAL_MS = 5000;

// ============================================================================
// SETTINGS PERSISTENCE & STORE SYNC
// ============================================================================

export function getSoundSettings() {
  const storeVal = store.get('soundSettings');
  if (storeVal) return storeVal;

  try {
    const raw = localStorage.getItem(SOUND_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SOUND_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SOUND_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_SOUND_SETTINGS };
  }
}

export function saveSoundSettings(settings) {
  const current = getSoundSettings();
  const updated = {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : current.enabled,
    sound: ['chime', 'bell', 'retro', 'marimba'].includes(settings.sound) ? settings.sound : current.sound,
    volume: Math.min(1.0, Math.max(0.0, parseFloat(settings.volume) || current.volume)),
    repeat: typeof settings.repeat === 'boolean' ? settings.repeat : current.repeat
  };

  localStorage.setItem(SOUND_STORAGE_KEY, JSON.stringify(updated));
  store.set('soundSettings', updated);
  return updated;
}

// Initialize store with sound settings
store.set('soundSettings', getSoundSettings(), { broadcast: false, notify: false });

// ============================================================================
// AUDIO CONTEXT MANAGEMENT (USER GESTURE COMPLIANT)
// ============================================================================

export function ensureAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  if (!audioContext) {
    audioContext = new AudioContextClass();
  }

  if (audioContext.state === 'suspended') {
    audioContext.resume().catch((err) => {
      console.warn('Could not resume AudioContext:', err);
    });
  }

  return audioContext;
}

// ============================================================================
// AUDIO SYNTHESIS PRESETS
// ============================================================================

/**
 * 1. Chime: Soft ascending arpeggio C5 -> E5 -> G5 -> C6 with low-pass filter
 */
function synthesizeChime(ctx, destination, masterGainVal) {
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
  const noteDuration = 0.45;
  const startTime = ctx.currentTime;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, startTime);
  filter.Q.setValueAtTime(1.5, startTime);
  filter.connect(destination);

  notes.forEach((freq, index) => {
    const noteStart = startTime + index * 0.16;

    // Dual oscillator for warmth (sine + soft triangle)
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, noteStart);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 1.002, noteStart); // Subtle detune for shimmer

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(0.28 * masterGainVal, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(filter);

    osc1.start(noteStart);
    osc2.start(noteStart);
    osc1.stop(noteStart + noteDuration + 0.05);
    osc2.stop(noteStart + noteDuration + 0.05);
  });
}

/**
 * 2. Bell: Single rich strike with harmonic overtones
 */
function synthesizeBell(ctx, destination, masterGainVal) {
  const baseFreq = 587.33; // D5
  const harmonics = [1.0, 2.0, 3.01, 4.18];
  const harmonicGains = [0.4, 0.25, 0.15, 0.1];
  const startTime = ctx.currentTime;
  const duration = 1.8;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(3200, startTime);
  filter.connect(destination);

  harmonics.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * ratio, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(harmonicGains[i] * masterGainVal, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(filter);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.1);
  });
}

/**
 * 3. Retro 8-bit: Classic square-wave arcade victory arpeggio
 */
function synthesizeRetro(ctx, destination, masterGainVal) {
  const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
  const startTime = ctx.currentTime;
  const noteDuration = 0.18;

  notes.forEach((freq, idx) => {
    const noteStart = startTime + idx * 0.11;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(0.18 * masterGainVal, noteStart + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(noteStart);
    osc.stop(noteStart + noteDuration + 0.02);
  });
}

/**
 * 4. Soft Marimba: Warm wooden percussion plucks
 */
function synthesizeMarimba(ctx, destination, masterGainVal) {
  const notes = [523.25, 659.25, 783.99, 1046.50];
  const startTime = ctx.currentTime;
  const noteDuration = 0.32;

  notes.forEach((freq, index) => {
    const noteStart = startTime + index * 0.14;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, noteStart);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(freq * 1.5, noteStart);
    filter.Q.setValueAtTime(2.0, noteStart);

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(0.35 * masterGainVal, noteStart + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    osc.start(noteStart);
    osc.stop(noteStart + noteDuration + 0.05);
  });
}

/**
 * 5. Distinct Short Break-Over Sound
 */
function synthesizeBreakOver(ctx, destination, masterGainVal) {
  const notes = [783.99, 523.25]; // G5 -> C5 descending call
  const startTime = ctx.currentTime;
  const noteDuration = 0.3;

  notes.forEach((freq, idx) => {
    const noteStart = startTime + idx * 0.18;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, noteStart);

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(0.25 * masterGainVal, noteStart + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + noteDuration);

    osc.connect(gain);
    gain.connect(destination);

    osc.start(noteStart);
    osc.stop(noteStart + noteDuration + 0.05);
  });
}

// ============================================================================
// PLAYBACK CONTROLLER
// ============================================================================

/**
 * Play a specific sound preset
 * @param {'chime'|'bell'|'retro'|'marimba'|'break_over'} soundType
 */
export function playSound(soundType) {
  const config = getSoundSettings();
  if (!config.enabled && soundType !== 'preview') return;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  const chosen = soundType === 'preview' ? config.sound : soundType || config.sound;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(config.volume, ctx.currentTime);
  masterGain.connect(ctx.destination);

  switch (chosen) {
    case 'bell':
      synthesizeBell(ctx, masterGain, config.volume);
      break;
    case 'retro':
      synthesizeRetro(ctx, masterGain, config.volume);
      break;
    case 'marimba':
      synthesizeMarimba(ctx, masterGain, config.volume);
      break;
    case 'break_over':
      synthesizeBreakOver(ctx, masterGain, config.volume);
      break;
    case 'chime':
    default:
      synthesizeChime(ctx, masterGain, config.volume);
      break;
  }
}

/**
 * Play the session-complete chime, repeating up to 3 times unless dismissed
 */
export function playSessionCompleteAlert() {
  const config = getSoundSettings();
  if (!config.enabled) return;

  stopRepeatingSound();
  playSound(config.sound);
  repeatCount = 1;

  if (config.repeat) {
    const scheduleNext = () => {
      if (repeatCount < MAX_REPEATS) {
        repeatTimeoutId = setTimeout(() => {
          playSound(config.sound);
          repeatCount++;
          scheduleNext();
        }, REPEAT_INTERVAL_MS);
      }
    };
    scheduleNext();
  }
}

/**
 * Play the break-over alert (distinct two-tone call)
 */
export function playBreakOverAlert() {
  stopRepeatingSound();
  playSound('break_over');
}

/**
 * Cancel any pending repetitions
 */
export function stopRepeatingSound() {
  if (repeatTimeoutId) {
    clearTimeout(repeatTimeoutId);
    repeatTimeoutId = null;
  }
  repeatCount = 0;
}


// ============================================================================
// PROCEDURAL 8-BIT AMBIENT NOISE GENERATOR (ZERO EXTERNAL ASSETS)
// ============================================================================

const AMBIENT_STORAGE_KEY = 'arc_ambient_config';

const DEFAULT_AMBIENT_SETTINGS = {
  enabled: false,
  preset: 'tape_hiss', // 'tape_hiss' | 'rain' | 'brown'
  volume: 0.4
};

let ambientSourceNode = null;
let ambientGainNode = null;
let ambientFilterNode = null;
let ambientHumOsc1 = null;
let ambientHumOsc2 = null;
let ambientModulator = null;
let isAmbientActive = false;

export function getAmbientSettings() {
  const storeVal = store.get('ambientSettings');
  if (storeVal) return storeVal;

  try {
    const raw = localStorage.getItem(AMBIENT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AMBIENT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_AMBIENT_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_AMBIENT_SETTINGS };
  }
}

export function saveAmbientSettings(settings) {
  const current = getAmbientSettings();
  const updated = {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : current.enabled,
    preset: ['tape_hiss', 'rain', 'brown'].includes(settings.preset) ? settings.preset : current.preset,
    volume: Math.min(1.0, Math.max(0.0, parseFloat(settings.volume) !== undefined ? parseFloat(settings.volume) : current.volume))
  };

  localStorage.setItem(AMBIENT_STORAGE_KEY, JSON.stringify(updated));
  store.set('ambientSettings', updated);
  return updated;
}

// Initialize store with ambient settings
store.set('ambientSettings', getAmbientSettings(), { broadcast: false, notify: false });

/**
 * Generate a procedural audio buffer (Brown, Pink, or White noise)
 */
function createNoiseBuffer(ctx, noiseType = 'brown', durationSeconds = 5) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * durationSeconds;
  const buffer = ctx.createBuffer(2, bufferSize, sampleRate);

  for (let channel = 0; channel < 2; channel++) {
    const output = buffer.getChannelData(channel);

    if (noiseType === 'brown') {
      // Integrated Brown noise (Deep Space Rumble)
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = output[i];
        output[i] *= 3.5;
      }
    } else if (noiseType === 'pink') {
      // 3-Pole Pink noise approximation (Rainy Night)
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        b3 = 0.86650 * b3 + white * 0.3104856;
        b4 = 0.55000 * b4 + white * 0.5329522;
        b5 = -0.7616 * b5 - white * 0.0168980;
        output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
        b6 = white * 0.115926;
      }
    } else {
      // White noise with high-pass filtering (CRT Tape Hiss)
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * 0.25;
      }
    }
  }

  return buffer;
}

/**
 * Start the procedural ambient generator
 */
export function startAmbientSound(forcedPreset = null) {
  const config = getAmbientSettings();
  const preset = forcedPreset || config.preset;

  const ctx = ensureAudioContext();
  if (!ctx) return;

  stopAmbientSound();

  const now = ctx.currentTime;

  // Master ambient gain node
  ambientGainNode = ctx.createGain();
  ambientGainNode.gain.setValueAtTime(0.001, now);
  ambientGainNode.gain.linearRampToValueAtTime(config.volume, now + 0.3);
  ambientGainNode.connect(ctx.destination);

  if (preset === 'brown') {
    // 1. Deep Space Brown Noise
    const buffer = createNoiseBuffer(ctx, 'brown', 5);
    ambientSourceNode = ctx.createBufferSource();
    ambientSourceNode.buffer = buffer;
    ambientSourceNode.loop = true;

    ambientFilterNode = ctx.createBiquadFilter();
    ambientFilterNode.type = 'lowpass';
    ambientFilterNode.frequency.setValueAtTime(220, now);
    ambientFilterNode.Q.setValueAtTime(1.0, now);

    ambientSourceNode.connect(ambientFilterNode);
    ambientFilterNode.connect(ambientGainNode);
    ambientSourceNode.start(now);

  } else if (preset === 'rain') {
    // 2. 8-Bit Rainy Night (Pink noise + resonant filter + subtle rain modulation)
    const buffer = createNoiseBuffer(ctx, 'pink', 5);
    ambientSourceNode = ctx.createBufferSource();
    ambientSourceNode.buffer = buffer;
    ambientSourceNode.loop = true;

    ambientFilterNode = ctx.createBiquadFilter();
    ambientFilterNode.type = 'lowpass';
    ambientFilterNode.frequency.setValueAtTime(850, now);
    ambientFilterNode.Q.setValueAtTime(1.8, now);

    // Subtle 0.25Hz LFO for shifting rain/wind intensity
    ambientModulator = ctx.createOscillator();
    const modGain = ctx.createGain();
    ambientModulator.type = 'sine';
    ambientModulator.frequency.setValueAtTime(0.25, now);
    modGain.gain.setValueAtTime(250, now);
    ambientModulator.connect(modGain);
    modGain.connect(ambientFilterNode.frequency);
    ambientModulator.start(now);

    ambientSourceNode.connect(ambientFilterNode);
    ambientFilterNode.connect(ambientGainNode);
    ambientSourceNode.start(now);

  } else {
    // 3. CRT Hum & Warm Tape Hiss (Filtered noise + 60Hz/120Hz transformer hum)
    const buffer = createNoiseBuffer(ctx, 'white', 5);
    ambientSourceNode = ctx.createBufferSource();
    ambientSourceNode.buffer = buffer;
    ambientSourceNode.loop = true;

    // Filter to isolate warm tape hiss
    ambientFilterNode = ctx.createBiquadFilter();
    ambientFilterNode.type = 'bandpass';
    ambientFilterNode.frequency.setValueAtTime(2800, now);
    ambientFilterNode.Q.setValueAtTime(0.7, now);

    ambientSourceNode.connect(ambientFilterNode);
    ambientFilterNode.connect(ambientGainNode);
    ambientSourceNode.start(now);

    // Subtle CRT / Transformer 60Hz and 120Hz hum
    const humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.045, now);
    humGain.connect(ambientGainNode);

    ambientHumOsc1 = ctx.createOscillator();
    ambientHumOsc1.type = 'sine';
    ambientHumOsc1.frequency.setValueAtTime(60, now);
    ambientHumOsc1.connect(humGain);
    ambientHumOsc1.start(now);

    ambientHumOsc2 = ctx.createOscillator();
    ambientHumOsc2.type = 'triangle';
    ambientHumOsc2.frequency.setValueAtTime(120, now);
    ambientHumOsc2.connect(humGain);
    ambientHumOsc2.start(now);
  }

  isAmbientActive = true;
}

/**
 * Stop or fade out the ambient generator
 */
export function stopAmbientSound() {
  if (!isAmbientActive && !ambientSourceNode) return;

  const ctx = audioContext;
  if (ctx && ambientGainNode) {
    const now = ctx.currentTime;
    try {
      ambientGainNode.gain.linearRampToValueAtTime(0.0001, now + 0.15);
      setTimeout(() => {
        cleanupAmbientNodes();
      }, 160);
    } catch (e) {
      cleanupAmbientNodes();
    }
  } else {
    cleanupAmbientNodes();
  }

  isAmbientActive = false;
}

function cleanupAmbientNodes() {
  try {
    if (ambientSourceNode) {
      ambientSourceNode.stop();
      ambientSourceNode.disconnect();
      ambientSourceNode = null;
    }
    if (ambientHumOsc1) {
      ambientHumOsc1.stop();
      ambientHumOsc1.disconnect();
      ambientHumOsc1 = null;
    }
    if (ambientHumOsc2) {
      ambientHumOsc2.stop();
      ambientHumOsc2.disconnect();
      ambientHumOsc2 = null;
    }
    if (ambientModulator) {
      ambientModulator.stop();
      ambientModulator.disconnect();
      ambientModulator = null;
    }
    if (ambientFilterNode) {
      ambientFilterNode.disconnect();
      ambientFilterNode = null;
    }
    if (ambientGainNode) {
      ambientGainNode.disconnect();
      ambientGainNode = null;
    }
  } catch (e) {
    // Ignore cleanup errors
  }
}

/**
 * Set ambient volume in real time
 */
export function setAmbientVolume(volume) {
  const vol = Math.min(1.0, Math.max(0.0, parseFloat(volume) || 0.0));
  saveAmbientSettings({ volume: vol });

  if (ambientGainNode && audioContext) {
    try {
      ambientGainNode.gain.linearRampToValueAtTime(vol, audioContext.currentTime + 0.05);
    } catch (e) {}
  }
}

export function isAmbientPlaying() {
  return isAmbientActive;
}

/**
 * Synchronize ambient sound with Pomodoro focus state
 * Plays when Focus is active, pauses smoothly during breaks or idle
 */
export function syncAmbientWithTimer(isFocusRunning) {
  const config = getAmbientSettings();
  if (!config.enabled) {
    if (isAmbientActive) stopAmbientSound();
    return;
  }

  if (isFocusRunning) {
    if (!isAmbientActive) {
      startAmbientSound();
    }
  } else {
    if (isAmbientActive) {
      stopAmbientSound();
    }
  }
}
