// faceletEngine.js — 给求解器用的「快速贴纸模型」
// =====================================================================
// 几何块模型(cubeModel)直观、便于驱动 3D 动画，但每步都要克隆 26 个对象，
// 用来做深度搜索太慢。这里把魔方状态压缩成一个 54 元素的颜色数组，
// 每个转动预先算成一张「下标置换表」，转一步只是一次数组 gather，极快。
//
// 关键：置换表是从几何模型「自动推导」出来的（给solved魔方贴上槽位编号、
// 转一下、读编号去哪了），所以两套模型 100% 一致，不会出现对不上的 bug。
// =====================================================================
import { makeSolvedCube, applyMove, key, COLOR_DIR } from './cubeModel.js';

export const SEARCH_MOVES = [
  'U', "U'", 'U2', 'R', "R'", 'R2', 'L', "L'", 'L2',
  'F', "F'", 'F2', 'B', "B'", 'B2',
];

const COLN = { W: 0, Y: 1, G: 2, B: 3, R: 4, O: 5 };

// 6 个面的外法线方向（U D F B R L 顺序）
const FACE_DIRS = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0]];

// 构造 54 个槽位：每个槽位 = (它所在的小方块坐标 pos, 它朝外的方向 dir)
export const SLOTS = [];
for (const n of FACE_DIRS) {
  const ai = n.findIndex((v) => v !== 0);
  const others = [0, 1, 2].filter((i) => i !== ai);
  for (const a of [-1, 0, 1])
    for (const b of [-1, 0, 1]) {
      const pos = [0, 0, 0];
      pos[ai] = n[ai];
      pos[others[0]] = a;
      pos[others[1]] = b;
      SLOTS.push({ pos, dir: n.slice() });
    }
}
const slotKey = (pos, dir) => key(pos) + '|' + key(dir);
const SLOT_INDEX = new Map();
SLOTS.forEach((s, i) => SLOT_INDEX.set(slotKey(s.pos, s.dir), i));

// 几何模型 -> 54 色数组
export function toFacelets(c) {
  const fa = new Int8Array(54);
  for (const cb of c)
    for (const st of cb.stickers) {
      const idx = SLOT_INDEX.get(slotKey(cb.pos, st.dir));
      fa[idx] = COLN[st.color];
    }
  return fa;
}

// 预先推导每个转动的置换表：perm[k] = 转完后 槽位 k 里的内容来自哪个原槽位
export const PERM = {};
for (const m of SEARCH_MOVES) {
  const c = makeSolvedCube();
  for (const cb of c) for (const st of cb.stickers) st.label = SLOT_INDEX.get(slotKey(cb.pos, st.dir));
  applyMove(c, m);
  const perm = new Int8Array(54);
  for (const cb of c)
    for (const st of cb.stickers) {
      const k = SLOT_INDEX.get(slotKey(cb.pos, st.dir));
      perm[k] = st.label;
    }
  PERM[m] = perm;
}

export function applyPerm(fa, perm) {
  const out = new Int8Array(54);
  for (let i = 0; i < 54; i++) out[i] = fa[perm[i]];
  return out;
}

// 给定一个块的颜色（棱给两色、角给三色），算出它「还原位」对应的槽位下标与应有颜色
export function pieceTargets(cols) {
  const pos = [0, 0, 0];
  for (const ch of cols) {
    const d = COLOR_DIR[ch];
    for (let i = 0; i < 3; i++) pos[i] += d[i];
  }
  const idx = [], col = [];
  for (const ch of cols) {
    idx.push(SLOT_INDEX.get(slotKey(pos, COLOR_DIR[ch])));
    col.push(COLN[ch]);
  }
  return { idx: Int8Array.from(idx), col: Int8Array.from(col) };
}

// 迭代加深 DFS：在贴纸模型上找最短序列，使 goal 块归位、且 locks 中的块保持归位
export function searchPiece(fa, goal, locks, maxDepth = 8) {
  const test = (s) => {
    for (let i = 0; i < goal.idx.length; i++) if (s[goal.idx[i]] !== goal.col[i]) return false;
    for (const L of locks) for (let i = 0; i < L.idx.length; i++) if (s[L.idx[i]] !== L.col[i]) return false;
    return true;
  };
  if (test(fa)) return [];
  for (let lim = 1; lim <= maxDepth; lim++) {
    const r = dfs(fa, lim, '', test);
    if (r) return r;
  }
  return null;
}
function dfs(s, lim, last, test) {
  for (const m of SEARCH_MOVES) {
    if (m[0] === last) continue;
    const ns = applyPerm(s, PERM[m]);
    if (lim === 1) {
      if (test(ns)) return [m];
    } else {
      const sub = dfs(ns, lim - 1, m[0], test);
      if (sub) { sub.unshift(m); return sub; }
    }
  }
  return null;
}
