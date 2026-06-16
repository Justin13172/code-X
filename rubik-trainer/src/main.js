// main.js — 把 3D 魔方、课程、求解器串起来
import { Cube3D } from './cube3d.js';
import { LESSONS } from './lessons.js';
import { solve } from './solverLBL.js';
import { makeSolvedCube, scramble, isSolved } from './cubeModel.js';
import { buildFaceButtons, setRoute, sleep, LESSON_ROUTE } from './ui.js';

const $ = (sel) => document.querySelector(sel);
const cube = new Cube3D($('#cube'));

const subtitleEl = $('#subtitle');
const setSubtitle = (t) => { subtitleEl.innerHTML = t || ''; };

let busy = false;            // 防止演示重叠
const SPEEDS = [['慢', 0.5], ['正常', 1], ['快', 2.2]];
let speedIdx = 1;
cube.speed = SPEEDS[speedIdx][1];

// ---------- 手动转面 ----------
buildFaceButtons($('#manual-faces'), async (m) => {
  if (busy) return;
  await cube.play(m);
});

$('#manual button[data-act="speed"]').addEventListener('click', (e) => {
  speedIdx = (speedIdx + 1) % SPEEDS.length;
  cube.speed = SPEEDS[speedIdx][1];
  e.target.textContent = '速度：' + SPEEDS[speedIdx][0];
});
$('#manual button[data-act="resetView"]').addEventListener('click', () => cube.resetView());
$('#manual button[data-act="solved"]').addEventListener('click', () => {
  if (busy) return;
  cube.resetState();
  setSubtitle('已恢复成还原状态。');
});

// ---------- 标签切换 ----------
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.tabpane').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $('#' + t.dataset.tab).classList.add('active');
  });
});

// ---------- 学习模式 ----------
const select = $('#lesson-select');
LESSONS.forEach((l, i) => {
  const o = document.createElement('option');
  o.value = i; o.textContent = l.title;
  select.appendChild(o);
});
let lessonIdx = 0;
let beatIdx = 0;

function renderLesson() {
  const l = LESSONS[lessonIdx];
  select.value = lessonIdx;
  $('#principle').innerHTML = l.html;
  setRoute(LESSON_ROUTE[l.id] ?? 0);
  beatIdx = 0;
  setSubtitle('点「播放本节演示」看动态讲解，或「下一拍」逐拍看。');
}
select.addEventListener('change', () => { lessonIdx = Number(select.value); renderLesson(); });
$('#prev-lesson').addEventListener('click', () => { lessonIdx = (lessonIdx + LESSONS.length - 1) % LESSONS.length; renderLesson(); });
$('#next-lesson').addEventListener('click', () => { lessonIdx = (lessonIdx + 1) % LESSONS.length; renderLesson(); });

async function runBeat(b) {
  if (b.reset) cube.resetState();
  if (b.apply) cube.applyInstant(b.apply);
  if (b.highlight) cube.highlightPieces(b.highlight);
  setSubtitle(b.say || '');
  if (b.do) await cube.play(b.do);
  else await sleep(800);
}

$('#play-demo').addEventListener('click', async () => {
  if (busy) return;
  busy = true; $('#play-demo').disabled = true;
  const l = LESSONS[lessonIdx];
  for (const b of l.beats) { await runBeat(b); await sleep(550); }
  cube.clearHighlight();
  setSubtitle('本节演示结束。可以自己用下面的按钮转一转，或进入下一节。');
  busy = false; $('#play-demo').disabled = false;
});

$('#next-beat').addEventListener('click', async () => {
  if (busy) return;
  const l = LESSONS[lessonIdx];
  if (beatIdx >= l.beats.length) { beatIdx = 0; cube.clearHighlight(); setSubtitle('已到本节最后一拍，从头再看一遍可点「播放」。'); return; }
  busy = true;
  await runBeat(l.beats[beatIdx]);
  beatIdx++;
  busy = false;
});

// ---------- 练习模式 ----------
const pstatus = $('#practice-status');
let steps = [];      // 扁平化后的逐步还原步骤
let stepPtr = 0;

function buildSolution() {
  const sol = solve(cube.model);
  steps = [];
  for (const st of sol.stages) {
    for (const m of st.moves) steps.push({ m, stage: st.name, desc: st.desc });
  }
  stepPtr = 0;
  return sol;
}

$('#scramble').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  cube.clearHighlight();
  cube.resetState();
  const seq = scramble(makeSolvedCube(), 20); // 仅借它生成一段随机序列
  setSubtitle('正在打乱……');
  const prev = cube.speed; cube.speed = 2.4;
  await cube.play(seq);
  cube.speed = prev;
  setSubtitle('打乱完成！点「自动演示复原」看一遍，或「跟我练」一步步来。');
  steps = []; stepPtr = 0;
  $('#next-step').disabled = true;
  pstatus.innerHTML = '打乱序列：<code>' + seq.join(' ') + '</code>';
  busy = false;
});

$('#auto-solve').addEventListener('click', async () => {
  if (busy) return;
  if (isSolved(cube.model)) { setSubtitle('魔方已经是还原状态啦，先点「打乱」。'); return; }
  busy = true;
  const sol = buildSolution();
  for (const st of sol.stages) {
    if (!st.moves.length) continue;
    setSubtitle(`【${st.name}】${st.desc}`);
    pstatus.innerHTML = `<span class="stage-name">${st.name}</span><br>${st.desc}`;
    await cube.play(st.moves);
    await sleep(350);
  }
  cube.clearHighlight();
  setSubtitle('复原完成！🎉 再点「打乱」练一遍，建议改用「跟我练」自己动手。');
  pstatus.innerHTML = '✅ 已复原。';
  busy = false;
});

$('#follow').addEventListener('click', () => {
  if (busy) return;
  if (isSolved(cube.model)) { setSubtitle('魔方已还原，先点「打乱」。'); return; }
  buildSolution();
  setSubtitle('跟我练：看提示，点「下一步 ›」一步步转。');
  $('#next-step').disabled = false;
  showStep();
});

function showStep() {
  if (stepPtr >= steps.length) {
    pstatus.innerHTML = '✅ 全部完成，魔方复原！';
    setSubtitle('太棒了，你跟着走完了一整次复原 🎉');
    $('#next-step').disabled = true;
    return;
  }
  const s = steps[stepPtr];
  const remainInStage = steps.filter((x, i) => i >= stepPtr && x.stage === s.stage).length;
  pstatus.innerHTML =
    `<span class="stage-name">${s.stage}</span>（本阶段还剩 ${remainInStage} 步）<br>` +
    `<span style="color:var(--muted)">${s.desc}</span><br><br>` +
    `下一步：<span class="nextmove">${s.m}</span>　（共 ${steps.length - stepPtr} 步）`;
}

$('#next-step').addEventListener('click', async () => {
  if (busy || stepPtr >= steps.length) return;
  busy = true; $('#next-step').disabled = true;
  await cube.play(steps[stepPtr].m);
  stepPtr++;
  busy = false; $('#next-step').disabled = false;
  showStep();
});

// 初始化
renderLesson();
