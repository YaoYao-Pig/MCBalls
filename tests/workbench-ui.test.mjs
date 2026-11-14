import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Window } from 'happy-dom';
import { Game } from '../src/core.js';
import { WorkbenchPanel } from '../src/workbench-ui.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

// Unit-test DOM only: external scripts, styles and images never load. The app
// and WebGL renderer are not executed; component events call an actual Game.
function fixture(t) {
  const window = new Window({ url: 'http://localhost/', settings: {
    enableJavaScriptEvaluation: false, disableJavaScriptFileLoading: true,
    enableCSSFileLoading: false, enableImageFileLoading: false,
  } });
  window.document.write(html);
  const previous = globalThis.document;
  globalThis.document = window.document;
  t.after(async () => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
    await window.happyDOM.close();
  });
  const game = new Game({ random: () => .55 }); game.start(); game.togglePause();
  for (const id of Object.keys(game.state.materials)) game.state.materials[id] = 100;
  game.state.xp = 60;
  assert.equal(game.craft('enchanting_table'), true);
  assert.equal(game.craft('anvil'), true);
  const notifications = [], actions = [];
  const panel = new WorkbenchPanel(game, {
    notify: text => notifications.push(text),
    onAction: () => { actions.push(true); panel.refresh(); },
  });
  const get = id => window.document.getElementById(id);
  const select = (id, value) => {
    get(id).value = String(value);
    assert.equal(get(id).value, String(value), 'the requested option must actually exist');
    get(id).dispatchEvent(new window.Event('change', { bubbles: true }));
  };
  const tab = name => window.document.querySelector(`[data-station-tab="${name}"]`).click();
  const book = name => [...get('book-choices').querySelectorAll('button')].find(button => button.textContent.includes(name));
  const craftBall = id => {
    const before = new Set(game.state.balls.map(ball => ball.id));
    assert.equal(game.craft(id), true);
    return game.state.balls.find(ball => !before.has(ball.id));
  };
  return { window, game, panel, get, select, tab, book, craftBall, notifications, actions };
}

test('actual station markup contains every required control and defaults to the equipped owned rod', t => {
  const { game, panel, get, craftBall } = fixture(t);
  assert.equal(game.craft('bone_rod'), true);
  const iron = craftBall('iron_block');
  panel.show('anvil');
  assert.equal(get('station-panel').contains(get('fusion-action')), true);
  assert.equal(get('enchant-target').value, 'rod:bone');
  assert.deepEqual([...get('enchant-target').options].map(option => option.value), [
    'rod:wood', 'rod:bone', `ball:${game.state.balls[0].id}`, `ball:${iron.id}`,
  ]);
  assert.equal(get('station-title').textContent, '铁砧');
  assert.equal(get('enchant-body').hidden, false);
  assert.equal(get('fusion-body').hidden, true);
  assert.equal(get('enchant-action').disabled, false);
});

test('random enchant button modifies the explicitly selected rod without changing the equipped rod', t => {
  const { game, panel, get, select, actions } = fixture(t);
  game.craft('bone_rod');
  panel.show('enchantingTable');
  select('enchant-target', 'rod:wood');
  assert.equal(get('station-tabs').hidden, true);
  assert.match(get('enchant-action').textContent, /8/);
  get('enchant-action').click();
  assert.equal(game.state.activeRod, 'bone');
  assert.equal(Object.keys(game.state.rodEnchantments.wood).length, 2);
  assert.deepEqual(game.state.rodEnchantments.bone, {});
  assert.equal(game.state.xp, 52);
  assert.equal(get('enchant-target').value, 'rod:wood');
  assert.equal(get('current-enchants').querySelectorAll('.enchant-chip').length, 2);
  assert.equal(actions.length, 1);
});

test('block target select converts IDs correctly and isolates its enchantment bag', t => {
  const { game, panel, get, select, craftBall } = fixture(t);
  const cue = game.state.balls[0], iron = craftBall('iron_block');
  panel.show('enchantingTable');
  select('enchant-target', `ball:${iron.id}`);
  get('enchant-action').click();
  assert.equal(Object.keys(iron.enchantments).length, 2);
  assert.deepEqual(cue.enchantments, {});
  assert.deepEqual(game.state.rodEnchantments.wood, {});
  assert.deepEqual(game.state.baseEnchantments, {});
  assert.equal(get('enchant-target').value, `ball:${iron.id}`);
});

test('base upgrades have no workbench target or book entry while rod books remain usable', t => {
  const { game, panel, get, select, tab, book, actions } = fixture(t);
  game.state.books = { power: 1, shield: 1 };
  panel.show('anvil'); tab('book');
  assert.equal([...get('enchant-target').options].some(option => option.value === 'base:core'), false);
  assert.equal(book('黑曜石护盾'), undefined);
  select('enchant-target', 'rod:wood');
  assert.equal(book('重击').disabled, false);
  book('重击').click();
  assert.deepEqual(game.state.rodEnchantments.wood, { power: 1 });
  assert.deepEqual(game.state.baseEnchantments, {});
  assert.equal(game.state.books.power, 0);
  assert.equal(game.state.books.shield, 1, 'hiding an old base book must not silently consume it');
  assert.equal(game.state.xp, 57);
  assert.equal(actions.length, 1);
  assert.match(get('book-choices').textContent, /还没有附魔书/);
});

test('spending the last XP immediately disables random, incremental and book actions', t => {
  const { game, panel, get, tab, book } = fixture(t);
  game.state.xp = 8;
  panel.show('enchantingTable'); get('enchant-action').click();
  assert.equal(game.state.xp, 0);
  assert.equal(get('enchant-action').disabled, true);
  assert.match(get('enchant-reason').textContent, /经验不足/);
  const afterRandom = structuredClone(game.state);
  get('enchant-action').click(); assert.deepEqual(game.state, afterRandom);
  game.state.xp = 10;
  panel.show('anvil'); get('enchant-action').click();
  assert.equal(game.state.xp, 0);
  assert.equal(get('enchant-action').disabled, true);
  game.state.books = { power: 2 }; game.state.xp = 3;
  tab('book'); book('重击').click();
  assert.equal(game.state.xp, 0);
  assert.equal(game.state.books.power, 1);
  assert.equal(book('重击').disabled, true);
});

test('four-slot UI permits an existing upgrade but disables adding a fifth enchantment type', t => {
  const { game, panel, get, tab, book } = fixture(t);
  game.state.rodEnchantments.wood = { power: 1, charge: 4, crit: 4, knockback: 4 };
  game.state.books = { echo: 1, power: 1 };
  panel.show('anvil');
  assert.equal(get('enchant-slot-count').textContent, '4 / 4 项');
  assert.equal(get('enchant-action').disabled, false);
  get('enchant-action').click();
  assert.equal(game.state.rodEnchantments.wood.power, 2);
  tab('book');
  assert.equal(book('连击幻影').disabled, true);
  assert.equal(book('重击').disabled, false);
  const before = structuredClone(game.state);
  book('连击幻影').click(); assert.deepEqual(game.state, before);
});

test('a held block remains identifiable but cannot be enchanted or fused', t => {
  const { game, panel, get, select, tab, craftBall } = fixture(t);
  const iron = craftBall('iron_block'); iron.heldBy = 999;
  panel.show('anvil'); select('enchant-target', `ball:${iron.id}`);
  assert.equal(get('enchant-action').disabled, true);
  assert.match(get('enchant-reason').textContent, /抓住/);
  const before = structuredClone(game.state);
  get('enchant-action').click(); assert.deepEqual(game.state, before);
  tab('fusion');
  assert.equal(get('fusion-action').disabled, true);
  assert.match(get('fusion-reason').textContent, /抓住/);
  assert.ok([...get('fusion-b').options].some(option => option.value === String(iron.id) && option.textContent.includes('被抓住')));
});

test('fusion consumes the donor, preserves the cue ID and disables a second fusion with only one block', t => {
  const { game, panel, get, select, tab, craftBall, actions } = fixture(t);
  const cue = game.state.balls[0], iron = craftBall('iron_block');
  panel.show('anvil'); tab('fusion');
  select('fusion-a', iron.id); select('fusion-b', cue.id);
  assert.equal(get('enchant-body').hidden, true);
  assert.equal(get('fusion-body').hidden, false);
  assert.equal(get('fusion-action').disabled, false);
  get('fusion-action').click();
  assert.equal(game.state.balls.length, 1);
  assert.equal(game.state.balls[0].id, cue.id);
  assert.equal(game.state.balls[0].type, 'cue');
  assert.ok(game.state.balls[0].traits.includes('iron'));
  for (const id of ['fusion-a', 'fusion-b']) {
    assert.equal(get(id).options.length, 1);
    assert.equal(get(id).value, String(cue.id));
  }
  assert.equal(get('fusion-action').disabled, true);
  get('fusion-action').click();
  assert.equal(actions.length, 1);
  assert.equal(game.state.balls[0].fusionLevel, 1);
});

test('consumed fusion choices disappear and remaining blocks can be explicitly selected for another fusion', t => {
  const { game, panel, get, select, tab, craftBall } = fixture(t);
  const cue = game.state.balls[0], iron = craftBall('iron_block'), frost = craftBall('frost_block');
  panel.show('anvil'); tab('fusion');
  select('fusion-a', iron.id); select('fusion-b', frost.id); get('fusion-action').click();
  assert.equal(game.state.balls.length, 2);
  assert.ok(![...get('fusion-a').options, ...get('fusion-b').options].some(option => option.value === String(frost.id)));
  select('fusion-a', iron.id); select('fusion-b', cue.id);
  assert.equal(get('fusion-action').disabled, false);
  get('fusion-action').click();
  assert.equal(game.state.balls.length, 1);
  assert.equal(game.state.balls[0].id, cue.id);
  assert.equal(game.state.balls[0].fusionLevel, 2);
  assert.deepEqual(game.state.balls[0].traits, ['iron', 'frost']);
});

test('fusion button exposes duplicate, over-capacity and max-level rejection reasons without mutation', t => {
  const { game, panel, get, select, tab, craftBall } = fixture(t);
  const cue = game.state.balls[0], iron = craftBall('iron_block');
  panel.show('anvil'); tab('fusion'); select('fusion-b', cue.id);
  assert.equal(get('fusion-action').disabled, true);
  assert.match(get('fusion-reason').textContent, /不同/);
  cue.enchantments = { power: 1, crit: 1, ricochet: 1 };
  iron.enchantments = { fire_aspect: 1, frost_touch: 1 };
  panel.refresh(); select('fusion-b', iron.id);
  assert.equal(get('fusion-action').disabled, true);
  assert.match(get('fusion-reason').textContent, /四种/);
  const before = structuredClone(game.state); get('fusion-action').click(); assert.deepEqual(game.state, before);
  iron.enchantments = {}; cue.fusionLevel = 3; panel.refresh();
  assert.equal(get('fusion-action').disabled, true);
  assert.match(get('fusion-reason').textContent, /三级/);
});

test('changing station and tabs restores the correct action mode while preserving a valid target', t => {
  const { game, panel, get, select, tab, craftBall } = fixture(t);
  const iron = craftBall('iron_block');
  panel.show('anvil'); select('enchant-target', `ball:${iron.id}`); tab('book');
  assert.equal(get('book-choices').hidden, false);
  panel.show('enchantingTable');
  assert.equal(get('enchant-target').value, `ball:${iron.id}`);
  assert.equal(get('station-tabs').hidden, true);
  assert.equal(get('book-choices').hidden, true);
  assert.equal(get('enchant-action-area').hidden, false);
  assert.match(get('enchant-action').textContent, /随机重洗/);
  panel.show('anvil');
  assert.equal(get('station-tabs').hidden, false);
  assert.match(get('enchant-action').textContent, /增加附魔/);
  assert.equal(game.state.xp, 60);
});
