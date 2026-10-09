import * as THREE from "three";
import { Track } from "./track";
import { Car, type CarInput } from "./car";
import { Input } from "./input";
import { HUD } from "./hud";
import { EngineAudio } from "./audio";
import { SmokeSystem } from "./particles";
import { buildSky, buildGround, buildTrees, setupLighting } from "./env";
import {
  GhostCar,
  GhostRecorder,
  loadGhost,
  saveGhost,
  type GhostFrame,
} from "./ghost";
import { AICar } from "./ai";

type State = "menu" | "countdown" | "racing" | "finished";

const EMPTY_INPUT: CarInput = {
  throttle: 0,
  brake: 0,
  steer: 0,
  handbrake: false,
  offTrack: false,
  nitro: false,
};

const AI_COUNT = 3;
const PICKUP_COUNT = 8;

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private track: Track;
  private car: Car;
  private input: Input;
  private hud: HUD;
  private audio = new EngineAudio();
  private smoke: SmokeSystem;
  private sun: THREE.DirectionalLight;

  private state: State = "menu";
  private paused = false;
  private countdownT = 0;
  private lastCountdownShown = -1;

  private raceTime = 0;
  private lapStart = 0;
  private lap = 1;
  private readonly totalLaps = 3;
  private lastLap: number | null = null;
  private bestLap: number | null = null;

  private progressS = 0;
  private lastIdx = 0;
  private backwardAccum = 0;
  private lastSlip = 0;

  // 新功能状态
  private score = 0;
  private combo = 1;
  private driftTime = 0;
  private driftGrace = 0;
  private nitro = 60;
  private nitroActive = false;
  private playerRank = AI_COUNT + 1;
  private readonly ais: AICar[] = [];
  private readonly ghostRecorder = new GhostRecorder();
  private readonly ghostCar = new GhostCar();
  private bestGhostFrames: GhostFrame[] | null = null;
  private readonly nitroPickups: Array<{
    mesh: THREE.Mesh;
    baseY: number;
    phase: number;
    respawn: number;
  }> = [];

  private menuAngle = 0;
  private shakeT = 0;
  private smokeAcc = 0;

  private lookTarget = new THREE.Vector3(0, 0, 0);
  private tmpVec = new THREE.Vector3();
  private tmpVec2 = new THREE.Vector3();

  constructor() {
    const host = document.getElementById("app")!;
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    host.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      62,
      window.innerWidth / window.innerHeight,
      0.1,
      1600,
    );
    this.camera.position.set(0, 62, 150);

    this.scene.fog = new THREE.Fog(0xcfe0ee, 200, 640);
    this.scene.add(buildSky());
    this.scene.add(buildGround());

    this.track = new Track();
    this.scene.add(this.track.buildRoad());
    this.scene.add(this.track.buildCurbs());
    this.scene.add(this.track.buildWalls());
    this.scene.add(this.track.buildStartLine());
    this.scene.add(this.track.buildGantry());
    this.scene.add(buildTrees(this.track));

    this.sun = setupLighting(this.scene, this.renderer);

    this.car = new Car();
    this.scene.add(this.car.group);

    this.smoke = new SmokeSystem(this.scene);

    // 幽灵车
    this.scene.add(this.ghostCar.group);
    const stored = loadGhost();
    if (stored) {
      this.bestGhostFrames = stored.frames;
      this.bestLap = stored.lapTime;
    }

    // AI 对手（起始位置在 startRace 中按玩家位置刷新）
    const aiColors = [0x2b7de6, 0xf2c94c, 0x27c07a];
    const aiLanes = [-2.5, 0, 2.5];
    const aiSkills = [0.88, 0.84, 0.8];
    for (let i = 0; i < AI_COUNT; i++) {
      const ai = new AICar(this.track, {
        color: aiColors[i],
        lane: aiLanes[i],
        skill: aiSkills[i],
        startS: -60 - i * 22,
      });
      this.ais.push(ai);
      this.scene.add(ai.car.group);
    }

    // 氮气补给点
    const pickupGeo = new THREE.OctahedronGeometry(0.45);
    const pickupMat = new THREE.MeshStandardMaterial({
      color: 0x35d5ff,
      emissive: 0x1a8fff,
      emissiveIntensity: 1.6,
      roughness: 0.3,
      metalness: 0.4,
    });
    for (let i = 0; i < PICKUP_COUNT; i++) {
      const s = 60 + (i * this.track.sampleCount) / PICKUP_COUNT;
      const sample = this.track.sampleAtFloat(s);
      const mesh = new THREE.Mesh(pickupGeo, pickupMat);
      mesh.position.set(sample.point.x, 1, sample.point.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.nitroPickups.push({
        mesh,
        baseY: 1,
        phase: Math.random() * Math.PI * 2,
        respawn: 0,
      });
    }

    this.input = new Input();
    this.input.bindTouch();
    this.hud = new HUD(this.track);
    this.bindUI();

    this.resetCarToTrack(-8);

    window.addEventListener("resize", this.onResize);

    if (this.input.isTouch) {
      document.getElementById("touch-controls")?.classList.remove("hidden");
    }

    // 避免按钮点击后保留焦点，导致空格/回车误触发
    window.addEventListener("click", (e) => {
      if (e.target instanceof HTMLElement && e.target.tagName === "BUTTON") {
        e.target.blur();
      }
    });

    this.renderer.setAnimationLoop(this.loop);
  }

  private bindUI(): void {
    this.hud.onStart = () => this.startRace();
    this.hud.onRestart = () => this.startRace();
    this.hud.onResume = () => {
      this.paused = false;
      this.hud.hideOverlays();
    };
    this.hud.onQuit = () => {
      this.paused = false;
      this.state = "menu";
      this.audio.stop();
      this.hud.showMenu();
    };
    this.hud.onColorPicked = (c) => this.car.setColor(c);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private loop = (): void => {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.handleGlobalInput();
    if (!this.paused) this.update(dt, rawDt);
    this.renderer.render(this.scene, this.camera);
  };

  private handleGlobalInput(): void {
    if (this.input.consumeMute()) {
      const muted = this.audio.toggleMute();
      this.hud.showMessage(muted ? "已静音" : "声音开启", 900);
    }
    if (this.input.consumePause()) {
      if (this.state === "racing" || this.state === "countdown") {
        this.paused = !this.paused;
        if (this.paused) {
          this.hud.showPause();
          this.audio.stop();
        } else {
          this.hud.hideOverlays();
        }
      }
    }
    if (this.input.consumeStart()) {
      if (this.state === "menu" || this.state === "finished") {
        this.startRace();
      }
    }
  }

  private startRace(): void {
    this.audio.start();
    this.resetCarToTrack(-8);
    this.state = "countdown";
    this.paused = false;
    this.countdownT = 3.0;
    this.lastCountdownShown = -1;
    this.raceTime = 0;
    this.lapStart = 0;
    this.lap = 1;
    this.lastLap = null;
    // bestLap 保留（可能是 localStorage 中的历史最佳，作为幽灵车基准）
    this.backwardAccum = 0;

    // 漂移计分 / 氮气
    this.score = 0;
    this.combo = 1;
    this.driftTime = 0;
    this.driftGrace = 0;
    this.nitro = 60;
    this.nitroActive = false;
    this.playerRank = AI_COUNT + 1;

    // AI 发车位置：玩家前方 25~65 米
    const playerS = this.progressS;
    for (let i = 0; i < this.ais.length; i++) {
      const ai = this.ais[i];
      ai.s = playerS + 25 + i * 20;
      ai.speed = 0;
      ai.lap = 0;
      ai.update(0, this.track, false, 0);
    }

    // 氮气补给点复位
    for (const p of this.nitroPickups) {
      p.respawn = 0;
      p.mesh.visible = true;
    }

    // 幽灵车从本圈开始记录
    this.ghostRecorder.start();
    this.car.setNitroVisual(false);

    this.hud.hideOverlays();
    this.hud.showHUD();
  }

  private resetCarToTrack(offsetIdx = 0): void {
    const n = this.track.sampleCount;
    const idx = this.track.nearestIndex(this.car.group.position, this.lastIdx);
    const target = (((idx + offsetIdx) % n) + n) % n;
    const s = this.track.sampleAtFloat(target);
    this.car.group.position.set(s.point.x, 0, s.point.z);
    this.car.heading = Math.atan2(s.tangent.x, s.tangent.z);
    this.car.speed = 0;
    this.car.velocity.set(0, 0, 0);
    this.car.group.rotation.set(0, this.car.heading, 0);
    this.lastIdx = target;
    this.progressS = target;
  }

  private update(dt: number, rawDt: number): void {
    switch (this.state) {
      case "menu":
        this.updateMenuCamera(dt);
        this.ghostCar.update(null, -1);
        this.updatePickups(dt, false);
        break;
      case "countdown": {
        this.updateCar(dt, true);
        this.updateCamera(dt);
        this.updateAISimple(dt, false);
        this.updatePickups(dt, false);
        // 倒计时使用未钳制时间，保证低帧率设备上也能按时开始
        this.countdownT -= Math.min(rawDt, 0.25);
        const n = Math.ceil(this.countdownT);
        if (n !== this.lastCountdownShown && n > 0) {
          this.lastCountdownShown = n;
          this.hud.setCountdown(String(n));
        }
        if (this.countdownT <= 0) {
          this.state = "racing";
          this.hud.setCountdown(null);
          this.hud.showMessage("GO!", 900);
          this.raceTime = 0;
          this.lapStart = 0;
        }
        break;
      }
      case "racing":
        this.raceTime += dt;
        if (this.input.consumeReset()) {
          this.resetCarToTrack(0);
          this.hud.showMessage("已重置", 900);
        }
        this.updateCar(dt, false);
        this.updateCamera(dt);
        this.updateAISimple(dt, true);
        this.updatePickups(dt, true);
        break;
      case "finished":
        this.updateCar(dt, true); // 惯性滑行
        this.updateCamera(dt);
        this.updateAISimple(dt, true);
        this.updatePickups(dt, false);
        break;
    }

    this.smoke.update(dt);
    this.updateHUD();
    if (this.state === "racing" || this.state === "countdown") {
      this.audio.setSpeed(
        Math.abs(this.car.speed) / this.car.maxSpeed + (this.nitroActive ? 0.12 : 0),
        this.lastSlip,
      );
    }
  }

  /** AI 更新 + 玩家碰撞 + 名次计算 */
  private updateAISimple(dt: number, running: boolean): void {
    const now = performance.now() / 1000;
    for (const ai of this.ais) {
      ai.update(dt, this.track, running, now);

      if (running && ai.collideWith(this.car.group.position)) {
        const delta = this.car.group.position.clone().sub(ai.car.group.position);
        delta.y = 0;
        const d = delta.length() || 1;
        delta.normalize();
        this.car.group.position.addScaledVector(delta, 2.4 - d + 0.1);
        this.car.speed *= 0.85;
        this.car.velocity.multiplyScalar(0.85);
        ai.speed *= 0.9;
        if (this.car.speed > 6) this.shakeT = 0.25;
      }
    }

    // 名次：比较总进度（采样索引单位）
    let rank = 1;
    for (const ai of this.ais) {
      if (ai.totalProgress > this.progressS) rank++;
    }
    this.playerRank = rank;
  }

  /** 氮气补给点动画与拾取 */
  private updatePickups(dt: number, collectible: boolean): void {
    const now = performance.now() / 1000;
    const carPos = this.car.group.position;
    for (const p of this.nitroPickups) {
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0) p.mesh.visible = true;
        continue;
      }
      p.mesh.rotation.y += dt * 2.2;
      p.mesh.position.y = p.baseY + Math.sin(now * 2.4 + p.phase) * 0.18;
      if (
        collectible &&
        carPos.distanceToSquared(p.mesh.position) < 6.25
      ) {
        p.mesh.visible = false;
        p.respawn = 8;
        this.nitro = Math.min(100, this.nitro + 40);
        this.hud.showMessage("氮气 +40", 700);
      }
    }
  }

  private updateCar(dt: number, locked: boolean): void {
    const pos = this.car.group.position;
    const idx = this.track.nearestIndex(pos, this.lastIdx);
    const lat = this.track.lateralOffset(pos, idx);
    const offTrack = Math.abs(lat) > this.track.halfWidth;

    // 氮气：漂移充能 + 缓慢回充，Shift / 触屏按钮消耗
    const driftingNow = Math.abs(this.lastSlip) > 0.2 && this.car.speed > 10;
    if (driftingNow) {
      this.nitro = Math.min(100, this.nitro + 22 * dt);
    }
    this.nitro = Math.min(100, this.nitro + 3 * dt);
    const wantNitro = !locked && this.input.nitro;
    this.nitroActive = wantNitro && this.nitro > 0;
    if (this.nitroActive) {
      this.nitro = Math.max(0, this.nitro - 38 * dt);
    }
    this.car.setNitroVisual(this.nitroActive);

    let input = EMPTY_INPUT;
    if (!locked) {
      input = {
        throttle: this.input.throttle,
        brake: this.input.brake,
        steer: this.input.steer,
        handbrake: this.input.handbrake,
        offTrack,
        nitro: this.nitroActive,
      };
    } else {
      input = { ...EMPTY_INPUT, offTrack };
    }

    const st = this.car.update(dt, input);
    this.lastSlip = st.slip;

    // 漂移计分（连击倍率：持续漂移最高 x5，1.2 秒不漂移则清零）
    const drifting = Math.abs(st.slip) > 0.2 && this.car.speed > 10;
    if (drifting) {
      this.driftTime += dt;
      this.driftGrace = 1.2;
      this.combo = Math.min(5, 1 + this.driftTime * 0.6);
      this.score +=
        Math.abs(st.slip) * this.car.speed * dt * 1.5 * this.combo;
    } else if (this.driftGrace > 0) {
      this.driftGrace -= dt;
      if (this.driftGrace <= 0) {
        this.driftTime = 0;
        this.combo = 1;
      }
    }

    // 护栏碰撞：夹回赛道范围并减速
    const maxLat = this.track.halfWidth + 1.3;
    if (Math.abs(lat) > maxLat) {
      const s = this.track.samples[idx];
      const over = Math.abs(lat) - maxLat;
      pos.addScaledVector(s.normal, -Math.sign(lat) * over);
      if (Math.abs(this.car.speed) > 8) this.shakeT = 0.35;
      this.car.speed *= 0.55;
      this.car.velocity.multiplyScalar(0.5);
    }

    const n = this.track.sampleCount;
    if (this.state === "racing") {
      let delta = idx - this.lastIdx;
      if (delta > n / 2) delta -= n;
      else if (delta < -n / 2) delta += n;
      this.progressS += delta;

      // 逆行检测
      if (delta < 0 && Math.abs(this.car.speed) > 4) {
        this.backwardAccum += -delta;
      } else {
        this.backwardAccum = Math.max(0, this.backwardAccum - dt * 25);
      }
      this.hud.wrongWay(this.backwardAccum > 30);

      // 过线计圈
      if (this.progressS >= this.lap * n) {
        const lapTime = this.raceTime - this.lapStart;
        this.lapStart = this.raceTime;
        this.lastLap = lapTime;

        // 新纪录：保存幽灵车
        const frames = this.ghostRecorder.finish();
        if (
          frames &&
          (this.bestLap === null || lapTime < this.bestLap)
        ) {
          this.bestLap = lapTime;
          this.bestGhostFrames = frames;
          saveGhost(frames, lapTime);
          this.hud.showMessage("新纪录！幽灵车已更新", 1600);
        }
        this.ghostRecorder.start(); // 开始记录下一圈

        if (this.lap >= this.totalLaps) {
          this.state = "finished";
          this.hud.showFinish(
            this.raceTime,
            this.bestLap,
            this.playerRank,
            AI_COUNT + 1,
            this.score,
          );
          this.audio.stop();
          this.car.setNitroVisual(false);
          this.nitroActive = false;
        } else {
          this.lap++;
          this.hud.showMessage(
            this.lap === this.totalLaps ? "最后一圈！" : `第 ${this.lap} 圈`,
            1400,
          );
        }
      }
    }
    this.lastIdx = idx;

    // 漂移 / 草地烟尘
    if (!locked) {
      if ((drifting || offTrack) && this.car.speed > 8) {
        this.smokeAcc += dt * (drifting ? 90 : 50);
        while (this.smokeAcc >= 1) {
          this.smokeAcc -= 1;
          const side = Math.random() < 0.5 ? -0.85 : 0.85;
          this.tmpVec.set(side, 0.15, -1.5);
          this.car.group.localToWorld(this.tmpVec);
          this.smoke.spawn(this.tmpVec, this.car.velocity, drifting ? 2.4 : 1.7);
        }
      }
    }

    // 幽灵车记录（仅比赛进行中）
    if (this.state === "racing") {
      this.ghostRecorder.record(
        this.raceTime - this.lapStart,
        this.car.group.position.x,
        this.car.group.position.z,
        this.car.heading,
      );
      this.ghostCar.update(
        this.bestGhostFrames,
        this.raceTime - this.lapStart,
      );
    }
  }

  private updateCamera(dt: number): void {
    const carPos = this.car.group.position;
    const speedRatio = Math.min(Math.abs(this.car.speed) / this.car.maxSpeed, 1);
    const fx = Math.sin(this.car.heading);
    const fz = Math.cos(this.car.heading);

    const back = 8.6 + speedRatio * 3.2;
    const height = 3.5 + speedRatio * 0.9;
    this.tmpVec.set(
      carPos.x - fx * back,
      carPos.y + height,
      carPos.z - fz * back,
    );
    this.camera.position.lerp(this.tmpVec, 1 - Math.exp(-dt * 5.5));

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const s = this.shakeT * 0.45;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
    }

    this.tmpVec2.set(carPos.x + fx * 7, carPos.y + 1.3, carPos.z + fz * 7);
    this.lookTarget.lerp(this.tmpVec2, 1 - Math.exp(-dt * 8));
    this.camera.lookAt(this.lookTarget);

    const targetFov =
      62 + speedRatio * 15 + (this.nitroActive ? 8 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }

    // 阴影相机跟随赛车
    this.sun.position.set(carPos.x + 60, 110, carPos.z + 35);
    this.sun.target.position.copy(carPos);
    this.sun.target.updateMatrixWorld();
  }

  private updateMenuCamera(dt: number): void {
    this.menuAngle += dt * 0.055;
    const r = 150;
    this.camera.position.set(
      Math.cos(this.menuAngle) * r,
      62,
      Math.sin(this.menuAngle) * r,
    );
    this.lookTarget.set(0, 0, 0);
    this.camera.lookAt(this.lookTarget);
  }

  private updateHUD(): void {
    this.hud.setSpeed(Math.abs(this.car.speed) * 3.6);
    this.hud.setLap(this.lap, this.totalLaps);
    this.hud.setPosition(this.playerRank, AI_COUNT + 1);
    this.hud.setTime(this.raceTime);
    this.hud.setLapTimes(this.lastLap, this.bestLap);
    this.hud.setScore(this.score, this.combo);
    this.hud.setNitro(this.nitro / 100, this.nitroActive);
    const sr = Math.abs(this.car.speed) / this.car.maxSpeed;
    this.hud.setVignette(sr * sr * 0.5);
    this.hud.drawMinimap(this.car.group.position, this.car.heading);
  }
}
