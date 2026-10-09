import * as THREE from "three";

export interface GhostFrame {
  t: number;
  x: number;
  z: number;
  h: number;
}

const FRAME_INTERVAL = 0.05; // 20 Hz 采样
const STORAGE_KEY = "turbo-circuit-best-ghost";

/** 记录每一圈的行驶轨迹 */
export class GhostRecorder {
  frames: GhostFrame[] = [];
  private lastT = -1;

  start(): void {
    this.frames = [];
    this.lastT = -1;
  }

  record(t: number, x: number, z: number, h: number): void {
    if (this.lastT >= 0 && t - this.lastT < FRAME_INTERVAL) return;
    this.frames.push({ t, x, z, h });
    this.lastT = t;
  }

  finish(): GhostFrame[] | null {
    return this.frames.length > 10 ? this.frames : null;
  }
}

function serializeGhost(frames: GhostFrame[]): string {
  const a: number[] = [];
  for (const f of frames) {
    a.push(
      Math.round(f.t * 100) / 100,
      Math.round(f.x * 100) / 100,
      Math.round(f.z * 100) / 100,
      Math.round(f.h * 1000) / 1000,
    );
  }
  return JSON.stringify(a);
}

function deserializeGhost(json: string): GhostFrame[] | null {
  try {
    const a = JSON.parse(json) as number[];
    if (!Array.isArray(a) || a.length < 40 || a.length % 4 !== 0) return null;
    const frames: GhostFrame[] = [];
    for (let i = 0; i < a.length; i += 4) {
      frames.push({ t: a[i], x: a[i + 1], z: a[i + 2], h: a[i + 3] });
    }
    return frames;
  } catch {
    return null;
  }
}

export function saveGhost(frames: GhostFrame[], lapTime: number): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ lapTime, data: serializeGhost(frames) }),
    );
  } catch {
    /* 存储不可用时忽略 */
  }
}

export function loadGhost(): { lapTime: number; frames: GhostFrame[] } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as { lapTime: number; data: string };
    const frames = deserializeGhost(obj.data);
    if (!frames) return null;
    return { lapTime: obj.lapTime, frames };
  } catch {
    return null;
  }
}

function shortAngle(a: number, b: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** 半透明幽灵车（最佳圈速回放） */
export class GhostCar {
  readonly group = new THREE.Group();
  private mat: THREE.MeshBasicMaterial;

  constructor() {
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x35d5ff,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 4.3), this.mat);
    body.position.y = 0.55;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.1), this.mat);
    cabin.position.set(0, 1.02, -0.25);
    this.group.add(body, cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.34, 10);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [x, z] of [
      [-0.88, 1.42],
      [0.88, 1.42],
      [-0.88, -1.42],
      [0.88, -1.42],
    ]) {
      const w = new THREE.Mesh(wheelGeo, this.mat);
      w.position.set(x, 0.37, z);
      this.group.add(w);
    }

    this.group.visible = false;
  }

  /** 按时间采样幽灵帧（二分查找 + 线性插值） */
  private sample(
    frames: GhostFrame[],
    t: number,
  ): { x: number; z: number; h: number } | null {
    if (frames.length === 0 || t < 0) return null;
    const last = frames[frames.length - 1];
    if (t > last.t) return null;
    let lo = 0;
    let hi = frames.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].t < t) lo = mid + 1;
      else hi = mid;
    }
    const i1 = Math.max(1, lo);
    const f0 = frames[i1 - 1];
    const f1 = frames[i1];
    const span = f1.t - f0.t;
    const f = span > 0 ? (t - f0.t) / span : 0;
    return {
      x: f0.x + (f1.x - f0.x) * f,
      z: f0.z + (f1.z - f0.z) * f,
      h: f0.h + shortAngle(f0.h, f1.h) * f,
    };
  }

  update(frames: GhostFrame[] | null, t: number): void {
    if (!frames) {
      this.group.visible = false;
      return;
    }
    const s = this.sample(frames, t);
    if (!s) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.group.position.set(s.x, 0, s.z);
    this.group.rotation.y = s.h;
  }
}
