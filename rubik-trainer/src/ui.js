// ui.js — 一些纯 DOM 辅助
export const FACE_MOVES = ['U', "U'", 'F', "F'", 'R', "R'", 'L', "L'", 'D', "D'", 'B', "B'"];

// 每节课对应"学习路线"进度条的第几格
export const LESSON_ROUTE = {
  anatomy: 0, notation: 1, overview: 2,
  cross: 2, firstlayer: 2, middle: 3,
  yellowcross: 4, lastlayer: 4,
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function buildFaceButtons(container, onMove) {
  container.innerHTML = '';
  for (const m of FACE_MOVES) {
    const b = document.createElement('button');
    b.textContent = m;
    b.title = `转动 ${m}`;
    b.addEventListener('click', () => onMove(m));
    container.appendChild(b);
  }
}

export function setRoute(k) {
  document.querySelectorAll('#route li').forEach((li) => {
    li.classList.toggle('on', Number(li.dataset.k) === k);
  });
}
