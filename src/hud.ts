import type { Track } from "./track";

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

const SWATCH_COLORS = [0xe63329, 0x2b7de6, 0xf2c94c, 0x27c07a, 0xb04de6, 0xf2f2f2];

export class HUD {
  onStart: () => void = () => {};
  onRestart: () => void = () => {};
  onResume: () => void = () => {};
  onQuit: () => void = () => {};
  onColorPicked: (color: number) => void = () => {};

  private hudEl: HTMLElement;
  private speedEl: HTMLElement;
  private lapEl: HTMLElement;
  private positionEl: HTMLElement;
  private raceTimeEl: HTMLElement;
  private lastLapEl: HTMLElement;
  private bestLapEl: HTMLElement;
  private messageEl: HTMLElement;
  private wrongWayEl: HTMLElement;
  private countdownEl: HTMLElement;
  private vignetteEl: HTMLElement;
  private menuEl: HTMLElement;
  private finishEl: HTMLElement;
  private pauseEl: HTMLElement;
  private finalStatsEl: HTMLElement;
  private finalDriftEl: HTMLElement;
  private scoreEl: HTMLElement;
  private comboEl: HTMLElement;
  private nitroBoxEl: HTMLElement;
  private nitroFillEl: HTMLElement;
  private minimap: HTMLCanvasElement;
  private mmCtx: CanvasRenderingContext2D;
  private mapPoints: Array<[number, number]> = [];
  private mapScale = 1;
  private mapCenterX = 0;
  private mapCenterZ = 0;
  private msgTimer = 0;

  constructor(track: Track) {
    const $ = (id: string) => document.getElementById(id)!;
    this.hudEl = $("hud");
    this.speedEl = $("speed");
    this.lapEl = $("lap");
    this.positionEl = $("position");
    this.raceTimeEl = $("race-time");
    this.lastLapEl = $("last-lap");
    this.bestLapEl = $("best-lap");
    this.messageEl = $("message");
    this.wrongWayEl = $("wrong-way");
    this.countdownEl = $("countdown");
    this.vignetteEl = $("speed-vignette");
    this.menuEl = $("menu");
    this.finishEl = $("finish");
    this.pauseEl = $("pause");
    this.finalStatsEl = $("final-stats");
    this.finalDriftEl = $("final-drift");
    this.scoreEl = $("score");
    this.comboEl = $("combo");
    this.nitroBoxEl = $("nitro-box");
    this.nitroFillEl = $("nitro-fill");
    this.minimap = $("minimap") as HTMLCanvasElement;
    this.mmCtx = this.minimap.getContext("2d")!;

    // 小地图：计算赛道包围盒并缩放
    const pts = track.samples;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of pts) {
      minX = Math.min(minX, s.point.x);
      maxX = Math.max(maxX, s.point.x);
      minZ = Math.min(minZ, s.point.z);
      maxZ = Math.max(maxZ, s.point.z);
    }
    this.mapCenterX = (minX + maxX) / 2;
    this.mapCenterZ = (minZ + maxZ) / 2;
    const pad = 18;
    const W = this.minimap.width;
    const H = this.minimap.height;
    this.mapScale = Math.min(
      (W - pad * 2) / (maxX - minX),
      (H - pad * 2) / (maxZ - minZ),
    );
    for (const s of pts) {
      this.mapPoints.push([this.toMapX(s.point.x), this.toMapY(s.point.z)]);
    }

    // 颜色选择
    const row = $("color-row");
    SWATCH_COLORS.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "swatch" + (i === 0 ? " selected" : "");
      b.style.background = "#" + c.toString(16).padStart(6, "0");
      b.title = "赛车颜色";
      b.addEventListener("click", () => {
        row.querySelectorAll(".swatch").forEach((el) => el.classList.remove("selected"));
        b.classList.add("selected");
        this.onColorPicked(c);
      });
      row.appendChild(b);
    });

    $("start-btn").addEventListener("click", () => this.onStart());
    $("restart-btn").addEventListener("click", () => this.onRestart());
    $("resume-btn").addEventListener("click", () => this.onResume());
    $("quit-btn").addEventListener("click", () => this.onQuit());
  }

  private toMapX(x: number): number {
    return (x - this.mapCenterX) * this.mapScale + this.minimap.width / 2;
  }

  private toMapY(z: number): number {
    return (z - this.mapCenterZ) * this.mapScale + this.minimap.height / 2;
  }

  setSpeed(kmh: number): void {
    this.speedEl.textContent = String(Math.round(kmh));
  }

  setLap(cur: number, total: number): void {
    this.lapEl.textContent = `第 ${Math.min(cur, total)} / ${total} 圈`;
  }

  setPosition(rank: number, total: number): void {
    this.positionEl.textContent = `第 ${rank} / ${total} 名`;
  }

  setScore(score: number, combo: number): void {
    this.scoreEl.textContent = String(Math.round(score));
    if (combo >= 1.5) {
      const text = `x${combo.toFixed(1)}`;
      if (this.comboEl.textContent !== text) {
        this.comboEl.textContent = text;
        this.comboEl.classList.remove("hidden");
        // 重启动画
        this.comboEl.style.animation = "none";
        void this.comboEl.offsetWidth;
        this.comboEl.style.animation = "";
      }
    } else {
      this.comboEl.classList.add("hidden");
    }
  }

  setNitro(ratio: number, active: boolean): void {
    this.nitroFillEl.style.width = `${Math.round(ratio * 100)}%`;
    this.nitroBoxEl.classList.toggle("full", ratio >= 0.999);
    this.nitroBoxEl.classList.toggle("active", active);
  }

  setTime(t: number): void {
    this.raceTimeEl.textContent = formatTime(t);
  }

  setLapTimes(last: number | null, best: number | null): void {
    this.lastLapEl.textContent = last === null ? "--:--.-" : formatTime(last);
    this.bestLapEl.textContent = best === null ? "--:--.-" : formatTime(best);
  }

  setVignette(opacity: number): void {
    this.vignetteEl.style.opacity = opacity.toFixed(3);
  }

  showMessage(text: string, duration = 1500): void {
    this.messageEl.textContent = text;
    this.messageEl.classList.remove("hidden");
    // 重启动画
    this.messageEl.style.animation = "none";
    void this.messageEl.offsetWidth;
    this.messageEl.style.animation = "";
    window.clearTimeout(this.msgTimer);
    this.msgTimer = window.setTimeout(() => {
      this.messageEl.classList.add("hidden");
    }, duration);
  }

  wrongWay(active: boolean): void {
    this.wrongWayEl.classList.toggle("hidden", !active);
  }

  setCountdown(text: string | null): void {
    if (text === null) {
      this.countdownEl.classList.add("hidden");
      return;
    }
    this.countdownEl.textContent = text;
    this.countdownEl.classList.remove("hidden");
    this.countdownEl.style.animation = "none";
    void this.countdownEl.offsetWidth;
    this.countdownEl.style.animation = "";
  }

  drawMinimap(pos: { x: number; z: number }, heading: number): void {
    const ctx = this.mmCtx;
    const W = this.minimap.width;
    const H = this.minimap.height;
    ctx.clearRect(0, 0, W, H);

    // 赛道
    ctx.beginPath();
    this.mapPoints.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // 起跑点
    const start = this.mapPoints[0];
    ctx.fillStyle = "#3ddc74";
    ctx.beginPath();
    ctx.arc(start[0], start[1], 4, 0, Math.PI * 2);
    ctx.fill();

    // 赛车
    const cx = this.toMapX(pos.x);
    const cy = this.toMapY(pos.z);
    ctx.strokeStyle = "#ff5252";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(heading) * 11, cy + Math.cos(heading) * 11);
    ctx.stroke();
    ctx.fillStyle = "#ff5252";
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  showHUD(): void {
    this.hudEl.classList.remove("hidden");
  }

  hideHUD(): void {
    this.hudEl.classList.add("hidden");
  }

  hideOverlays(): void {
    this.menuEl.classList.add("hidden");
    this.finishEl.classList.add("hidden");
    this.pauseEl.classList.add("hidden");
  }

  showMenu(): void {
    this.hideOverlays();
    this.hideHUD();
    this.menuEl.classList.remove("hidden");
  }

  showFinish(
    totalTime: number,
    bestLap: number | null,
    rank: number,
    racers: number,
    driftScore: number,
  ): void {
    this.finalStatsEl.innerHTML =
      `总用时 <b>${formatTime(totalTime)}</b><br>` +
      `最快单圈 <b>${bestLap === null ? "--:--.-" : formatTime(bestLap)}</b><br>` +
      `最终排名 <b>第 ${rank} / ${racers} 名</b>`;
    this.finalDriftEl.textContent = `漂移总分 ${Math.round(driftScore)}`;
    this.hideOverlays();
    this.finishEl.classList.remove("hidden");
  }

  showPause(): void {
    this.pauseEl.classList.remove("hidden");
  }
}
