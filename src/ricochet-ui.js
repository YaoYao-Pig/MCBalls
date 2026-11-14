import { describeRicochet, describeCatch, UPGRADES } from './core.js';

const traitNames = { iron: '铁质重击', storm: '连锁闪电', frost: '寒冰减速', gold: '黄金诱饵', slime: '粘液弹性' };

export function ricochetPresentation(ball) {
  const chain = describeRicochet(ball);
  const caught=describeCatch(ball),multiplier=chain.multiplier*caught.multiplier;
  const count = Math.max(0, chain.count || 0);
  const members = chain.participants.length;
  const effects = chain.traits.map(id => traitNames[id] || id);
  if(chain.baseBonus>0)effects.push(`信标蓄能 +${Math.round(chain.baseBonus*100)}%`);
  if(caught.active)effects.push(`运动接球 +${Math.round(caught.damageBonus*100)}% · ${caught.streak} 连段`);
  if(chain.fireTimer>0)effects.push('传递燃烧');
  for (const [id, level] of Object.entries(chain.enchantments)) {
    const name = UPGRADES.find(upgrade => upgrade.id === id)?.name || id;
    effects.push(`${name} ${level}`);
  }
  return {
    ...chain,
    visible: (chain.active && count > 0)||caught.active,
    heading: `${count>0?`弹射 ${count} 次`:'运动接球'} · 伤害 ×${multiplier.toFixed(2)}`,
    detail: members > 1 ? `${members} 块连锁 · 临时共享效果` : caught.active?'接球加成生效 · 本次运动有效':'继续反弹，累积本轮伤害',
    effects: effects.join(' / '),
    hint: '停下、重新出杆或召回后结束本轮；永久融合与附魔保留。',
  };
}

export function updateRicochetPanel(element, ball, visible = true) {
  const view = ricochetPresentation(ball);
  element.hidden = !visible || !view.visible;
  if (element.hidden) return view;
  element.querySelector('[data-ricochet-heading]').textContent = view.heading;
  element.querySelector('[data-ricochet-detail]').textContent = view.detail;
  element.querySelector('[data-ricochet-effects]').textContent = view.effects;
  element.title = `${view.effects ? `${view.effects}。` : ''}${view.hint}`;
  element.dataset.linked = String(view.participants.length > 1);
  return view;
}
