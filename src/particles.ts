import * as THREE from "three";

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
}

/** 漂移 / 草地烟尘粒子池（自定义 shader 点精灵） */
export class SmokeSystem {
  private max: number;
  private particles: Particle[] = [];
  private cursor = 0;
  private points: THREE.Points;
  private geo: THREE.BufferGeometry;
  private posAttr: THREE.BufferAttribute;
  private sizeAttr: THREE.BufferAttribute;
  private alphaAttr: THREE.BufferAttribute;
  private color: THREE.Color;

  constructor(scene: THREE.Scene, max = 500, color = 0xcfd4d8) {
    this.max = max;
    this.color = new THREE.Color(color);

    for (let i = 0; i < max; i++) {
      this.particles.push({
        x: 0, y: -100, z: 0,
        vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 1,
      });
    }

    this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.alphaAttr = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.geo.setAttribute("position", this.posAttr);
    this.geo.setAttribute("aSize", this.sizeAttr);
    this.geo.setAttribute("aAlpha", this.alphaAttr);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: this.color },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        varying float vAlpha;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(uColor, vAlpha * smoothstep(0.5, 0.1, d));
        }
      `,
    });

    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  spawn(pos: THREE.Vector3, vel: THREE.Vector3, size: number): void {
    const p = this.particles[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    p.x = pos.x + (Math.random() - 0.5) * 0.4;
    p.y = pos.y;
    p.z = pos.z + (Math.random() - 0.5) * 0.4;
    p.vx = vel.x * 0.3 + (Math.random() - 0.5) * 1.5;
    p.vy = 1.2 + Math.random() * 1.4;
    p.vz = vel.z * 0.3 + (Math.random() - 0.5) * 1.5;
    p.life = 0;
    p.maxLife = 0.7 + Math.random() * 0.5;
    p.size = size * (0.8 + Math.random() * 0.5);
  }

  update(dt: number): void {
    const pos = this.posAttr.array as Float32Array;
    const size = this.sizeAttr.array as Float32Array;
    const alpha = this.alphaAttr.array as Float32Array;

    for (let i = 0; i < this.max; i++) {
      const p = this.particles[i];
      if (p.life < p.maxLife) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        p.vx *= 1 - 1.6 * dt;
        p.vz *= 1 - 1.6 * dt;
        const t = p.life / p.maxLife;
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
        size[i] = p.size * (1 + t * 2.2);
        alpha[i] = 0.32 * (1 - t);
      } else {
        alpha[i] = 0;
        pos[i * 3 + 1] = -100;
      }
    }
    this.posAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.alphaAttr.needsUpdate = true;
  }
}
