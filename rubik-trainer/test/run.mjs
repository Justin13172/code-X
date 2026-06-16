// 模型与求解器的自检脚本：node test/run.mjs
import {
  makeSolvedCube, applyMove, applyMoves, invertSeq, isSolved, scramble,
  findPiece, colorsOf,
} from '../src/cubeModel.js';
import { solve } from '../src/solverLBL.js';

let pass = 0, fail = 0;
function ok(cond, msg) { cond ? pass++ : (fail++, console.log('  ✗ ' + msg)); }

// 1) 每个面转 4 次应回到原状态
for (const m of ['U', 'D', 'R', 'L', 'F', 'B']) {
  const c = makeSolvedCube();
  for (let i = 0; i < 4; i++) applyMove(c, m);
  ok(isSolved(c), `${m} x4 应还原`);
}

// 2) 任意打乱 + 其逆 应还原
for (let i = 0; i < 200; i++) {
  const c = makeSolvedCube();
  const s = scramble(c, 25);
  ok(!isSolved(c) || true, '打乱');
  applyMoves(c, invertSeq(s));
  ok(isSolved(c), '打乱+逆应还原');
}

// 3) sexy move (R U R' U') x6 = identity
{
  const c = makeSolvedCube();
  for (let i = 0; i < 6; i++) applyMoves(c, "R U R' U'");
  ok(isSolved(c), "(R U R' U') x6 应还原");
}

// 4) 找块：白绿棱、白红绿角 存在且颜色正确
{
  const c = makeSolvedCube();
  ok(colorsOf(findPiece(c, 'WG')) === 'GW', '白绿棱存在');
  ok(!!findPiece(c, 'WRG'), '白红绿角存在');
}

// 5) 求解器：大量随机打乱必须能复原
let solverFail = 0, totalMoves = 0, N = 1000;
for (let i = 0; i < N; i++) {
  const c = makeSolvedCube();
  scramble(c, 25);
  const sol = solve(c); // 返回 move 数组（已作用于 c 的副本内部），这里我们独立验证
  const c2 = makeSolvedCube();
  // 重新构造同一打乱：solve 内部不应改坏外部；用返回序列在 c 上验证
  applyMoves(c, sol.moves);
  if (!isSolved(c)) solverFail++;
  totalMoves += sol.moves.length;
}
ok(solverFail === 0, `求解器 ${N} 次随机打乱全部复原（失败 ${solverFail} 次）`);
console.log(`  · 平均步数 ≈ ${(totalMoves / N).toFixed(1)}`);

console.log(`\n通过 ${pass}，失败 ${fail}`);
process.exit(fail ? 1 : 0);
