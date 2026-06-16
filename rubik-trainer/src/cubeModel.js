// cubeModel.js — 三阶魔方的「几何块模型」（逻辑层）
// =====================================================================
// 设计目标：用一个所有人都能在脑子里验证的模型来表示魔方，避免难懂的
// 贴纸编号表。模型由 26 个小方块(cubie)组成，每个方块记录：
//   - pos:      它现在在 3x3x3 网格里的坐标 [x,y,z]，每个分量 ∈ {-1,0,1}
//   - stickers: 它有颜色的几个面，每个面记 {dir:朝向, color:颜色}
// 转一个面 = 把该层 9 个方块的 pos 和每个 sticker 的 dir 一起旋转 90°。
//
// 坐标轴约定（与 three.js 一致，便于 3D 演示和逻辑完全同步）：
//   +x = 右(R)   -x = 左(L)
//   +y = 上(U)   -y = 下(D)
//   +z = 前(F, 朝向你)   -z = 后(B)
// =====================================================================

// 还原状态下：某个朝向 dir 上「应该」是什么颜色（由中心块决定，永不改变）
// 白色在底(W=下)、黄色在顶(Y=上)，方便像真实教程那样「白底起步、黄顶收尾」。
export const FACE_COLOR = {
  '0,1,0': 'Y',   // 上 = 黄
  '0,-1,0': 'W',  // 下 = 白
  '0,0,1': 'G',   // 前 = 绿
  '0,0,-1': 'B',  // 后 = 蓝
  '1,0,0': 'R',   // 右 = 红
  '-1,0,0': 'O',  // 左 = 橙
};

// 颜色 -> 中心块所在朝向（FACE_COLOR 的反查），求解器用来定位
export const COLOR_DIR = Object.fromEntries(
  Object.entries(FACE_COLOR).map(([k, c]) => [c, k.split(',').map(Number)])
);

export const key = (v) => `${v[0]},${v[1]},${v[2]}`;

// ----- 生成一个还原状态的魔方 -----
export function makeSolvedCube() {
  const cubies = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue; // 跳过最里面那个不存在的核心
        const stickers = [];
        if (x !== 0) stickers.push({ dir: [x, 0, 0], color: FACE_COLOR[key([x, 0, 0])] });
        if (y !== 0) stickers.push({ dir: [0, y, 0], color: FACE_COLOR[key([0, y, 0])] });
        if (z !== 0) stickers.push({ dir: [0, 0, z], color: FACE_COLOR[key([0, 0, z])] });
        cubies.push({ pos: [x, y, z], stickers });
      }
  return cubies;
}

export function cloneCube(cubies) {
  return cubies.map((cb) => ({
    pos: cb.pos.slice(),
    stickers: cb.stickers.map((s) => ({ dir: s.dir.slice(), color: s.color })),
  }));
}

// ----- 把一个向量绕某轴旋转 ±90°（右手定则，绕正轴方向）-----
function rot90(v, axis, sign) {
  const [x, y, z] = v;
  if (sign > 0) {
    if (axis === 'x') return [x, -z, y];
    if (axis === 'y') return [z, y, -x];
    return [-y, x, z]; // axis z
  } else {
    if (axis === 'x') return [x, z, -y];
    if (axis === 'y') return [-z, y, x];
    return [y, -x, z]; // axis z
  }
}

// ----- 12 个基础转动的定义 -----
// 「顺时针」= 正对着这个面看时顺时针。推导结论：
//   正面(R/U/F)顺时针 = 绕正轴 -90°；负面(L/D/B)顺时针 = 绕正轴 +90°。
export const MOVES = {
  "U":  { axis: 'y', layer:  1, sign: -1 }, "U'": { axis: 'y', layer:  1, sign:  1 },
  "D":  { axis: 'y', layer: -1, sign:  1 }, "D'": { axis: 'y', layer: -1, sign: -1 },
  "R":  { axis: 'x', layer:  1, sign: -1 }, "R'": { axis: 'x', layer:  1, sign:  1 },
  "L":  { axis: 'x', layer: -1, sign:  1 }, "L'": { axis: 'x', layer: -1, sign: -1 },
  "F":  { axis: 'z', layer:  1, sign: -1 }, "F'": { axis: 'z', layer:  1, sign:  1 },
  "B":  { axis: 'z', layer: -1, sign:  1 }, "B'": { axis: 'z', layer: -1, sign: -1 },
};

const AXIS_INDEX = { x: 0, y: 1, z: 2 };

// 应用单个转动（支持 "U2" 这种 180°）。返回受影响轴/层/角度，供 3D 动画使用。
export function applyMove(cubies, move) {
  if (move.endsWith('2')) {
    const m = move.slice(0, -1);
    applyMove(cubies, m);
    return applyMove(cubies, m);
  }
  const def = MOVES[move];
  if (!def) throw new Error('未知转动: ' + move);
  const { axis, layer, sign } = def;
  const ai = AXIS_INDEX[axis];
  for (const cb of cubies) {
    if (cb.pos[ai] !== layer) continue;
    cb.pos = rot90(cb.pos, axis, sign);
    for (const st of cb.stickers) st.dir = rot90(st.dir, axis, sign);
  }
  return def;
}

export function parseSeq(seq) {
  return Array.isArray(seq) ? seq.slice() : seq.split(/\s+/).filter(Boolean);
}

export function applyMoves(cubies, seq) {
  for (const m of parseSeq(seq)) applyMove(cubies, m);
}

// 求一段序列的逆（用于「撤销」与打乱还原的兜底）
export function invertSeq(seq) {
  const out = [];
  for (const m of parseSeq(seq).reverse()) {
    if (m.endsWith('2')) out.push(m);
    else if (m.endsWith("'")) out.push(m.slice(0, -1));
    else out.push(m + "'");
  }
  return out;
}

// ----- 状态判定与查找（求解器、教学高亮都要用）-----
export function isSolved(cubies) {
  for (const cb of cubies)
    for (const st of cb.stickers)
      if (FACE_COLOR[key(st.dir)] !== st.color) return false;
  return true;
}

export function colorsOf(cb) {
  return cb.stickers.map((s) => s.color).sort().join('');
}

// 按颜色集合找一个块（棱块给两色，角块给三色）
export function findPiece(cubies, colors) {
  const target = [...colors].sort().join('');
  return cubies.find((cb) => colorsOf(cb) === target);
}

export function stickerAtDir(cb, dir) {
  const k = key(dir);
  return cb.stickers.find((st) => key(st.dir) === k) || null;
}

export function dirOfColor(cb, color) {
  const s = cb.stickers.find((st) => st.color === color);
  return s ? s.dir : null;
}

// 随机打乱：返回打乱用到的转动序列（避免相邻同面，外观更自然）
export function scramble(cubies, n = 22) {
  const faces = ['U', 'D', 'R', 'L', 'F', 'B'];
  const suffix = ['', "'", '2'];
  const seq = [];
  let last = '';
  for (let i = 0; i < n; i++) {
    let f;
    do { f = faces[Math.floor(Math.random() * 6)]; } while (f === last);
    last = f;
    seq.push(f + suffix[Math.floor(Math.random() * 3)]);
  }
  applyMoves(cubies, seq);
  return seq;
}
