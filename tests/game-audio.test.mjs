import test from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, AUDIO_LIMITS, composeMusicStep, comboEnergy } from '../src/game-audio.js';

test('build effect sounds respect throttling, pause and the shared voice budget',async t=>{
  const {audio,context}=fixture(t,{musicMuted:true});await audio.unlock();audio.update({phase:'playing'});
  for(const type of ['beam','beamReady','shatter','quake','gravity','ignite']){
    context().advance(.7);assert.equal(audio.play(type),true,type);assert.equal(audio.play(type),false,`${type} must throttle`);
    assert.ok(audio._voices.size<=AUDIO_LIMITS.voices);
  }
  audio.update({phase:'paused'});context().advance(1);assert.equal(audio.play('beam'),false);
  audio.update({phase:'playing'});audio.setMuted(true);assert.equal(audio.play('shatter'),false);assert.equal(audio._voices.size,0);
});

class Parameter {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { assert.ok(Number.isFinite(value + time)); this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { assert.ok(Number.isFinite(value + time)); this.value = value; this.events.push(['linear', value, time]); }
  exponentialRampToValueAtTime(value, time) { assert.ok(value > 0 && Number.isFinite(value + time)); this.value = value; this.events.push(['exponential', value, time]); }
  cancelScheduledValues(time) { assert.ok(Number.isFinite(time)); }
}
class AudioNode {
  constructor(context, kind) { this.context = context; this.kind = kind; this.connections = []; this.disconnected = false; context.nodes.push(this); }
  connect(node) { assert.ok(node); this.connections.push(node); return node; }
  disconnect() { this.connections.length = 0; this.disconnected = true; }
}
class Source extends AudioNode {
  constructor(context, kind) { super(context, kind); this.frequency = new Parameter(); this.ended = false; context.sources.push(this); }
  start(time, offset = 0) {
    assert.equal(this.startAt, undefined); assert.ok(time >= this.context.currentTime && offset >= 0);
    this.startAt = time;
    this.context.maxConcurrent = Math.max(this.context.maxConcurrent, this.context.sources.filter(source => source.startAt !== undefined && !source.ended).length);
  }
  stop(time) { this.stopAt = time; if (time <= this.context.currentTime) this.finish(); }
  finish() { if (this.ended) return; this.ended = true; this.onended?.(); }
}
class MockAudioContext {
  constructor() { this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 8000; this.nodes = []; this.sources = []; this.maxConcurrent = 0; this.resumeCalls = 0; this.closeCalls = 0; this.buffers = 0; this.destination = new AudioNode(this, 'destination'); }
  createGain() { const node = new AudioNode(this, 'gain'); node.gain = new Parameter(1); return node; }
  createDynamicsCompressor() { const node = new AudioNode(this, 'compressor'); for (const name of ['threshold', 'knee', 'ratio', 'attack', 'release']) node[name] = new Parameter(); return node; }
  createBiquadFilter() { const node = new AudioNode(this, 'filter'); node.frequency = new Parameter(); node.Q = new Parameter(); return node; }
  createStereoPanner() { const node = new AudioNode(this, 'panner'); node.pan = new Parameter(); return node; }
  createOscillator() { return new Source(this, 'oscillator'); }
  createBufferSource() { return new Source(this, 'noise'); }
  createBuffer(channels, length, sampleRate) { this.buffers++; const data = new Float32Array(length); return { duration: length / sampleRate, getChannelData() { return data; } }; }
  async resume() { this.resumeCalls++; this.state = 'running'; }
  async close() { this.closeCalls++; this.state = 'closed'; for (const source of this.sources) source.finish(); }
  advance(seconds) { this.currentTime += seconds; for (const source of this.sources) if (source.stopAt <= this.currentTime) source.finish(); }
}
class Host extends EventTarget {
  constructor() { super(); this.listeners = new Set(); this.hidden = false; this.visibilityState = 'visible'; }
  addEventListener(type, handler) { super.addEventListener(type, handler); this.listeners.add(handler); }
  removeEventListener(type, handler) { super.removeEventListener(type, handler); this.listeners.delete(handler); }
}
function fixture(t, options = {}) {
  const previous = { window: globalThis.window, document: globalThis.document };
  const window = new Host(), document = new Host(), contexts = [];
  window.AudioContext = function () { const context = new MockAudioContext(); contexts.push(context); return context; };
  globalThis.window = window; globalThis.document = document;
  const audio = new GameAudio(options);
  t.after(() => {
    audio.dispose();
    for (const key of ['window', 'document']) if (previous[key] === undefined) delete globalThis[key]; else globalThis[key] = previous[key];
  });
  return { audio, window, document, contexts, context: () => contexts[0] };
}

test('composition has a stable advancing phrase, distinct realm instrumentation and bounded combo energy', () => {
  assert.deepEqual(composeMusicStep(7), composeMusicStep(7));
  assert.notDeepEqual(composeMusicStep(0).events, composeMusicStep(16).events);
  assert.equal(composeMusicStep(0, { stage: 'overworld' }).bpm, 72);
  assert.equal(composeMusicStep(0, { stage: 'nether' }).bpm, 84);
  assert.equal(composeMusicStep(0, { stage: 'end' }).bpm, 62);
  assert.deepEqual(composeMusicStep(16, { stage: 'return' }).events, composeMusicStep(16, { stage: 'overworld' }).events);
  assert.equal(comboEnergy(0), 0); assert.equal(comboEnergy(1e9), 1); assert.equal(comboEnergy(NaN), 0);
  const quiet = composeMusicStep(0), intense = composeMusicStep(0, { combo: 100, boss: true });
  assert.ok(intense.events.some(event => event.voice === 'kick'));
  assert.ok(intense.events.some(event => event.voice === 'tick'));
  assert.ok(intense.events.length > quiet.events.length);
  for (const stage of ['overworld', 'nether', 'end']) for (let step = 0; step < 64; step++) {
    const plan = composeMusicStep(step, { stage, combo: 100, boss: true });
    assert.ok(plan.stepSeconds >= .25 && plan.stepSeconds < .5);
    assert.ok(plan.events.every(event => event.duration > 0 && event.gain > 0 && event.gain <= .08));
  }
});

test('only explicit unlock creates/resumes a context and existing master mute stays silent', async t => {
  const { audio, contexts } = fixture(t, { muted: true });
  audio.update({ phase: 'playing' }); assert.equal(audio.play('shot'), false);
  assert.equal(await audio.unlock(), false); assert.equal(contexts.length, 0);
  audio.setMuted(false); audio.update({ phase: 'playing' }); assert.equal(contexts.length, 0);
  assert.equal(await audio.unlock(), true); assert.equal(contexts.length, 1);
  await audio.unlock(); assert.equal(contexts.length, 1); assert.equal(contexts[0].resumeCalls, 1);
});

test('music advances continuously without restarting on repeated updates and schedules only a short horizon', async t => {
  const { audio, context } = fixture(t);
  await audio.unlock(); const ctx = context(); audio.update({ phase: 'playing', stage: 'overworld' });
  const firstStep = audio._musicStep, firstCount = ctx.sources.length;
  for (let i = 0; i < 100; i++) audio.update({ phase: 'playing', stage: 'overworld' });
  assert.equal(audio._musicStep, firstStep); assert.equal(ctx.sources.length, firstCount);
  for (let i = 0; i < 80; i++) {
    ctx.advance(.1); audio.update({ phase: 'playing', stage: 'overworld', combo: 12 });
    for (const voice of audio._voices) if (voice.kind === 'music') assert.ok(voice.start <= ctx.currentTime + AUDIO_LIMITS.lookAhead + 1e-9);
  }
  assert.ok(audio._musicStep > 16);
  const step = audio._musicStep; ctx.advance(20); audio.update({ phase: 'playing', stage: 'nether' });
  assert.ok(audio._musicStep >= step && audio._musicStep <= step + 2, 'a gap does not replay twenty seconds of missed notes');
});

test('music mute cancels queued music while effects remain usable and master mute cancels everything', async t => {
  const { audio, context } = fixture(t); await audio.unlock(); const ctx = context();
  audio.update({ phase: 'playing' }); assert.ok([...audio._voices].some(voice => voice.kind === 'music'));
  audio.setMusicMuted(true); assert.ok([...audio._voices].every(voice => voice.kind !== 'music'));
  assert.equal(audio.play('shot'), true); assert.ok(audio._voices.size > 0);
  const started = ctx.sources.filter(source => source.startAt !== undefined).length;
  ctx.advance(3); audio.update({ phase: 'playing' });
  assert.equal(ctx.sources.filter(source => source.startAt !== undefined).length, started);
  audio.setMusicMuted(false); audio.update({ phase: 'playing' });
  audio.play('hit'); audio.setMuted(true); assert.equal(audio._voices.size, 0);
  const count = ctx.sources.length; ctx.advance(10); audio.update({ phase: 'playing' });
  assert.equal(audio.play('craft'), false); assert.equal(ctx.sources.length, count);
  assert.equal(audio._master.gain.value, 0);
});

test('pause stops pre-scheduled notes, permits explicit crafting cues, and never resumes BGM by itself', async t => {
  const { audio, context } = fixture(t); await audio.unlock(); const ctx = context();
  audio.update({ phase: 'playing' }); audio.play('level');
  assert.ok([...audio._voices].some(voice => voice.start > ctx.currentTime));
  audio.update({ phase: 'paused' }); assert.equal(audio._voices.size, 0);
  assert.equal(audio.play('hit'), false); assert.equal(audio.play('craft'), true);
  const effects = audio._voices.size; audio.update({ phase: 'paused' }); assert.equal(audio._voices.size, effects);
  assert.ok([...audio._voices].every(voice => voice.kind === 'effect'));
  ctx.advance(1); audio.update({ phase: 'paused' }); assert.equal(audio._voices.size, 0);
  audio.update({ phase: 'won' }); assert.ok([...audio._voices].every(voice => voice.kind !== 'music'));
});

test('blur and hidden-page events immediately stop audio and focus never resumes a suspended context', async t => {
  const { audio, window, document, context } = fixture(t); await audio.unlock(); const ctx = context();
  audio.play('explosion'); window.dispatchEvent(new Event('blur'));
  assert.equal(audio._voices.size, 0); assert.equal(audio.play('craft'), false);
  window.dispatchEvent(new Event('focus')); audio.update({ phase: 'playing' });
  document.hidden = true; document.visibilityState = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(audio._voices.size, 0);
  const count = ctx.sources.length; audio.update({ phase: 'playing' }); assert.equal(ctx.sources.length, count);
  ctx.state = 'suspended'; const resumes = ctx.resumeCalls;
  document.hidden = false; document.visibilityState = 'visible'; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
  audio.update({ phase: 'playing' }); assert.equal(ctx.resumeCalls, resumes); assert.equal(audio._voices.size, 0);
  assert.equal(await audio.unlock(), true); assert.equal(ctx.resumeCalls, resumes + 1);
});

test('busy collisions remain under both voice caps, use one noise buffer and release all transient nodes', async t => {
  const { audio, context } = fixture(t); await audio.unlock(); const ctx = context();
  const types = ['shot', 'hit', 'kill', 'hurt', 'level', 'recall', 'bounce', 'mine', 'break', 'lightning', 'explosion', 'allyMelt', 'craft', 'xp'];
  for (let frame = 0; frame < 90; frame++) {
    ctx.advance(.08); audio.update({ phase: 'playing', combo: 100, boss: true });
    for (const type of types) audio.play(type, { combo: 100, crit: true, burning: true, intensity: 10 });
    assert.ok(audio._voices.size <= AUDIO_LIMITS.voices);
    assert.ok([...audio._voices].filter(voice => voice.kind === 'music').length <= AUDIO_LIMITS.musicVoices);
    assert.ok([...audio._voices].filter(voice => voice.kind === 'effect').length <= AUDIO_LIMITS.effectVoices);
  }
  assert.ok(ctx.maxConcurrent <= AUDIO_LIMITS.voices);
  assert.equal(ctx.buffers, 1);
  for (const node of ctx.nodes) if (node.gain) for (const event of node.gain.events) if (event[0] === 'linear') assert.ok(event[1] <= .22);
  ctx.advance(10); audio.update({ phase: 'paused' });
  assert.equal(audio._voices.size, 0);
  assert.ok(ctx.sources.every(source => source.disconnected));
});

test('XP, shield blocks and high-combo bounces use distinct restrained pitches with event throttling', async t => {
  const { audio, context } = fixture(t, { musicMuted: true }); await audio.unlock(); const ctx = context();
  audio.update({ phase: 'playing' });
  assert.equal(audio.play('bounce', { combo: 0 }), true);
  const low = ctx.sources.find(source => source.kind === 'oscillator').frequency.events[0][1];
  const count = ctx.sources.length; assert.equal(audio.play('bounce', { combo: 100 }), false); assert.equal(ctx.sources.length, count);
  ctx.advance(.2); const start = ctx.sources.length; audio.play('bounce', { combo: 40 });
  const high = ctx.sources.slice(start).find(source => source.kind === 'oscillator').frequency.events[0][1];
  assert.ok(high > low * 1.5);
  ctx.advance(.2); const hitStart = ctx.sources.length; audio.play('hit', { shield: true, combo: 0 });
  const shield = ctx.sources.slice(hitStart).find(source => source.kind === 'oscillator').frequency.events[0][1];
  assert.ok(shield > 1000);
  ctx.advance(.2); const xpStart = ctx.sources.length; assert.equal(audio.play('xp', { combo: 0 }), true);
  const xp = ctx.sources.slice(xpStart).find(source => source.kind === 'oscillator').frequency.events[0][1];
  assert.ok(xp > 850 && xp < 910);
  assert.equal(audio.play('xp'), false);
});

test('stage changes cancel old palette voices without restarting the transport or leaking music into terminal phases', async t => {
  const { audio, context } = fixture(t); await audio.unlock(); const ctx = context();
  for (let i = 0; i < 20; i++) { ctx.advance(.1); audio.update({ phase: 'playing', stage: 'overworld' }); }
  const step = audio._musicStep, old = [...audio._voices].filter(voice => voice.kind === 'music');
  audio.update({ phase: 'playing', stage: 'nether', boss: true });
  assert.ok(old.every(voice => voice.source.ended));
  assert.ok(audio._musicStep >= step);
  audio.update({ phase: 'transition', stage: 'nether' }); assert.equal(audio._voices.size, 0);
  audio.update({ phase: 'playing', stage: 'end' });
  audio.update({ phase: 'lost', stage: 'end' });
  assert.ok([...audio._voices].every(voice => voice.kind !== 'music'));
});

test('transition-completion ally melt cues survive the previous frame phase without allowing combat effects', async t => {
  const { audio, context } = fixture(t); await audio.unlock(); const ctx = context();
  audio.update({ phase: 'transition', stage: 'overworld' });
  assert.equal(audio.play('hit'), false); assert.equal(audio.play('shot'), false);
  assert.equal(audio.play('allyMelt'), true);
  const meltVoices = [...audio._voices]; assert.ok(meltVoices.length > 0);
  audio.update({ phase: 'playing', stage: 'nether' });
  assert.ok(meltVoices.every(voice => !voice.source.ended), 'the new realm must not cut off its arrival notification');
  ctx.advance(1); audio.update({ phase: 'paused', stage: 'nether' });
  assert.equal(audio.play('explosion'), false);
});

test('dispose removes listeners, stops every voice, disconnects the graph and closes the context exactly once', async t => {
  const { audio, window, document, context, contexts } = fixture(t); await audio.unlock(); const ctx = context();
  audio.play('level'); assert.ok(window.listeners.size > 0); assert.ok(document.listeners.size > 0);
  audio.dispose(); audio.dispose();
  assert.equal(ctx.closeCalls, 1); assert.equal(ctx.state, 'closed'); assert.equal(audio._voices.size, 0);
  assert.equal(window.listeners.size, 0); assert.equal(document.listeners.size, 0);
  assert.ok(ctx.nodes.filter(node => node.kind !== 'destination').every(node => node.disconnected));
  const count = ctx.sources.length; audio.update({ phase: 'playing' }); assert.equal(audio.play('shot'), false);
  assert.equal(await audio.unlock(), false); assert.equal(contexts.length, 1); assert.equal(ctx.sources.length, count);
});
