// Original procedural sound design and composition. No recordings or melodies
// from Minecraft (or any other soundtrack) are used by this module.
export const AUDIO_LIMITS = Object.freeze({ voices: 24, musicVoices: 10, effectVoices: 18, lookAhead: .22 });
export const AUDIO_MIX = Object.freeze({ master: .55, effects: .8, music: .30 });
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const frequency = midi => 440 * 2 ** ((midi - 69) / 12);
const MUSICAL_PHASES = new Set(['ready', 'playing']);
// Ally-melt notifications can arrive inside _changeStage before the caller has
// replaced the previous frame's transition phase in update().
const UI_SOUNDS = new Set(['craft', 'level', 'allyMelt']);
const INTERVALS = { shot: .055, catch: .15, beam: .16, beamReady: .3, shatter: .16, quake: .18, gravity: .2, ignite: .22, hit: .045, kill: .085, hurt: .18, level: .35, recall: .25, bounce: .06, mine: .07, break: .10, lightning: .13, explosion: .16, allyMelt: .35, craft: .12, xp: .075 };
const PROFILES = {
  overworld: { root: 57, bpm: 72, scale: [0, 2, 4, 7, 9], progression: [0, 3, 1, 4], motif: [0, -1, 3, -1, 1, -1, 4, 2, -1, 2, -1, 4, 3, -1, 1, -1] },
  nether: { root: 43, bpm: 84, scale: [0, 2, 3, 7, 10], progression: [0, 2, 1, 3], motif: [0, -1, -1, 2, -1, 1, -1, -1, 3, -1, -1, 1, -1, 4, -1, -1] },
  end: { root: 52, bpm: 62, scale: [0, 2, 5, 7, 10], progression: [0, 2, 4, 1], motif: [0, -1, -1, 3, -1, 2, -1, -1, 4, -1, -1, 1, -1, 3, -1, -1] },
};

export function comboEnergy(combo = 0) {
  return clamp(Math.log2(Math.max(0, finite(combo)) + 1) / 5.5, 0, 1);
}

/** Pure composition step. The transport calls this with an increasing eighth-
 * note index, so frequent state updates never restart a phrase. */
export function composeMusicStep(step, { stage = 'overworld', weather = 'sunny', combo = 0, boss = false } = {}) {
  const profile = PROFILES[stage] || PROFILES.overworld;
  const index = Math.max(0, Math.floor(finite(step))), slot = index % 16, phrase = Math.floor(index / 16);
  const energy = Math.max(comboEnergy(combo), boss ? .65 : 0);
  const bpm = profile.bpm + (boss ? 8 : 0) + Math.floor(energy * 8);
  const stepSeconds = 30 / bpm;
  const degree = profile.progression[phrase % profile.progression.length];
  const note = n => profile.root + profile.scale[(n + degree) % profile.scale.length] + Math.floor((n + degree) / profile.scale.length) * 12;
  const events = [];
  const subdued = weather === 'night' || weather === 'rain' || weather === 'storm' ? .78 : 1;
  if (slot === 0) {
    for (const [i, n] of [0, 2, 4].entries()) events.push({ voice: 'pad', midi: note(n), duration: stage === 'end' ? 3.7 : 3.1, gain: .025 * subdued, pan: (i - 1) * .32 });
  }
  const motif = profile.motif[(slot + (phrase % 3) * 2) % 16];
  if (motif >= 0 && (slot % 2 === 0 || energy > .45)) {
    events.push({ voice: stage === 'nether' ? 'metal' : 'key', midi: note(motif) + 12, duration: stage === 'end' ? 1.9 : stage === 'nether' ? .38 : 1.15, gain: (stage === 'nether' ? .035 : .068) * subdued, pan: Math.sin(index * .8) * .3 });
  }
  if (slot % (stage === 'nether' ? 4 : 8) === 0) events.push({ voice: 'bass', midi: note(0) - 12, duration: stage === 'nether' ? .42 : 1.7, gain: stage === 'nether' ? .075 : .048, pan: 0 });
  if (energy > .35 && slot % 4 === 0) events.push({ voice: 'kick', duration: .17, gain: .035 + energy * .025, pan: 0 });
  if (energy > .55 && slot % (energy > .88 ? 1 : 2) === 0) events.push({ voice: 'tick', duration: .038, gain: .008 + energy * .009, pan: slot % 4 ? .2 : -.2 });
  if (boss && slot === 12) events.push({ voice: 'metal', midi: note(4) + 12, duration: .65, gain: .038, pan: -.25 });
  return { step: index, stage: stage === 'return' ? 'overworld' : stage, bpm, stepSeconds, events };
}

export class GameAudio {
  constructor({ muted = false, musicMuted = false } = {}) {
    this.muted = !!muted; this.musicMuted = !!musicMuted;
    this._context = null; this._unlocking = null; this._disposed = false;
    this._voices = new Set(); this._lastPlayed = new Map(); this._listeners = [];
    this._musicStep = 0; this._nextMusicTime = 0; this._musicStage = null;
    this._state = { stage: 'overworld', weather: 'sunny', phase: 'ready', combo: 0, boss: false };
    this._focused = true;
    this._document = globalThis.document || null; this._window = globalThis.window || null;
    this._visible = !this._document?.hidden && this._document?.visibilityState !== 'hidden';
    this._listen(this._window, 'blur', () => { this._focused = false; this._stopAll(); });
    this._listen(this._window, 'focus', () => { this._focused = true; this._nextMusicTime = 0; });
    this._listen(this._document, 'visibilitychange', () => {
      this._visible = !this._document.hidden && this._document.visibilityState !== 'hidden';
      if (!this._visible) this._stopAll(); else this._nextMusicTime = 0;
    });
    this._listen(this._window, 'pagehide', () => { this._visible = false; this._stopAll(); });
    this._listen(this._window, 'pageshow', () => { this._visible = !this._document?.hidden; this._nextMusicTime = 0; });
  }

  _listen(target, type, handler) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler); this._listeners.push([target, type, handler]);
  }

  /** Call from a click/pointer/key gesture. No other method creates or resumes
   * the AudioContext, including automatic focus/visibility restoration. */
  async unlock() {
    if (this._disposed || this.muted) return false;
    if (this._unlocking) return this._unlocking;
    this._unlocking = (async () => {
      try {
        if (!this._context || this._context.state === 'closed') {
          const Constructor = this._window?.AudioContext || globalThis.AudioContext || this._window?.webkitAudioContext || globalThis.webkitAudioContext;
          if (!Constructor) return false;
          this._context = new Constructor(); this._buildGraph();
        }
        if (this._context.state !== 'running') await this._context.resume();
        if (this._disposed) return false;
        this._setBusLevels(); this._pumpMusic();
        return this._context.state === 'running';
      } catch { return false; }
    })();
    try { return await this._unlocking; } finally { this._unlocking = null; }
  }

  _buildGraph() {
    const context = this._context;
    this._master = context.createGain(); this._effects = context.createGain(); this._music = context.createGain();
    this._compressor = context.createDynamicsCompressor();
    this._compressor.threshold.value = -18; this._compressor.knee.value = 18; this._compressor.ratio.value = 7;
    this._compressor.attack.value = .003; this._compressor.release.value = .19;
    this._effects.connect(this._compressor); this._music.connect(this._compressor);
    this._compressor.connect(this._master); this._master.connect(context.destination);
    this._noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = this._noiseBuffer.getChannelData(0); let last = 0;
    for (let i = 0; i < samples.length; i++) { last = last * .65 + (Math.random() * 2 - 1) * .35; samples[i] = last; }
    this._setBusLevels();
  }

  _setBusLevels() {
    if (!this._context || !this._master) return;
    const now = this._context.currentTime;
    for (const [node, value] of [[this._master, this.muted ? 0 : AUDIO_MIX.master], [this._effects, AUDIO_MIX.effects], [this._music, this.musicMuted ? 0 : AUDIO_MIX.music]]) {
      node.gain.cancelScheduledValues(now); node.gain.setValueAtTime(value, now);
    }
  }

  setMuted(value) {
    this.muted = !!value;
    if (this.muted) this._stopAll();
    this._setBusLevels();
  }

  setMusicMuted(value) {
    this.musicMuted = !!value;
    if (this.musicMuted) this._stopMusic();
    this._setBusLevels();
  }

  update({ stage = 'overworld', weather = 'sunny', phase = 'playing', combo = 0, boss = false } = {}) {
    if (this._disposed) return;
    const previous = this._state;
    this._state = { stage, weather, phase, combo: Math.max(0, finite(combo)), boss: !!boss };
    if (phase !== previous.phase && (phase === 'paused' || phase === 'transition')) this._stopAll();
    if (stage !== previous.stage) this._stopMusic();
    if (!MUSICAL_PHASES.has(phase)) this._stopMusic();
    if (this._context) this._reap(this._context.currentTime);
    this._pumpMusic();
  }

  _audible() {
    return !this._disposed && !this.muted && this._visible && this._focused && this._context?.state === 'running';
  }

  _pumpMusic() {
    if (!this._audible() || this.musicMuted || !MUSICAL_PHASES.has(this._state.phase)) return;
    const now = this._context.currentTime;
    if (!this._nextMusicTime || this._nextMusicTime < now - .05) this._nextMusicTime = now + .04;
    const horizon = now + AUDIO_LIMITS.lookAhead;
    for (let scheduled = 0; this._nextMusicTime < horizon && scheduled < 4; scheduled++) {
      const score = composeMusicStep(this._musicStep, this._state);
      for (const event of score.events) this._musicEvent(event, this._nextMusicTime);
      this._nextMusicTime += score.stepSeconds; this._musicStep++;
    }
    this._musicStage = this._state.stage;
  }

  _musicEvent(event, at) {
    if (event.voice === 'tick') return this._noise(at, event.duration, event.gain, { kind: 'music', highpass: 4500, lowpass: 7000, pan: event.pan });
    if (event.voice === 'kick') return this._tone(88, at, event.duration, event.gain, { kind: 'music', endFrequency: 38, wave: 'sine', attack: .005 });
    const options = { kind: 'music', pan: event.pan, wave: event.voice === 'bass' ? 'triangle' : 'sine', attack: event.voice === 'pad' ? .32 : .008 };
    if (event.voice === 'pad') options.lowpass = 900;
    if (event.voice === 'key') { options.wave = 'triangle'; options.lowpass = 2200; }
    if (event.voice === 'metal') options.wave = 'sine';
    return this._tone(frequency(event.midi), at, event.duration, event.gain, options);
  }

  _canAllocate(kind) {
    this._reap(this._context.currentTime);
    if (this._voices.size >= AUDIO_LIMITS.voices) return false;
    let same = 0; for (const voice of this._voices) if (voice.kind === kind) same++;
    return same < (kind === 'music' ? AUDIO_LIMITS.musicVoices : AUDIO_LIMITS.effectVoices);
  }

  _connectVoice(source, at, duration, gain, { kind = 'effect', attack = .004, lowpass, highpass, pan = 0 } = {}) {
    const context = this._context;
    if (!this._canAllocate(kind)) { source.disconnect(); return null; }
    const start = Math.max(context.currentTime, at), end = start + Math.max(.025, duration);
    const envelope = context.createGain(), nodes = [source, envelope];
    let tail = source;
    for (const [type, cutoff] of [['highpass', highpass], ['lowpass', lowpass]]) if (cutoff) {
      const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = cutoff; filter.Q.value = .55;
      tail.connect(filter); tail = filter; nodes.push(filter);
    }
    tail.connect(envelope); tail = envelope;
    if (context.createStereoPanner) { const panner = context.createStereoPanner(); panner.pan.value = clamp(pan, -.65, .65); envelope.connect(panner); tail = panner; nodes.push(panner); }
    tail.connect(kind === 'music' ? this._music : this._effects);
    const peak = clamp(gain, .0001, .22), rise = Math.min(Math.max(.002, attack), duration * .35);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.linearRampToValueAtTime(peak, start + rise);
    envelope.gain.exponentialRampToValueAtTime(.0001, end);
    const voice = { source, envelope, nodes, kind, start, end, stopped: false };
    this._voices.add(voice); source.onended = () => this._cleanVoice(voice);
    return voice;
  }

  _tone(hz, at, duration, gain, options = {}) {
    if (!this._audible() || (options.kind === 'music' && this.musicMuted)) return false;
    const source = this._context.createOscillator(); source.type = options.wave || 'sine';
    const jitter = options.kind === 'music' ? 1 : .985 + Math.random() * .03;
    const start = Math.max(this._context.currentTime, at), pitch = clamp(hz * jitter, 28, 5500);
    source.frequency.setValueAtTime(pitch, start);
    if (options.endFrequency) source.frequency.exponentialRampToValueAtTime(clamp(options.endFrequency * jitter, 25, 5500), start + Math.max(.02, duration));
    const voice = this._connectVoice(source, start, duration, gain, options);
    if (!voice) return false;
    source.start(voice.start); source.stop(voice.end + .015); return true;
  }

  _noise(at, duration, gain, options = {}) {
    if (!this._audible() || (options.kind === 'music' && this.musicMuted)) return false;
    const source = this._context.createBufferSource(); source.buffer = this._noiseBuffer;
    const voice = this._connectVoice(source, at, duration, gain, options);
    if (!voice) return false;
    source.start(voice.start, Math.random() * .25); source.stop(voice.end + .015); return true;
  }

  play(type, options = {}) {
    if (!this._audible() || !(type in INTERVALS)) return false;
    if (!['ready', 'playing'].includes(this._state.phase) && !UI_SOUNDS.has(type)) return false;
    const now = this._context.currentTime;
    if (now - (this._lastPlayed.get(type) ?? -Infinity) < INTERVALS[type]) return false;
    const strength = clamp(finite(options.intensity, 1), 0, 1.4); if (!strength) return false;
    this._lastPlayed.set(type, now);
    const energy = comboEnergy(options.combo ?? this._state.combo), pitch = 2 ** (energy * 7 / 12);
    const tone = (hz, duration, gain, extra = {}, offset = 0) => this._tone(hz * pitch, now + offset, duration, gain * strength, extra);
    const noise = (duration, gain, extra = {}, offset = 0) => this._noise(now + offset, duration, gain * strength, extra);
    if(type==='beam'){
      tone(165,.34,.11,{wave:'sawtooth',lowpass:1700,endFrequency:55});tone(660,.28,.045,{wave:'sine',endFrequency:165});noise(.17,.045,{highpass:900,lowpass:3500});
    }else if(type==='beamReady'){
      tone(520,.12,.055,{wave:'triangle'});tone(1040,.22,.05,{},.06);
    }else if(type==='shatter'){
      noise(.13,.08,{highpass:2200,lowpass:6000});[1320,1760,2200].forEach((hz,i)=>tone(hz,.22,.034,{endFrequency:hz*.7},i*.025));
    }else if(type==='quake'){
      tone(65,.27,.115,{wave:'triangle',endFrequency:28});noise(.2,.06,{lowpass:500});
    }else if(type==='gravity'){
      tone(620,.18,.075,{endFrequency:60});tone(45,.28,.1,{wave:'triangle',endFrequency:110},.13);
    }else if(type==='ignite'){
      noise(.16,.045,{highpass:750,lowpass:4200});tone(180,.13,.025,{endFrequency:65});
    }else if(type==='catch'){
      tone(540,.13,.065,{wave:'triangle',endFrequency:810});tone(options.grade==='perfect'?1080:810,.18,.05,{},.045);
    } else if (type === 'shot') {
      tone(170, .15, .16, { wave: 'triangle', endFrequency: 55 }); noise(.045, .07, { highpass: 450, lowpass: 3000 });
    } else if (type === 'hit') {
      const hz = options.shield ? 1050 : options.material === 'wood' || options.material === 'tree' ? 235 : 510;
      tone(hz, options.shield ? .13 : .075, .072, { wave: options.shield ? 'sine' : 'triangle', endFrequency: hz * .62 });
      noise(.032, .05, { highpass: options.shield ? 1600 : 500, lowpass: 4400 });
      if (options.crit) tone(hz * 1.5, .13, .065, {}, .008);
      if (options.burning) noise(.10, .035, { highpass: 1100, lowpass: 5600 });
    } else if (type === 'kill') {
      tone(370, .14, .085); tone(555, .18, .045, {}, .025);
      if (energy > .5) tone(740, .22, .04, {}, .045);
    } else if (type === 'hurt') {
      tone(92, .24, .16, { wave: 'triangle', endFrequency: 32 }); noise(.13, .08, { lowpass: 650 });
    } else if (type === 'level') {
      [330, 415.3, 493.9, 660].forEach((hz, i) => tone(hz, .32, .08, { wave: 'triangle', lowpass: 2500 }, i * .065));
    } else if (type === 'recall') {
      tone(720, .22, .075, { endFrequency: 180 }); tone(240, .24, .055, { endFrequency: 480 }, .04);
    } else if (type === 'bounce') {
      tone(335 + energy * 90, .055, .045, { wave: 'triangle', endFrequency: 210 });
      if (energy > .7) tone(670, .085, .022, {}, .01);
    } else if (type === 'mine') {
      const wood = options.material === 'wood' || options.material === 'tree';
      tone(wood ? 155 : 740, wood ? .10 : .14, .073, { wave: wood ? 'triangle' : 'sine', endFrequency: wood ? 90 : 580 });
      noise(.06, .07, { highpass: wood ? 200 : 1400, lowpass: wood ? 1300 : 4200 });
    } else if (type === 'break') {
      noise(.19, .115, { highpass: 180, lowpass: 3200 }); tone(150, .16, .075, { endFrequency: 45 }); tone(660, .17, .04, {}, .045);
    } else if (type === 'lightning') {
      noise(.12, .10, { highpass: 1800, lowpass: 6500 }); tone(115, .19, .09, { endFrequency: 42 }); tone(1250, .065, .03);
    } else if (type === 'explosion') {
      tone(110, .32, .19, { endFrequency: 28 }); noise(.28, .14, { lowpass: 1300 }); noise(.065, .075, { highpass: 800, lowpass: 4400 });
    } else if (type === 'allyMelt') {
      tone(580, .42, .055, { endFrequency: 110 }); noise(.23, .05, { highpass: 2500, lowpass: 5500 });
    } else if (type === 'craft') {
      noise(.035, .065, { highpass: 1200, lowpass: 3800 }); tone(440, .15, .075); tone(660, .23, .065, {}, .07);
    } else if (type === 'xp') {
      tone(880, .11, .042, { wave: 'sine', endFrequency: 1100 });
      if (energy > .65) tone(1320, .12, .021, {}, .012);
    }
    return true;
  }

  _reap(now) { for (const voice of [...this._voices]) if (now > voice.end + .06) this._cleanVoice(voice); }

  _cleanVoice(voice) {
    if (!this._voices.delete(voice)) return;
    voice.source.onended = null;
    for (const node of voice.nodes) { try { node.disconnect(); } catch { /* An already disconnected node needs no further cleanup. */ } }
  }

  _stopVoice(voice) {
    if (voice.stopped) return;
    voice.stopped = true;
    try { voice.source.stop(this._context.currentTime); } catch { /* Already stopped. */ }
    this._cleanVoice(voice);
  }
  _stopMusic() { for (const voice of [...this._voices]) if (voice.kind === 'music') this._stopVoice(voice); this._nextMusicTime = 0; }
  _stopAll() { for (const voice of [...this._voices]) this._stopVoice(voice); this._nextMusicTime = 0; }

  dispose() {
    if (this._disposed) return;
    this._disposed = true; this._stopAll();
    for (const [target, type, handler] of this._listeners) target.removeEventListener(type, handler);
    this._listeners.length = 0;
    for (const node of [this._effects, this._music, this._compressor, this._master]) node?.disconnect();
    this._noiseBuffer = null;
    if (this._context && this._context.state !== 'closed') {
      try { void this._context.close().catch(() => {}); } catch { /* Device may already be unavailable. */ }
    }
  }
}
