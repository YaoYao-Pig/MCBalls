/** Reconcile the synchronous waveStart -> weatherChange events from Game.
 * Only the description is amended; showing the banner and starting its timer
 * happen once. A later independent weather event is never absorbed here. */
export class WaveAnnouncement {
  constructor({ show, updateDescription, stageNames = {}, weatherNames = {}, enqueue = callback => queueMicrotask(callback) }) {
    this.show = show;
    this.updateDescription = updateDescription;
    this.stageNames = stageNames;
    this.weatherNames = weatherNames;
    this.enqueue = enqueue;
    this.pending = null;
  }

  clear() { this.pending = null; }

  description(notice, weather) {
    return `新出现怪物与护盾 +${Math.round(notice.percent)}% · ${this.weatherNames[weather] || weather}`;
  }

  showWave(event, weather) {
    if (!(event.stageWave > 1)) { this.clear(); return false; }
    const notice = { stage: event.stage, percent: event.percent };
    this.pending = notice;
    this.show(
      `${this.stageNames[event.stage] || event.stage} · 第 ${event.stageWave} 波`,
      `怪物生命 ×${event.hpMultiplier.toFixed(2)}`,
      this.description(notice, weather),
    );
    this.enqueue(() => { if (this.pending === notice) this.clear(); });
    return true;
  }

  updateWeather(stage, weather) {
    if (!this.pending || this.pending.stage !== stage) return false;
    this.updateDescription(this.description(this.pending, weather));
    return true;
  }
}
