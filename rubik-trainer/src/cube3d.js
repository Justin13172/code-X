// cube3d.js — three.js 三维魔方（视觉层）
// =====================================================================
// 渲染 26 个小方块，支持：鼠标拖拽看各个角度、带动画地转面、高亮指定块。
// 关键：颜色方案和转面的旋转方向都和 cubeModel 完全一致，所以「看到的」
// 和「算出来的」永远同步——这正是教学要的「动态空间演示」。
// =====================================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { makeSolvedCube, applyMove, MOVES, key, FACE_COLOR, findPiece } from './cubeModel.js';

const COLOR_HEX = {
  W: 0xf8f8f8, Y: 0xffd400, G: 0x00a651, B: 0x0051ba, R: 0xc8102e, O: 0xff6b00,
};
const PLASTIC = 0x141414;
const SP = 1.04; // 小方块间距

export class Cube3D {
  constructor(container) {
    this.container = container;
    this.model = makeSolvedCube();
    this.animating = false;
    this.speed = 1;        // 动画速度倍率
    this.queue = [];
    this._highlight = new Set();

    const w = container.clientWidth, h = container.clientHeight;
    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    this.camera.position.set(5.2, 5.0, 6.4);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const dir = new THREE.DirectionalLight(0xffffff, 0.7);
    dir.position.set(6, 9, 7);
    this.scene.add(dir);
    const dir2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dir2.position.set(-6, -4, -7);
    this.scene.add(dir2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.rotateSpeed = 0.9;
    this.controls.target.set(0, 0, 0);

    this.cubeGroup = new THREE.Group();
    this.scene.add(this.cubeGroup);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);

    this.meshes = [];
    this._build();

    window.addEventListener('resize', () => this._onResize());
    this._animate();
  }

  _build() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let x = -1; x <= 1; x++)
      for (let y = -1; y <= 1; y++)
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue;
          // 面顺序：+x,-x,+y,-y,+z,-z
          const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
          const mats = dirs.map((d) => {
            const onFace = (d[0] === x && x !== 0) || (d[1] === y && y !== 0) || (d[2] === z && z !== 0);
            const col = onFace ? COLOR_HEX[FACE_COLOR[key(d)]] : PLASTIC;
            return new THREE.MeshStandardMaterial({ color: col, metalness: 0.1, roughness: 0.55 });
          });
          const mesh = new THREE.Mesh(geo, mats);
          mesh.position.set(x * SP, y * SP, z * SP);
          mesh.userData.grid = [x, y, z];
          mesh.userData.baseColors = mats.map((m) => m.color.getHex());
          this.cubeGroup.add(mesh);
          this.meshes.push(mesh);
        }
  }

  _onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // 把一组转动排队执行；返回 Promise，在全部播放完后 resolve
  play(seq, { onStep } = {}) {
    const list = Array.isArray(seq) ? seq.slice() : seq.split(/\s+/).filter(Boolean);
    return new Promise((resolve) => {
      this.queue.push({ list, onStep, resolve });
      this._drain();
    });
  }
  async _drain() {
    if (this.animating || this._draining) return;
    this._draining = true;
    while (this.queue.length) {
      const job = this.queue.shift();
      for (const m of job.list) {
        await this._turn(m);
        if (job.onStep) job.onStep(m);
      }
      job.resolve();
    }
    this._draining = false;
  }

  // 立即（无动画）应用一串转动，并同步到 3D
  applyInstant(seq) {
    const list = Array.isArray(seq) ? seq : seq.split(/\s+/).filter(Boolean);
    for (const m of list) this._turn(m, true);
  }

  _turn(move, instant = false) {
    return new Promise((resolve) => {
      let token = move, times = 1;
      if (move.endsWith('2')) { token = move[0]; times = 2; }
      const def = MOVES[token];
      const axisVec = new THREE.Vector3(def.axis === 'x' ? 1 : 0, def.axis === 'y' ? 1 : 0, def.axis === 'z' ? 1 : 0);
      const ai = { x: 0, y: 1, z: 2 }[def.axis];
      const angle = def.sign * (Math.PI / 2) * times;

      // 收集该层的 mesh
      this.pivot.rotation.set(0, 0, 0);
      this.pivot.updateMatrixWorld();
      const layerMeshes = this.meshes.filter((mm) => mm.userData.grid[ai] === def.layer);
      for (const mm of layerMeshes) this.pivot.attach(mm);

      const finalize = () => {
        for (const mm of layerMeshes) {
          this.cubeGroup.attach(mm);
          // 吸附到网格
          mm.position.set(Math.round(mm.position.x / SP) * SP, Math.round(mm.position.y / SP) * SP, Math.round(mm.position.z / SP) * SP);
          mm.userData.grid = [Math.round(mm.position.x / SP), Math.round(mm.position.y / SP), Math.round(mm.position.z / SP)];
        }
        // 同步逻辑模型
        applyMove(this.model, move);
        this.pivot.rotation.set(0, 0, 0);
        this._reapplyHighlight();
        resolve();
      };

      if (instant) {
        this.pivot.rotateOnAxis(axisVec, angle);
        this.pivot.updateMatrixWorld();
        finalize();
        return;
      }

      this.animating = true;
      const dur = (260 / this.speed) * times;
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOut
        this.pivot.rotation.set(0, 0, 0);
        this.pivot.rotateOnAxis(axisVec, angle * e);
        if (t < 1) requestAnimationFrame(step);
        else { this.animating = false; finalize(); }
      };
      requestAnimationFrame(step);
    });
  }

  // 高亮一组「块」（用颜色集合标识，如 'WG'、'WGR'）
  highlightPieces(colorList) {
    this._highlight = new Set(colorList);
    this._reapplyHighlight();
  }
  clearHighlight() { this._highlight = new Set(); this._reapplyHighlight(); }

  _reapplyHighlight() {
    const targetGrids = new Set();
    for (const cols of this._highlight) {
      const p = findPiece(this.model, cols);
      if (p) targetGrids.add(p.pos.join(','));
    }
    for (const mm of this.meshes) {
      const hot = targetGrids.has(mm.userData.grid.join(','));
      mm.material.forEach((mat, i) => {
        const base = mm.userData.baseColors[i];
        if (hot && base !== PLASTIC) {
          mat.emissive.setHex(0x444444);
          mat.color.setHex(base);
        } else if (hot) {
          mat.emissive.setHex(0x000000);
        } else {
          mat.emissive.setHex(0x000000);
          mat.color.setHex(base);
        }
      });
      mm.scale.setScalar(hot ? 1.0 : (this._highlight.size ? 0.93 : 1.0));
    }
  }

  resetState() {
    // 把所有 mesh 复位到还原状态
    for (const mm of this.meshes) {
      const [x, y, z] = mm.userData.home || mm.userData.grid;
    }
    // 简单做法：移除重建
    for (const mm of this.meshes) this.cubeGroup.remove(mm);
    this.meshes = [];
    this.model = makeSolvedCube();
    this._highlight = new Set();
    this._build();
  }

  resetView() {
    this.camera.position.set(5.2, 5.0, 6.4);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }
}
