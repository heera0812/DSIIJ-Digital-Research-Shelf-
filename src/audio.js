/**
 * audio.js — Web Audio ambient pad, chimes, and interaction sounds.
 * No audio files needed — everything is synthesised.
 */

let ctx = null;
let masterGain = null;
let padNodes = [];
let _muted = false;
let _volume = parseFloat(localStorage.getItem("bs-volume") ?? "0.4");
let _started = false;

/** Initialise audio context on first user interaction. */
export function initAudio() {
  if (_started) return;
  _started = true;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = _muted ? 0 : _volume;
    masterGain.connect(ctx.destination);
    startAmbientPad();
  } catch (e) {
    console.warn("[BookShelf] Web Audio not available:", e);
  }
}

export function isMuted() { return _muted; }
export function getVolume() { return _volume; }

export function setMuted(m) {
  _muted = m;
  localStorage.setItem("bs-muted", m ? "1" : "0");
  if (masterGain) {
    masterGain.gain.setTargetAtTime(_muted ? 0 : _volume, ctx.currentTime, 0.1);
  }
}

export function setVolume(v) {
  _volume = v;
  localStorage.setItem("bs-volume", String(v));
  if (!_muted && masterGain) {
    masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.1);
  }
}

/** Ambient pad — stacked sine/triangle oscillators with slow LFO. */
function startAmbientPad() {
  if (!ctx) return;
  const notes = [130.81, 196.00, 261.63, 329.63]; // C3, G3, C4, E4
  const padGain = ctx.createGain();
  padGain.gain.value = 0.06;
  padGain.connect(masterGain);

  notes.forEach(freq => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;

    const lfo = ctx.createOscillator();
    lfo.type = "triangle";
    lfo.frequency.value = 0.05 + Math.random() * 0.08;

    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 2;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    osc.connect(padGain);
    osc.start();
    lfo.start();
    padNodes.push(osc, lfo);
  });

  // Schedule random chimes
  scheduleChime();
}

function scheduleChime() {
  if (!ctx) return;
  const delay = 4000 + Math.random() * 8000;
  setTimeout(() => {
    playChime();
    scheduleChime();
  }, delay);
}

function playChime() {
  if (!ctx || _muted) return;
  const chimeFreqs = [523.25, 659.25, 783.99, 1046.50, 1318.51];
  const freq = chimeFreqs[Math.floor(Math.random() * chimeFreqs.length)];

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = freq;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 2.5);
}

/** Click sound — short sine blip. */
export function playClick() {
  if (!ctx || _muted) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.12, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.1);
}

/** Open sound — rising tone. */
export function playOpen() {
  if (!ctx || _muted) return;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(300, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.4);
}

/** Close sound — falling tone. */
export function playClose() {
  if (!ctx || _muted) return;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(600, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.08, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.3);
}

/** Navigate sound — soft tick. */
export function playNav() {
  if (!ctx || _muted) return;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.value = 1200;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.06);
}

// Restore mute state
_muted = localStorage.getItem("bs-muted") === "1";
