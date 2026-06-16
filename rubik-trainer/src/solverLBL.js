// solverLBL.js — 层先法(Layer-by-Layer)求解器
// =====================================================================
// 目标：对任意打乱，产出一条「分阶段、可解释」的还原路线。
// - 底层十字 + 底层角块：用带 visited 的广度优先搜索(BFS)逐块归位。
//   好处：不依赖容易记错的「朝向分类公式」，对每个块直接搜出最短插入，
//   而且数学上保证正确（搜到的序列一定让该块归位且不破坏已锁定的块）。
// - 中层棱、顶层(黄色)：用层先法的标准算法 + 贪心循环。
// 白色在底、黄色在顶（与 cubeModel 的配色一致）。
// =====================================================================
import {
  cloneCube, applyMove, applyMoves, isSolved, findPiece, dirOfColor,
  stickerAtDir, key, COLOR_DIR, FACE_COLOR,
} from './cubeModel.js';
import { toFacelets, pieceTargets, searchPiece } from './faceletEngine.js';

// ---------- 各种「是否归位」判定 ----------
const COLOR_FACE = { G: 'F', B: 'B', R: 'R', O: 'L' }; // 侧面颜色 -> 面字母
const UP = [0, 1, 0], DOWN = [0, -1, 0];

function edgeCrossSolved(c, cols) {
  const e = findPiece(c, cols);
  if (key(dirOfColor(e, 'W')) !== key(DOWN)) return false;
  const side = cols.replace('W', '');
  return key(dirOfColor(e, side)) === key(COLOR_DIR[side]);
}

function cornerL1Solved(c, cols) {
  const cn = findPiece(c, cols);
  if (key(dirOfColor(cn, 'W')) !== key(DOWN)) return false;
  for (const col of cols) {
    if (col === 'W') continue;
    if (key(dirOfColor(cn, col)) !== key(COLOR_DIR[col])) return false;
  }
  return true;
}

function edgeMidSolved(c, cols) {
  const e = findPiece(c, cols);
  for (const col of cols) if (key(dirOfColor(e, col)) !== key(COLOR_DIR[col])) return false;
  return true;
}

// ---------- 求解器主体 ----------
class Solver {
  constructor(cubies) {
    this.c = cloneCube(cubies);
    this.moves = [];
    this.stages = [];
  }
  do(seq, bucket) {
    const list = Array.isArray(seq) ? seq : seq.split(/\s+/).filter(Boolean);
    for (const m of list) { applyMove(this.c, m); this.moves.push(m); if (bucket) bucket.push(m); }
  }
  stage(name, desc, fn) {
    const bucket = [];
    fn(bucket);
    this.stages.push({ name, desc, moves: bucket });
  }

  // 阶段1：底层白十字（在快速贴纸模型上逐块搜索最短插入）
  solveCross(bucket) {
    const edges = ['WG', 'WR', 'WB', 'WO'];
    for (let i = 0; i < edges.length; i++) {
      const fa = toFacelets(this.c);
      const goal = pieceTargets(edges[i]);
      const locks = edges.slice(0, i).map(pieceTargets);
      const path = searchPiece(fa, goal, locks, 8);
      if (path) this.do(path, bucket);
    }
  }

  // 阶段2：底层白角（第一层完成）
  solveCorners(bucket) {
    const corners = ['WGR', 'WRB', 'WBO', 'WOG'];
    const cross = ['WG', 'WR', 'WB', 'WO'].map(pieceTargets);
    for (let i = 0; i < corners.length; i++) {
      const fa = toFacelets(this.c);
      const goal = pieceTargets(corners[i]);
      const locks = cross.concat(corners.slice(0, i).map(pieceTargets));
      const path = searchPiece(fa, goal, locks, 9);
      if (path) this.do(path, bucket);
    }
  }

  // 阶段3：中层棱块（用标准左右插入公式）
  solveMiddle(bucket) {
    const right = ['F', 'B', 'R', 'L']; // 用面字母，邻接见下
    const rightOf = { F: 'R', R: 'B', B: 'L', L: 'F' };
    const leftOf = { F: 'L', L: 'B', B: 'R', R: 'F' };
    const mids = ['GR', 'RB', 'BO', 'OG'];
    let guard = 0;
    while (!mids.every((m) => edgeMidSolved(this.c, m)) && guard++ < 30) {
      // 找一个未归位、且当前不在中层错位卡住的棱块来处理
      let handled = false;
      // 先把"卡在中层错误位置"的棱块踢到顶层
      for (const cols of mids) {
        if (edgeMidSolved(this.c, cols)) continue;
        const e = findPiece(this.c, cols);
        if (e.pos[1] === 0) {
          // 在中层但不对：用该槽两面的右插公式把它踢到顶层
          const { front, rn } = slotFaces(e.pos);
          this.rightInsert(front, rn, bucket);
          handled = true;
          break;
        }
      }
      if (handled) continue;
      // 处理一个在顶层的棱块
      for (const cols of mids) {
        if (edgeMidSolved(this.c, cols)) continue;
        const e = findPiece(this.c, cols);
        if (e.pos[1] !== 1) continue;
        // 它的两色：一色朝上(+y)，一色朝侧。把侧色转到与其中心对齐
        const upSticker = stickerAtDir(e, UP);
        if (!upSticker) continue; // 万一朝向异常，跳过这轮
        const upColor = upSticker.color;
        const sideColor = cols.replace(upColor, '');
        const sideFace = COLOR_FACE[sideColor];
        // 旋转 U 直到该棱块的侧色贴在 sideFace 的中心方向
        let g2 = 0;
        while (key(dirOfColor(findPiece(this.c, cols), sideColor)) !== key(COLOR_DIR[sideColor]) && g2++ < 4) {
          this.do('U', bucket);
        }
        // up 色决定往左还是往右插
        if (upColor === COLOR_FOR_FACE(rightOf[sideFace])) {
          this.rightInsert(sideFace, rightOf[sideFace], bucket);
        } else {
          this.leftInsert(sideFace, leftOf[sideFace], bucket);
        }
        handled = true;
        break;
      }
      if (!handled) {
        // 没有可处理的顶层棱块，但仍未完成：转一下 U 再试（防卡死）
        this.do('U', bucket);
      }
    }
  }
  rightInsert(front, rn, bucket) {
    // 标准右插：U RN U' RN' U' F' U F （相对 front 面）
    this.do(`U ${rn} U' ${rn}' U' ${front}' U ${front}`, bucket);
  }
  leftInsert(front, ln, bucket) {
    // 标准左插：U' LN' U LN U F U' F'
    this.do(`U' ${ln}' U ${ln} U ${front} U' ${front}'`, bucket);
  }

  // 阶段4：顶层黄十字（棱块定向）。
  // 用「宏BFS」：在 {U, U', F R U R' U' F'} 上搜到黄十字。算法不破坏前两层，
  // U 只是调整角度，状态空间极小，必然很快找到正确序列。
  solveYellowCross(bucket) {
    const macros = [
      { seq: ['U'] }, { seq: ["U'"] },
      { seq: "F R U R' U' F'".split(' ') },
    ];
    const path = llSearch(this.c, macros, (c) => yellowEdgeUpCount(c) === 4, 9);
    if (path) this.do(path, bucket);
  }

  // 阶段5：顶层角块归位（位置正确，朝向先不管）。
  // cornerCycle 是固定 UFR 的三角循环，且不动顶层棱块 -> 黄十字自动保持。
  solvePermuteCorners(bucket) {
    const cornerCycle = "U R U' L' U R' U' L".split(' ');
    const macros = [{ seq: ['U'] }, { seq: ["U'"] }, { seq: cornerCycle }];
    const path = llSearch(this.c, macros, (c) => llCornersPositioned(c), 12);
    if (path) this.do(path, bucket);
  }

  // 阶段6：顶层角块定向（黄色翻上来，位置不变）
  solveOrientCorners(bucket) {
    for (let i = 0; i < 4; i++) {
      let guard = 0;
      // 把 UFR 角的黄色拧上来
      while (!cornerUFRyellowUp(this.c) && guard++ < 6) {
        this.do("R' D' R D", bucket);
      }
      this.do('U', bucket); // 换下一个角到 UFR
    }
    // 收尾：对齐顶层（AUF）
    let g = 0;
    while (!llTopAligned(this.c) && g++ < 4) this.do('U', bucket);
  }

  // 阶段7：顶层棱块归位。edgeCycle 是三棱循环且不动角块，宏BFS搜到全复原。
  solvePermuteEdges(bucket) {
    const edgeCycle = "R U' R U R U R U' R' U' R2".split(' ');
    const macros = [{ seq: ['U'] }, { seq: ["U'"] }, { seq: edgeCycle }];
    const path = llSearch(this.c, macros, (c) => isSolved(c), 12);
    if (path) this.do(path, bucket);
  }

  run() {
    this.stage('底层白十字', '先把 4 个带白色的棱块摆成十字，白色朝下，侧面颜色对准中心。', (b) => this.solveCross(b));
    this.stage('底层白角', '把 4 个白色角块塞进底层四角，完成第一层。', (b) => this.solveCorners(b));
    this.stage('中层棱块', '把 4 个不含黄白的棱块插进中层，第二层完成。', (b) => this.solveMiddle(b));
    this.stage('顶层黄十字', '让顶面 4 个棱块的黄色朝上，形成黄十字。', (b) => this.solveYellowCross(b));
    this.stage('顶层角块归位', '把 4 个顶角移动到它们正确的位置（先不管朝向）。', (b) => this.solvePermuteCorners(b));
    this.stage('顶层角块定向', '原地把每个顶角的黄色拧到朝上。', (b) => this.solveOrientCorners(b));
    this.stage('顶层棱块归位', '循环顶层棱块到正确位置，整个魔方复原。', (b) => this.solvePermuteEdges(b));
    return { moves: this.moves, stages: this.stages, solved: isSolved(this.c) };
  }
}

// 宏BFS：在给定的宏动作集合上做广度优先搜索，找到使 goalFn 成立的序列。
// 顶层(最后一层)的状态空间很小，所以即便用几何模型也很快。
function geoHash(c) {
  let s = '';
  for (const cb of c) {
    s += key(cb.pos);
    for (const st of cb.stickers) s += st.color + key(st.dir);
    s += ';';
  }
  return s;
}
function llSearch(start, macros, goalFn, maxDepth) {
  if (goalFn(start)) return [];
  const seen = new Set([geoHash(start)]);
  let frontier = [{ c: start, path: [] }];
  for (let d = 0; d < maxDepth; d++) {
    const next = [];
    for (const node of frontier) {
      for (const mac of macros) {
        const nc = cloneCube(node.c);
        applyMoves(nc, mac.seq);
        const h = geoHash(nc);
        if (seen.has(h)) continue;
        seen.add(h);
        const np = node.path.concat(mac.seq);
        if (goalFn(nc)) return np;
        next.push({ c: nc, path: np });
      }
    }
    frontier = next;
  }
  return null;
}

// ---- 一些只读辅助 ----
function findPiece2(c, cols) { return findPiece(c, cols); }
const RIGHT_OF = { F: 'R', R: 'B', B: 'L', L: 'F' };
function slotFaces(pos) {
  // 中层槽 [±1,0,±1] 的两个相邻面，选 front 使 rightOf[front]=另一面
  const xFace = pos[0] === 1 ? 'R' : 'L';
  const zFace = pos[2] === 1 ? 'F' : 'B';
  if (RIGHT_OF[zFace] === xFace) return { front: zFace, rn: xFace };
  return { front: xFace, rn: zFace };
}
function COLOR_FOR_FACE(face) {
  const e = { F: 'G', B: 'B', R: 'R', L: 'O' };
  return e[face];
}
const U_EDGE_SLOTS = [[0, 1, 1], [1, 1, 0], [0, 1, -1], [-1, 1, 0]];
const U_CORNER_SLOTS = [[1, 1, 1], [-1, 1, 1], [1, 1, -1], [-1, 1, -1]];

function yellowEdgeUpCount(c) {
  let n = 0;
  for (const cb of c) {
    if (cb.pos[1] !== 1) continue;
    if (cb.stickers.length !== 2) continue; // 棱块
    const up = stickerAtDir(cb, UP);
    if (up && up.color === 'Y') n++;
  }
  return n;
}
function llCornerPositionedCount(c) {
  let n = 0;
  for (const slot of U_CORNER_SLOTS) {
    const cb = c.find((x) => key(x.pos) === key(slot));
    if (!cb) continue;
    // 该位置应有的三色
    const want = cb.pos.map((v, i) => v !== 0 ? FACE_COLOR[key(unit(i, v))] : null).filter(Boolean).sort().join('');
    const have = cb.stickers.map((s) => s.color).sort().join('');
    if (want === have) n++;
  }
  return n;
}
function llCornersPositioned(c) { return llCornerPositionedCount(c) === 4; }
function unit(i, v) { const a = [0, 0, 0]; a[i] = v; return a; }
function cornerUFRyellowUp(c) {
  const cb = c.find((x) => key(x.pos) === key([1, 1, 1]));
  const up = stickerAtDir(cb, UP);
  return up && up.color === 'Y';
}
function llTopAligned(c) {
  // 顶层四角是否在正确位置且面色对齐（用于 AUF 收尾判断）
  for (const slot of U_CORNER_SLOTS) {
    const cb = c.find((x) => key(x.pos) === key(slot));
    for (const s of cb.stickers) if (FACE_COLOR[key(s.dir)] !== s.color) {
      if (key(s.dir) !== key(UP)) return false; // 侧面没对齐
    }
  }
  return true;
}
function solvedStickerCount(c) {
  let n = 0;
  for (const cb of c) for (const s of cb.stickers) if (FACE_COLOR[key(s.dir)] === s.color) n++;
  return n;
}

export function solve(cubies) {
  return new Solver(cubies).run();
}
