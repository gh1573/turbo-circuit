import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Track } from "./track";

/** 天空穹顶（渐变） */
export function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(700, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x2f6fd0) },
      horizonColor: { value: new THREE.Color(0xd8ecf8) },
      bottomColor: { value: new THREE.Color(0x9db8c9) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 bottomColor;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 col = h > 0.0
          ? mix(horizonColor, topColor, smoothstep(0.0, 0.45, h))
          : mix(horizonColor, bottomColor, smoothstep(0.0, 0.3, -h));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  return new THREE.Mesh(geo, mat);
}

function makeGrassTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#4c8a3f";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4200; i++) {
    const r = 60 + Math.random() * 50;
    g.fillStyle = `rgba(${r * 0.5},${r + 40},${r * 0.45},${0.3 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(60, 60);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function buildGround(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(600, 48);
  const mat = new THREE.MeshStandardMaterial({
    map: makeGrassTexture(),
    roughness: 1,
    metalness: 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.02;
  mesh.receiveShadow = true;
  return mesh;
}

/** 沿赛道随机种树（InstancedMesh） */
export function buildTrees(track: Track): THREE.Group {
  const group = new THREE.Group();
  const count = 150;

  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.95 });
  const leafGeo = new THREE.ConeGeometry(2.1, 5.6, 8);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b33, roughness: 0.9 });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  trunks.castShadow = true;
  leaves.castShadow = true;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const euler = new THREE.Euler();

  // 每 8 个采样点取一个用于距离检测
  const checkPoints: THREE.Vector3[] = [];
  for (let i = 0; i < track.sampleCount; i += 8) {
    checkPoints.push(track.samples[i].point);
  }

  let placed = 0;
  let attempts = 0;
  while (placed < count && attempts < 4000) {
    attempts++;
    const angle = Math.random() * Math.PI * 2;
    const radius = 40 + Math.random() * 230;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    let clear = true;
    for (const cp of checkPoints) {
      const dx = x - cp.x;
      const dz = z - cp.z;
      if (dx * dx + dz * dz < (track.halfWidth + 8) ** 2) {
        clear = false;
        break;
      }
    }
    if (!clear) continue;

    const scale = 0.8 + Math.random() * 0.9;
    euler.set(0, Math.random() * Math.PI * 2, 0);
    q.setFromEuler(euler);
    s.set(scale, scale, scale);

    p.set(x, 1.2 * scale, z);
    m.compose(p, q, s);
    trunks.setMatrixAt(placed, m);

    p.set(x, (2.4 + 2.4) * scale, z);
    m.compose(p, q, s);
    leaves.setMatrixAt(placed, m);

    placed++;
  }
  trunks.count = placed;
  leaves.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;

  group.add(trunks);
  group.add(leaves);
  return group;
}

/** 配置灯光与环境反射 */
export function setupLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer): THREE.DirectionalLight {
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x3f6b34, 0.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1da, 2.4);
  sun.position.set(90, 130, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  // 环境反射（让车漆有镜面高光）
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  return sun;
}
