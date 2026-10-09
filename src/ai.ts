import * as THREE from "three";
import type { Track } from "./track";
import { Car } from "./car";

export interface AICreateConfig {
  color: number;
  lane: number; // 行驶车道（相对中心线横向偏移）
  skill: number; // 0..1，速度系数
  startS: number; // 起始位置（浮点采样索引）
}

/** 沿赛道行驶的 AI 赛车（运动学模型） */
export class AICar {
  readonly car: Car;
  s: number;
  speed = 0;
  lap = 0;
  private readonly lane: number;
  private readonly skill: number;
  private readonly n: number;
  private collideCooldown = 0;

  constructor(track: Track, cfg: AICreateConfig) {
    this.car = new Car();
    this.car.setColor(cfg.color);
    this.lane = cfg.lane;
    this.skill = cfg.skill;
    this.s = cfg.startS;
    this.n = track.sampleCount;
    this.place(track, 0);
  }

  private place(track: Track, time: number): void {
    const sample = track.sampleAtFloat(this.s);
    // 车道轻微摆动，更像真实车手
    const wobble = Math.sin(this.s * 0.013 + time * 0.7) * 1.2;
    const lat = this.lane + wobble;
    this.car.group.position.set(
      sample.point.x + sample.normal.x * lat,
      0,
      sample.point.z + sample.normal.z * lat,
    );
    this.car.heading = Math.atan2(sample.tangent.x, sample.tangent.z);
    this.car.group.rotation.set(0, this.car.heading, 0);
  }

  update(dt: number, track: Track, running: boolean, time: number): void {
    const sample = track.sampleAtFloat(this.s);

    // 前方曲率决定弯道目标速度
    const lookahead = 14 + this.speed * 0.9;
    const ahead = track.sampleAtFloat(this.s + lookahead);
    const cross =
      sample.tangent.x * ahead.tangent.z - sample.tangent.z * ahead.tangent.x;
    const curvature = Math.abs(cross);
    const targetSpeed =
      this.car.maxSpeed * this.skill * (1 - Math.min(curvature * 2.4, 0.55));

    if (running) {
      if (this.speed < targetSpeed) {
        this.speed += 16 * dt;
      } else {
        this.speed -= 26 * dt;
      }
      this.speed = Math.max(0, this.speed);
    } else {
      this.speed = 0;
    }

    const prevS = this.s;
    const metersPerSample = track.totalLength / this.n;
    this.s += (this.speed / metersPerSample) * dt;
    if (Math.floor(this.s / this.n) > Math.floor(prevS / this.n)) {
      this.lap++;
    }

    this.place(track, time);
    this.car.spinWheels(this.speed, dt);
    this.collideCooldown = Math.max(0, this.collideCooldown - dt);
  }

  /** 检测与玩家碰撞（带冷却避免连续触发） */
  collideWith(playerPos: THREE.Vector3): boolean {
    if (this.collideCooldown > 0) return false;
    const d = this.car.group.position.distanceTo(playerPos);
    if (d < 2.4) {
      this.collideCooldown = 0.5;
      return true;
    }
    return false;
  }

  /** 总进度（与玩家 progressS 同单位：采样索引） */
  get totalProgress(): number {
    return this.lap * this.n + this.s;
  }
}
