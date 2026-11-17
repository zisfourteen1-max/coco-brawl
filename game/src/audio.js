// Procedural sound only: every effect is an oscillator or a burst of noise
// shaped in WebAudio, so the game ships no sound files at all. The context is
// created on the first user gesture (browsers block audio before one) and every
// call is a no-op until it exists, so screenshot scenes stay silent.

export function createAudio() {
  let context = null;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (context !== null) return context;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      const length = Math.floor(context.sampleRate * 0.25);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      context = null;
    }
    return context;
  }

  function tone(freq, dur, type, vol, slideTo) {
    const ctx = ensure();
    if (ctx === null || muted) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  function noise(dur, vol, freq) {
    const ctx = ensure();
    if (ctx === null || muted || noiseBuffer === null) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + dur + 0.02);
    } catch {
      // Audio is decoration: never let it break the game.
    }
  }

  return {
    /** Call on any user gesture so later sounds are allowed to play. */
    unlock() {
      ensure();
      if (context !== null && context.state === 'suspended') context.resume().catch(() => {});
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot(heroId) {
      if (heroId === 'waffle') {
        noise(0.14, 0.5, 900);
        tone(140, 0.12, 'square', 0.16, 60);
      } else if (heroId === 'choco') {
        noise(0.12, 0.45, 1400);
        tone(220, 0.08, 'square', 0.12, 90);
      } else if (heroId === 'mochi') {
        tone(720, 0.06, 'square', 0.1, 480);
      } else {
        tone(520, 0.07, 'square', 0.13, 300);
        noise(0.05, 0.12, 2400);
      }
    },
    hit() {
      tone(880, 0.05, 'sine', 0.14, 660);
    },
    kill() {
      tone(660, 0.09, 'sine', 0.16, 990);
      tone(990, 0.12, 'sine', 0.14, 1320);
    },
    hurt() {
      tone(180, 0.12, 'sawtooth', 0.12, 90);
    },
    reload() {
      tone(440, 0.05, 'square', 0.08, 440);
      tone(330, 0.05, 'square', 0.08, 330);
    },
    ability() {
      tone(523, 0.1, 'sine', 0.16, 784);
      tone(784, 0.14, 'sine', 0.14, 1046);
    },
    fountain() {
      tone(1046, 0.06, 'sine', 0.08, 1046);
    },
    heal() {
      tone(587, 0.08, 'sine', 0.12, 880);
    },
    click() {
      tone(700, 0.04, 'sine', 0.1, 700);
    },
    win() {
      [523, 659, 784, 1046].forEach((freq, index) => {
        setTimeout(() => tone(freq, 0.22, 'sine', 0.16, freq), index * 110);
      });
    },
    lose() {
      [392, 330, 262].forEach((freq, index) => {
        setTimeout(() => tone(freq, 0.24, 'sine', 0.13, freq), index * 130);
      });
    },
  };
}
