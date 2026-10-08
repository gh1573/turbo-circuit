/** 程序化引擎音效（WebAudio，无需外部资源） */
export class EngineAudio {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private gain: GainNode | null = null;
  private muted = false;

  /** 必须在用户手势中调用 */
  start(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();

    this.osc = this.ctx.createOscillator();
    this.osc.type = "sawtooth";
    this.osc2 = this.ctx.createOscillator();
    this.osc2.type = "square";

    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 500;
    this.filter.Q.value = 2;

    this.gain = this.ctx.createGain();
    this.gain.gain.value = 0;

    this.osc.connect(this.filter);
    this.osc2.connect(this.filter);
    this.filter.connect(this.gain);
    this.gain.connect(this.ctx.destination);

    this.osc.start();
    this.osc2.start();
  }

  setSpeed(ratio: number, slip: number): void {
    if (!this.ctx || !this.osc || !this.osc2 || !this.filter || !this.gain) return;
    const t = this.ctx.currentTime;
    const base = 55 + ratio * 210 + Math.abs(slip) * 30;
    this.osc.frequency.setTargetAtTime(base, t, 0.05);
    this.osc2.frequency.setTargetAtTime(base * 0.5 + 3, t, 0.05);
    this.filter.frequency.setTargetAtTime(300 + ratio * 2200, t, 0.08);
    const targetGain = this.muted ? 0 : 0.05 + ratio * 0.035;
    this.gain.gain.setTargetAtTime(targetGain, t, 0.1);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  stop(): void {
    if (this.gain && this.ctx) {
      this.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }
}
