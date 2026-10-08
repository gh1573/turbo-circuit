import * as THREE from "three";

export interface TrackSample {
  point: THREE.Vector3;
  tangent: THREE.Vector3; // 朝向前方（XZ 平面）
  normal: THREE.Vector3; // 左侧法线（XZ 平面）
}

// 赛道控制点（x, z），闭合CatmullRom曲线
const CONTROL_POINTS: Array<[number, number]> = [
  [0, -95],
  [58, -88],
  [95, -58],
  [100, -8],
  [72, 22],
  [84, 62],
  [48, 95],
  [2, 100],
  [-42, 88],
  [-78, 72],
  [-100, 28],
  [-82, -12],
  [-88, -58],
  [-52, -84],
  [-18, -72],
];

const TILE_LENGTH = 12; // 路面纹理每 12 米重复一次

function makeRoadTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#3b3e44";
  g.fillRect(0, 0, 256, 256);
  // 沥青噪点
  for (let i = 0; i < 3200; i++) {
    const v = 45 + Math.random() * 45;
    g.fillStyle = `rgba(${v},${v},${v + 6},${0.25 + Math.random() * 0.3})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  // 两侧白线
  g.fillStyle = "#e8ecf0";
  g.fillRect(8, 0, 6, 256);
  g.fillRect(242, 0, 6, 256);
  // 中央虚线
  g.fillStyle = "#f2c94c";
  g.fillRect(125, 24, 6, 110);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCurbTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 16;
  const g = c.getContext("2d")!;
  g.fillStyle = "#d43a2f";
  g.fillRect(0, 0, 64, 16);
  g.fillStyle = "#f0f0f0";
  g.fillRect(64, 0, 64, 16);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeCheckerTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  const cols = 8;
  const rows = 2;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? "#111" : "#f4f4f4";
      g.fillRect((x * 256) / cols, (y * 64) / rows, 256 / cols, 64 / rows);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makeGantryTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#151a22";
  g.fillRect(0, 0, 1024, 128);
  // 棋盘格饰边
  for (let x = 0; x < 32; x++) {
    g.fillStyle = x % 2 === 0 ? "#f4f4f4" : "#111";
    g.fillRect(x * 16, 0, 16, 12);
    g.fillRect(x * 16, 116, 16, 12);
  }
  g.font = "900 64px 'Segoe UI', system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#ffb03c";
  g.fillText("TURBO CIRCUIT", 512, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export class Track {
  readonly halfWidth = 7;
  readonly sampleCount = 900;
  readonly samples: TrackSample[] = [];
  readonly segLengths: number[] = [];
  readonly totalLength = 0;
  readonly curve: THREE.CatmullRomCurve3;

  constructor() {
    const pts = CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, "centripetal", 0.5);

    for (let i = 0; i < this.sampleCount; i++) {
      const t = i / this.sampleCount;
      const point = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t);
      tangent.y = 0;
      tangent.normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      this.samples.push({ point, tangent, normal });
    }

    for (let i = 0; i < this.sampleCount; i++) {
      const a = this.samples[i].point;
      const b = this.samples[(i + 1) % this.sampleCount].point;
      const len = a.distanceTo(b);
      this.segLengths.push(len);
      this.totalLength += len;
    }
  }

  /** 按浮点索引插值（用于重置车辆到赛道） */
  sampleAtFloat(s: number): TrackSample {
    const n = this.sampleCount;
    const i = ((Math.floor(s) % n) + n) % n;
    const j = (i + 1) % n;
    const f = s - Math.floor(s);
    const a = this.samples[i];
    const b = this.samples[j];
    return {
      point: a.point.clone().lerp(b.point, f),
      tangent: a.tangent.clone().lerp(b.tangent, f).normalize(),
      normal: a.normal.clone().lerp(b.normal, f).normalize(),
    };
  }

  /** 在 hint 附近局部搜索最近采样点索引 */
  nearestIndex(pos: THREE.Vector3, hint: number): number {
    const n = this.sampleCount;
    let best = ((hint % n) + n) % n;
    let bestD = Infinity;
    const window = 26;
    for (let o = -window; o <= window; o++) {
      const i = (((hint + o) % n) + n) % n;
      const d = pos.distanceToSquared(this.samples[i].point);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** 相对赛道中心线的横向偏移（正 = 左侧） */
  lateralOffset(pos: THREE.Vector3, idx: number): number {
    const s = this.samples[idx];
    const dx = pos.x - s.point.x;
    const dz = pos.z - s.point.z;
    return dx * s.normal.x + dz * s.normal.z;
  }

  /** 路面网格 */
  buildRoad(): THREE.Mesh {
    const n = this.sampleCount;
    const positions = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const indices = new Uint32Array(n * 6);
    let v = 0;

    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const li = i * 6;
      positions[li] = s.point.x + s.normal.x * this.halfWidth;
      positions[li + 1] = 0.02;
      positions[li + 2] = s.point.z + s.normal.z * this.halfWidth;
      positions[li + 3] = s.point.x - s.normal.x * this.halfWidth;
      positions[li + 4] = 0.02;
      positions[li + 5] = s.point.z - s.normal.z * this.halfWidth;

      uvs[i * 4] = 0;
      uvs[i * 4 + 1] = v;
      uvs[i * 4 + 2] = 1;
      uvs[i * 4 + 3] = v;
      v += this.segLengths[i] / TILE_LENGTH;
    }

    for (let i = 0; i < n; i++) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = ((i + 1) % n) * 2;
      const d = ((i + 1) % n) * 2 + 1;
      const k = i * 6;
      indices[k] = a;
      indices[k + 1] = b;
      indices[k + 2] = c;
      indices[k + 3] = b;
      indices[k + 4] = d;
      indices[k + 5] = c;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: makeRoadTexture(),
      roughness: 0.94,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** 红白路肩（双侧） */
  buildCurbs(): THREE.Mesh {
    const n = this.sampleCount;
    const w = 0.9;
    const positions = new Float32Array(n * 4 * 3);
    const uvs = new Float32Array(n * 4 * 2);
    const indices = new Uint32Array(n * 12);
    let v = 0;

    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const base = i * 12;
      const inner = this.halfWidth - 0.05;
      const outer = this.halfWidth + w;
      // 左侧路肩（两条边）
      positions[base] = s.point.x + s.normal.x * inner;
      positions[base + 1] = 0.06;
      positions[base + 2] = s.point.z + s.normal.z * inner;
      positions[base + 3] = s.point.x + s.normal.x * outer;
      positions[base + 4] = 0.06;
      positions[base + 5] = s.point.z + s.normal.z * outer;
      // 右侧路肩
      positions[base + 6] = s.point.x - s.normal.x * outer;
      positions[base + 7] = 0.06;
      positions[base + 8] = s.point.z - s.normal.z * outer;
      positions[base + 9] = s.point.x - s.normal.x * inner;
      positions[base + 10] = 0.06;
      positions[base + 11] = s.point.z - s.normal.z * inner;

      uvs[i * 8] = 0;
      uvs[i * 8 + 1] = v;
      uvs[i * 8 + 2] = 1;
      uvs[i * 8 + 3] = v;
      uvs[i * 8 + 4] = 0;
      uvs[i * 8 + 5] = v;
      uvs[i * 8 + 6] = 1;
      uvs[i * 8 + 7] = v;
      v += this.segLengths[i] / 8; // 每 8 米红白交替
    }

    for (let i = 0; i < n; i++) {
      const a = i * 4;
      const b = ((i + 1) % n) * 4;
      const k = i * 12;
      // 左条
      indices[k] = a;
      indices[k + 1] = a + 1;
      indices[k + 2] = b;
      indices[k + 3] = a + 1;
      indices[k + 4] = b + 1;
      indices[k + 5] = b;
      // 右条
      indices[k + 6] = a + 2;
      indices[k + 7] = a + 3;
      indices[k + 8] = b + 2;
      indices[k + 9] = a + 3;
      indices[k + 10] = b + 3;
      indices[k + 11] = b + 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: makeCurbTexture(),
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /** 两侧低矮护栏 */
  buildWalls(): THREE.Mesh {
    const n = this.sampleCount;
    const h = 0.55;
    const dist = this.halfWidth + 1.35;
    const positions = new Float32Array(n * 4 * 3);
    const indices = new Uint32Array(n * 12);

    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      const base = i * 12;
      // 左墙（底+顶）
      positions[base] = s.point.x + s.normal.x * dist;
      positions[base + 1] = 0;
      positions[base + 2] = s.point.z + s.normal.z * dist;
      positions[base + 3] = s.point.x + s.normal.x * dist;
      positions[base + 4] = h;
      positions[base + 5] = s.point.z + s.normal.z * dist;
      // 右墙（底+顶）
      positions[base + 6] = s.point.x - s.normal.x * dist;
      positions[base + 7] = 0;
      positions[base + 8] = s.point.z - s.normal.z * dist;
      positions[base + 9] = s.point.x - s.normal.x * dist;
      positions[base + 10] = h;
      positions[base + 11] = s.point.z - s.normal.z * dist;
    }

    for (let i = 0; i < n; i++) {
      const a = i * 4;
      const b = ((i + 1) % n) * 4;
      const k = i * 12;
      indices[k] = a;
      indices[k + 1] = b;
      indices[k + 2] = a + 1;
      indices[k + 3] = a + 1;
      indices[k + 4] = b;
      indices[k + 5] = b + 1;
      indices[k + 6] = a + 2;
      indices[k + 7] = a + 3;
      indices[k + 8] = b + 2;
      indices[k + 9] = a + 3;
      indices[k + 10] = b + 3;
      indices[k + 11] = b + 2;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setIndex(new THREE.BufferAttribute(indices, 1));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0xc9d2da,
      roughness: 0.55,
      metalness: 0.35,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  /** 起跑线 */
  buildStartLine(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(this.halfWidth * 2, 2.6);
    const mat = new THREE.MeshBasicMaterial({
      map: makeCheckerTexture(),
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const s = this.samples[0];
    mesh.rotation.order = "YXZ";
    mesh.rotation.y = Math.atan2(-s.normal.z, s.normal.x);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(s.point.x, 0.045, s.point.z);
    return mesh;
  }

  /** 起点门架 */
  buildGantry(): THREE.Group {
    const group = new THREE.Group();
    const s = this.samples[0];
    const span = this.halfWidth + 2.4;

    const poleGeo = new THREE.CylinderGeometry(0.18, 0.18, 7.4, 10);
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x8a939c,
      roughness: 0.4,
      metalness: 0.7,
    });
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(
        s.point.x + s.normal.x * span * side,
        3.7,
        s.point.z + s.normal.z * span * side,
      );
      pole.castShadow = true;
      group.add(pole);
    }

    const beam = new THREE.Mesh(
      new THREE.BoxGeometry(span * 2 + 0.6, 1.1, 0.5),
      new THREE.MeshStandardMaterial({
        color: 0x22262e,
        roughness: 0.5,
        metalness: 0.6,
      }),
    );
    beam.position.set(s.point.x, 7.0, s.point.z);
    beam.rotation.y = Math.atan2(-s.normal.z, s.normal.x);
    beam.castShadow = true;
    group.add(beam);

    const banner = new THREE.Mesh(
      new THREE.PlaneGeometry(span * 2, 1.0),
      new THREE.MeshBasicMaterial({ map: makeGantryTexture() }),
    );
    banner.position.set(s.point.x, 7.0, s.point.z);
    // 横幅宽度沿法线方向，正面朝向切线方向（供驶来方向看到）
    banner.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
    group.add(banner);

    const bannerBack = banner.clone();
    bannerBack.rotation.y += Math.PI;
    group.add(bannerBack);

    return group;
  }
}
