import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { Game } from '../src/core.js';
import { WaveAnnouncement } from '../src/wave-announcement.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const stageNames = { overworld: '主世界', nether: '下界', return: '主世界 · 反攻', end: '末地' };
const weatherNames = { sunny: '晴天', rain: '雨天', storm: '雷暴', night: '黑夜', nether: '炽热', end: '虚空' };

function fixture(t) {
  const window = new Window({ settings: { enableJavaScriptEvaluation: false, enableCSSFileLoading: false, enableImageFileLoading: false } });
  window.document.write(html);
  t.after(() => window.happyDOM.close());
  const get = id => window.document.getElementById(id);
  const shown = [], descriptions = [], events = [];
  let coordinator;
  const show = (caption, title, description, keepWave = false) => {
    if (!keepWave) coordinator.clear();
    shown.push({ caption, title, description });
    get('phase-caption').textContent = caption;
    get('phase-name').textContent = title;
    get('phase-description').textContent = description;
    get('phase-announcement').hidden = false;
  };
  coordinator = new WaveAnnouncement({
    stageNames, weatherNames,
    show: (...args) => show(...args, true),
    updateDescription: description => { descriptions.push(description); get('phase-description').textContent = description; },
  });
  const game = new Game({ random: () => 0.55, onEvent(event) {
    events.push(event);
    if (event.type === 'waveStart') coordinator.showWave(event, game.state.weather);
    if (event.type === 'weatherChange' && !coordinator.updateWeather(game.state.stage, event.weather)) show('天气变化', weatherNames[event.weather], '独立天气说明');
    if (event.type === 'stageChange') show('新的阶段', stageNames[event.to], game.getObjective());
  } });
  game.start(); game._spawnTimer = Infinity;
  shown.length = descriptions.length = events.length = 0;
  return { game, coordinator, get, shown, descriptions, events, show };
}

test('real third-wave weather events update only the description of the health banner', t => {
  const f = fixture(t);
  f.game.state.stageElapsed = 59.99; f.game.state.stageWave = 2; f.game._lastStageWave = 2;
  f.game.update(0.02);
  assert.deepEqual(f.events.filter(e => ['waveStart', 'weatherChange'].includes(e.type)).map(e => e.type), ['waveStart', 'weatherChange']);
  assert.equal(f.shown.length, 1, 'the banner animation and hide timer should start once');
  assert.equal(f.descriptions.length, 1, 'weather changes text in place');
  assert.equal(f.get('phase-caption').textContent, '主世界 · 第 3 波');
  assert.equal(f.get('phase-name').textContent, '怪物生命 ×1.24');
  assert.equal(f.get('phase-description').textContent, '新出现怪物与护盾 +24% · 雷暴');
  assert.equal(f.get('phase-announcement').hidden, false);
});

test('a later independent weather event uses its ordinary banner instead of an old wave', async t => {
  const f = fixture(t);
  f.game.state.stageWave = 3; f.game._onStageWave(3);
  await Promise.resolve();
  f.game.state.weather = 'rain'; f.game.onEvent({ type: 'weatherChange', weather: 'rain' });
  assert.equal(f.shown.length, 2);
  assert.equal(f.get('phase-caption').textContent, '天气变化');
  assert.equal(f.get('phase-name').textContent, '雨天');
  assert.equal(f.get('phase-description').textContent, '独立天气说明');
});

test('new stages and new runs clear pending wave reconciliation immediately', t => {
  const f = fixture(t);
  f.game.state.stageWave = 3; f.game._onStageWave(3);
  f.coordinator.clear(); f.game._changeStage('nether');
  assert.equal(f.coordinator.pending, null);
  assert.equal(f.coordinator.updateWeather('overworld', 'storm'), false);
  f.game.state.stageWave = 5; f.game._onStageWave(5);
  f.coordinator.clear(); f.game.start();
  assert.equal(f.coordinator.updateWeather('nether', 'nether'), false);
  assert.equal(f.coordinator.pending, null);
  assert.equal(f.game.state.stage, 'overworld');
});

test('an intervening stage or portal announcement cannot be overwritten by pending wave weather', t => {
  const f = fixture(t);
  f.game.state.stageWave = 2; f.game._onStageWave(2);
  f.show('村民援助', '末地之门升起', '准备穿越');
  assert.equal(f.coordinator.updateWeather('overworld', 'storm'), false);
  assert.equal(f.get('phase-name').textContent, '末地之门升起');
  assert.equal(f.get('phase-description').textContent, '准备穿越');
});

test('ordinary waves display their real percent and realm-mismatched weather is rejected', t => {
  const f = fixture(t);
  f.game.state.stageWave = 12; f.game._onStageWave(12);
  assert.equal(f.shown.length, 1);
  assert.equal(f.descriptions.length, 0);
  assert.equal(f.get('phase-name').textContent, '怪物生命 ×2.32');
  assert.match(f.get('phase-description').textContent, /\+132%/);
  assert.equal(f.coordinator.updateWeather('nether', 'nether'), false);
});

test('default scheduling does not bind a native queueMicrotask to the coordinator instance', () => {
  const original = globalThis.queueMicrotask;
  const queued = [];
  // Browser-native global methods accept a bare/global call, but reject an
  // arbitrary object receiver. Node's implementation does not enforce this.
  globalThis.queueMicrotask = function (callback) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    queued.push(callback);
  };
  try {
    const coordinator = new WaveAnnouncement({ show() {}, updateDescription() {} });
    assert.doesNotThrow(() => coordinator.showWave({ stage: 'overworld', stageWave: 3, hpMultiplier: 1.24, percent: 24 }, 'sunny'));
    assert.equal(queued.length, 1);
    assert.equal(coordinator.updateWeather('overworld', 'storm'), true);
    queued[0]();
    assert.equal(coordinator.pending, null);
    assert.equal(coordinator.updateWeather('overworld', 'rain'), false);
  } finally {
    globalThis.queueMicrotask = original;
  }
});
