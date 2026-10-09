import * as THREE from "three";

export interface CarInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  handbrake: boolean;
  offTrack: boolean;
  nitro: boolean;
}

export interface CarState {
  slip: number; // 滑移角（弧度），用于漂移烟与音效
  speed: number;
}

const MAX_SPEED = 44; // m/s ≈ 158 km/h
const NITRO_BOOST = 12; // 氮气极速增量
const NITRO_ACCEL = 20; // 氮气加速增量
const ACCEL = 21;
const BRAKE_DECEL = 40;
const REVERSE_MAX = -9;

export class Car {
  readonly group = new THREE.Group();
  readonly maxSpeed = MAX_SPEED;

  heading = 0;
  speed = 0;
  readonly velocity = new THREE.Vector3();

  private steerAngle = 0;
  private paint: THREE.MeshStandardMaterial;
  private wheels: Array<{ pivot: THREE.Group; spin: THREE.Mesh }> = [];
  private flames: THREE.Mesh[] = [];
  private flameMat!: THREE.MeshBasicMaterial;

  constructor() {
    this.paint = new THREE.MeshStandardMaterial({
      color: 0xe63329,
      roughness: 0.32,
      metalness: 0.65,
    });
    this.build();
  }

  setColor(color: number): void {
    this.paint.color.set(color);
  }

  private build(): void {
    const g = this.group;

    const plastic = new THREE.MeshStandardMaterial({
      color: 0x14171c,
      roughness: 0.7,
      metalness: 0.2,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x0d1620,
      roughness: 0.08,
      metalness: 0.9,
    });

    // 主车身
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 4.3), this.paint);
    body.position.y = 0.55;
    g.add(body);

    // 车头
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.32, 0.9), this.paint);
    nose.position.set(0, 0.44, 2.4);
    g.add(nose);

    // 座舱
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.1), glass);
    cabin.position.set(0, 1.02, -0.25);
    g.add(cabin);

    // 尾翼
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.08, 0.5), this.paint);
    wing.position.set(0, 1.18, -2.05);
    g.add(wing);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.3), plastic);
      strut.position.set(side * 0.7, 0.98, -2.05);
      g.add(strut);
    }

    // 前包围
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.1, 0.5), plastic);
    splitter.position.set(0, 0.24, 2.6);
    g.add(splitter);

    // 车灯
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff6d8,
      emissiveIntensity: 2.4,
    });
    for (const side of [-1, 1]) {
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.13, 0.08), headMat);
      head.position.set(side * 0.62, 0.6, 2.82);
      g.add(head);
    }
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x550000,
      emissive: 0xff1a1a,
      emissiveIntensity: 1.8,
    });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.08), tailMat);
    tail.position.set(0, 0.72, -2.17);
    g.add(tail);

    // 氮气尾焰
    this.flameMat = new THREE.MeshBasicMaterial({
      color: 0x66d9ff,
      transparent: true,
      opacity: 0.85,
    });
    const flameGeo = new THREE.ConeGeometry(0.1, 0.55, 8);
    flameGeo.rotateX(-Math.PI / 2); // 朝后 (-z)
    for (const side of [-1, 1]) {
      const flame = new THREE.Mesh(flameGeo, this.flameMat);
      flame.position.set(side * 0.5, 0.48, -2.3);
      flame.visible = false;
      g.add(flame);
      this.flames.push(flame);
    }

    // 车轮
    const tireGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.34, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.9 });
    const rimGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.36, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0xb9c2cc,
      roughness: 0.25,
      metalness: 0.9,
    });

    const wheelPos: Array<[number, number, boolean]> = [
      [-0.88, 1.42, true],
      [0.88, 1.42, true],
      [-0.88, -1.42, false],
      [0.88, -1.42, false],
    ];
    for (const [x, z, front] of wheelPos) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.37, z);
      const spin = new THREE.Mesh(tireGeo, tireMat);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      spin.add(rim);
      pivot.add(spin);
      g.add(pivot);
      this.wheels.push({ pivot, spin });
      void front;
    }

    g.traverse((o) => {
      if (o instanceof THREE.Mesh) o.castShadow = true;
    });
  }

  /** 氮气尾焰视觉开关（AI/外部调用） */
  setNitroVisual(on: boolean): void {
    for (const f of this.flames) f.visible = on;
  }

  /** AI 用：只滚动车轮 */
  spinWheels(speed: number, dt: number): void {
    const spinDelta = (speed / 0.37) * dt;
    for (const w of this.wheels) w.spin.rotation.x += spinDelta;
  }

  /**
   * 街机式车辆物理。
   * 速度标量 + 速度向量混合：转向改变车头方向，速度向量以 gri p 向期望速度收敛，
   * 手刹时 grip 降低产生漂移。
   */
  update(dt: number, input: CarInput): CarState {
    const speedRatio = Math.min(Math.abs(this.speed) / MAX_SPEED, 1);

    // 转向：高速时转角减小
    const steerTarget = input.steer * (0.62 - 0.44 * speedRatio);
    this.steerAngle += (steerTarget - this.steerAngle) * Math.min(1, dt * 9);

    // 纵向动力（氮气提升加速与极速）
    const nitro = input.nitro;
    if (input.throttle > 0) {
      this.speed +=
        input.throttle * (ACCEL + (nitro ? NITRO_ACCEL : 0)) * dt;
    }
    if (input.brake > 0) {
      if (this.speed > 0.6) {
        this.speed -= input.brake * BRAKE_DECEL * dt;
      } else {
        this.speed -= input.brake * 16 * dt; // 倒车
      }
    }
    // 阻力
    this.speed -= this.speed * 0.32 * dt;
    // 草地额外阻力
    if (input.offTrack) {
      this.speed -= this.speed * 1.9 * dt;
    }

    const currentMax = nitro ? MAX_SPEED + NITRO_BOOST : MAX_SPEED;
    this.speed = THREE.MathUtils.clamp(this.speed, REVERSE_MAX, currentMax);
    if (input.throttle === 0 && input.brake === 0 && Math.abs(this.speed) < 0.25) {
      this.speed = 0;
    }

    // 转向速率与速度挂钩
    if (Math.abs(this.speed) > 0.05) {
      this.heading += this.steerAngle * this.speed * 0.105 * dt;
    }

    const forward = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const desired = forward.clone().multiplyScalar(this.speed);
    const grip = input.handbrake ? 2.0 : 7.5;
    this.velocity.lerp(desired, 1 - Math.exp(-grip * dt));

    this.group.position.addScaledVector(this.velocity, dt);
    this.group.rotation.y = this.heading;

    // 车身侧倾
    const lean = -this.steerAngle * speedRatio * 0.09;
    this.group.rotation.z += (lean - this.group.rotation.z) * Math.min(1, dt * 8);

    // 车轮
    const spinDelta = (this.speed / 0.37) * dt;
    for (let i = 0; i < this.wheels.length; i++) {
      const w = this.wheels[i];
      w.spin.rotation.x += spinDelta;
      if (i < 2) w.pivot.rotation.y = this.steerAngle;
    }

    // 尾焰闪烁
    if (nitro) {
      for (const f of this.flames) {
        f.scale.set(1, 1, 0.7 + Math.random() * 0.8);
      }
    }

    // 滑移角
    let slip = 0;
    const v = this.velocity.length();
    if (v > 3) {
      const vx = this.velocity.x / v;
      const vz = this.velocity.z / v;
      const dot = vx * forward.x + vz * forward.z;
      const cross = forward.z * vx - forward.x * vz;
      slip = Math.atan2(cross, dot);
    }

    return { slip, speed: this.speed };
  }
}
