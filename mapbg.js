'use strict';

// ===== 지도 도트 배경 (2026-10-25) =====
// 그림 파일 없이 코드로 그린다: 바다·황하·장강·한수·회수·산·사막·만리장성, 중원 논밭·나무, 강남 숲.
// 좌표는 "칸" 단위 (가로 0~cols, 세로 0~rows). 검토용 원본은 preview/map_bg.html
const MAP_BG_TONE = 'dark'; // dark(지금 화면과 어울림) / old(고지도) / green(자연색)
const MAP_BG_DIM = 0.3;     // 배경 위에 덮는 어두운 막 (0 = 그대로, 높을수록 어둡게. 2026-10-25 시선을 덜 끌게)
// 한 도트 = P 화면 픽셀
const P = 6;
const PALETTES = {
  dark:  { sea: '#0d1a2e', sea2: '#12233d', foam: '#1e3656', river: '#2c5e8e', north: '#2e1d10', north2: '#352213', south: '#1d2410', south2: '#232c13',
           sand: '#3d2f17', sand2: '#463619', mount: '#4a3a2a', mountHi: '#6b5844', snow: '#8a7c6a', wall: '#7a6a50',
           tree: '#1f3a14', treeHi: '#2f5420', trunk: '#3a2410', roof: '#7a2a1a', roofHi: '#9a3a22', house: '#8a7458', field: '#4a3a16', field2: '#5a4a1c' },
  old:   { sea: '#7d9aa6', sea2: '#8aa7b0', foam: '#a9c0c4', river: '#5f8ea6', north: '#cdb488', north2: '#c5aa7c', south: '#b9b57f', south2: '#afaa74',
           sand: '#dcc794', sand2: '#e3cf9e', mount: '#8f7553', mountHi: '#a88c66', snow: '#efe6d0', wall: '#6b4f33',
           tree: '#5f7a3a', treeHi: '#7a9450', trunk: '#6b4f33', roof: '#a8432a', roofHi: '#c25a3a', house: '#efe2c0', field: '#d9c27a', field2: '#c8b066' },
  green: { sea: '#1f4a7a', sea2: '#24548a', foam: '#3d6fa6', river: '#4f8fd0', north: '#7a6a3a', north2: '#837341', south: '#3f6a2f', south2: '#467536',
           sand: '#b59a5c', sand2: '#bea566', mount: '#6a5a48', mountHi: '#8a7860', snow: '#e8e4dc', wall: '#5a4630',
           tree: '#244a1c', treeHi: '#356a28', trunk: '#4a3018', roof: '#9a3020', roofHi: '#b84430', house: '#d8cbb0', field: '#a08a3a', field2: '#b09a44' },
};

// 깨알 그림 (도트 단위 모양): 글자 하나 = 도트 하나, 점은 비움
const SPRITES = {
  tree:  { w: 3, rows: ['.H.', 'HTT', 'TTT', '.k.'], col: { H: 'treeHi', T: 'tree', k: 'trunk' } },
  pine:  { w: 3, rows: ['.T.', 'HTT', '.T.', 'TTT', '.k.'], col: { H: 'treeHi', T: 'tree', k: 'trunk' } },
  house: { w: 4, rows: ['.RR.', 'RrrR', 'WWWW', 'WkWW'], col: { R: 'roof', r: 'roofHi', W: 'house', k: 'trunk' } },
  field: { w: 4, rows: ['ffff', 'gggg', 'ffff'], col: { f: 'field', g: 'field2' } },
};

// 결정된 무작위 (새로고침해도 같은 그림)
const hash = (x, y) => { let h = x * 374761393 + y * 668265263; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967295; };

// 해안선: 세로 위치 v에서 이보다 오른쪽은 바다 (도시 칸은 피해서)
const COAST = [[0, 9], [1.9, 9], [2.0, 7.05], [2.95, 7.05], [3.05, 9], [4.95, 9], [5.05, 7.0], [6.95, 7.0], [7.05, 9], [8.9, 9], [9.0, 7.6], [10, 6.6]];
function coastX(v) {
  for (let i = 1; i < COAST.length; i++) {
    const [v0, x0] = COAST[i - 1], [v1, x1] = COAST[i];
    if (v <= v1) return x0 + (x1 - x0) * (v - v0) / (v1 - v0);
  }
  return 9;
}
// 강: 꺾은선 (칸 좌표)
const RIVERS = [
  { w: 0.14, pts: [[3.1, 2.4], [4.0, 2.55], [4.8, 2.75], [5.5, 3.0], [6.3, 3.3], [6.8, 2.9], [7.1, 2.6]] },                                        // 황하 (빈 칸을 지나게: 낙양 위 → 업·복양 사이 → 바다)
  { w: 0.16, pts: [[3.2, 7.0], [4.0, 7.05], [4.5, 7.4], [5.0, 7.05], [5.5, 6.6], [6.0, 6.95], [6.6, 7.0], [7.0, 6.9]] },                         // 장강 (강릉 → 강하 아래 빈 칸 → 시상·여강 사이 → 바다)
  { w: 0.1, pts: [[2.5, 4.3], [2.75, 4.7], [3.0, 5.2], [3.0, 5.9], [2.6, 6.5], [2.9, 6.95], [3.2, 7.0]] },                                    // 한수 (상용·신야 사이 → 장강)
  { w: 0.1, pts: [[4.2, 5.6], [4.6, 5.3], [5.2, 4.9], [5.6, 4.7], [6.0, 4.95], [6.6, 5.0], [7.1, 5.3]] },                                     // 회수 (허창 아래 → 소패·수춘 사이 → 바다)
];
const WALL = [[0.2, 1.95], [1.2, 1.4], [2.4, 0.95], [3.6, 0.92], [4.8, 0.95], [6.0, 0.88], [7.6, 0.8]];
function distSeg(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
const near = (u, v, pts, w) => pts.some((p, i) => i && distSeg(u, v, pts[i - 1], p) < w);
// 강: 시작(상류)은 가늘고 하류(바다·합류 지점)로 갈수록 굵어진다 (시작에서 굵기의 40%)
function onRiver(u, v, rv, extra = 0) {
  const lens = rv.pts.slice(1).map((p, i) => Math.hypot(p[0] - rv.pts[i][0], p[1] - rv.pts[i][1]));
  const total = lens.reduce((a, b) => a + b, 0);
  let done = 0;
  for (let i = 1; i < rv.pts.length; i++) {
    const [ax, ay] = rv.pts[i - 1], [bx, by] = rv.pts[i], dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
    const along = (done + t * lens[i - 1]) / total;
    if (Math.hypot(u - ax - t * dx, v - ay - t * dy) < rv.w * (0.4 + 0.6 * along) + extra) return true;
    done += lens[i - 1];
  }
  return false;
}
// 산맥 지역 (얼마나 산이 많은지 0~1)
function mountainness(u, v) {
  let m = 0;
  if (u < 1.1 && v > 1.6 && v < 5.3) m = Math.max(m, 0.55);                       // 서쪽 고원 (농서·익주 북쪽)
  if (v > 3.6 && v < 4.15 && u > 0.8 && u < 3.1) m = Math.max(m, 0.7);            // 진령 (장안 ↔ 한중)
  if (Math.abs(u - 4.55) < 0.28 && v > 0.9 && v < 2.6) m = Math.max(m, 0.6);      // 태항산
  if (u > 1.0 && u < 2.9 && v > 5.0 && v < 6.6) m = Math.max(m, 0.45);            // 파산·무당산
  if (v > 8.3 && u < 2.9) m = Math.max(m, 0.5);                                    // 운귀 고원
  if (u > 4.9 && u < 6.9 && v > 7.9 && v < 9.8) m = Math.max(m, 0.45);            // 무이산
  return m;
}

function paintBg(kind, w, h) {
  const pal = PALETTES[kind];
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const cell = w / MAP.cols;
  const nx = Math.ceil(w / P), ny = Math.ceil(h / P);
  const mountTiles = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = (i + 0.5) * P / cell, v = (j + 0.5) * P / cell, r = hash(i, j);
      let col;
      const cx = coastX(v) + (hash(j, 7) - 0.5) * 0.12;
      if (u > cx) {
        col = u < cx + 0.12 ? pal.foam : (r < 0.15 ? pal.sea2 : pal.sea);
      } else if (near(u, v, WALL, 0.05) && (i + j) % 2 === 0) {
        col = pal.wall;
      } else if (RIVERS.some(rv => onRiver(u, v, rv))) {
        col = pal.river;
      } else if (v < 0.85 || (u < 2.2 && v < 1.55)) {
        col = r < 0.3 ? pal.sand2 : pal.sand;                                         // 북쪽 초원·사막
      } else if (v < 5.4 + (hash(i, 3) - 0.5) * 0.6) {
        col = r < 0.25 ? pal.north2 : pal.north;                                      // 황토 (화북)
      } else {
        col = r < 0.25 ? pal.south2 : pal.south;                                      // 강남
      }
      g.fillStyle = col;
      g.fillRect(i * P, j * P, P, P);
      if (u <= cx && !RIVERS.some(rv => onRiver(u, v, rv, 0.12)) && r < mountainness(u, v) * 0.04 && !mountTiles.some(([a, b]) => Math.abs(a - i) < 5 && Math.abs(b - j) < 4)) mountTiles.push([i, j]); // 드문드문: 봉우리끼리 띄운다
    }
  }
  // 산: 도트 3줄짜리 작은 봉우리
  for (const [i, j] of mountTiles) {
    const x = i * P, y = j * P;
    g.fillStyle = pal.mount;
    g.fillRect(x - P, y + P, P * 3, P);
    g.fillRect(x, y, P, P);
    g.fillStyle = pal.mountHi;
    g.fillRect(x - P, y + P, P, P);
    g.fillStyle = pal.snow;
    if (hash(j, i) < 0.4) g.fillRect(x, y, P, P);
  }
  // 깨알 요소: 서량·촉(서쪽 u < 2.5)은 그대로 두고, 중원엔 논밭과 나무, 강남엔 숲
  const used = new Set();
  const free = (i, j, w, h) => { for (let a = -1; a <= w; a++) for (let b = -1; b <= h; b++) if (used.has(`${i + a},${j + b}`)) return false; return true; };
  const put = (name, i, j) => {
    const s = SPRITES[name], h = s.rows.length;
    if (!free(i, j, s.w, h)) return;
    // 그림이 바다·강·산에 걸리지 않게 네 귀퉁이를 확인
    for (const [a, b] of [[0, 0], [s.w - 1, 0], [0, h - 1], [s.w - 1, h - 1]]) {
      const u = (i + a + 0.5) * P / cell, v = (j + b + 0.5) * P / cell;
      if (u > coastX(v) - 0.1 || RIVERS.some(rv => onRiver(u, v, rv, 0.06)) || mountainness(u, v) > (name === 'tree' || name === 'pine' ? 0.5 : 0)) return; // 나무는 낮은 산에도
    }
    s.rows.forEach((row, b) => [...row].forEach((ch, a) => {
      if (ch === '.') return;
      g.fillStyle = pal[s.col[ch]];
      g.fillRect((i + a) * P, (j + b) * P, P, P);
    }));
    for (let a = 0; a < s.w; a++) for (let b = 0; b < h; b++) used.add(`${i + a},${j + b}`);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u = (i + 0.5) * P / cell, v = (j + 0.5) * P / cell, r = hash(i + 101, j + 57);
      if (u < 2.5 || v < 1.1) continue;
      if (v < 5.4) { // 중원: 논밭과 나무
        if (r < 0.03) put('field', i, j);
        else if (r < 0.07) { put('tree', i, j); if (hash(i, j + 9) < 0.4) put('tree', i + 3, j + 1); }
      } else {       // 강남: 숲(나무 여럿)과 가끔 논밭
        if (r < 0.09) { put(r < 0.04 ? 'pine' : 'tree', i, j); if (hash(i, j + 4) < 0.7) put('tree', i + 3, j + 2); if (hash(i + 2, j) < 0.5) put('pine', i - 3, j + 3); }
        else if (r < 0.1) put('field', i, j);
      }
    }
  }
  if (MAP_BG_DIM) { g.fillStyle = `rgba(8, 3, 1, ${MAP_BG_DIM})`; g.fillRect(0, 0, w, h); } // 전체를 살짝 어둡게
  return cv.toDataURL();
}

// 지도 칸 영역에 배경을 깐다. 같은 크기면 한 번 그린 그림을 다시 쓴다
// 칸 크기는 화면에 실제로 그려진 지도 너비에서 잰다 (2026-10-30: 휴대폰은 --cell이 화면 너비로 계산되는 식이라 숫자로 읽히지 않아 PC 크기 58로 그려져 어긋났다).
// 지도 크기가 바뀌면(탭 전환·화면 돌리기·창 크기) 다시 깐다
const bgCache = {};
function applyMapBg(el) {
  if (!el._bgWatch && typeof ResizeObserver === 'function') {
    el._bgWatch = new ResizeObserver(() => applyMapBg(el));
    el._bgWatch.observe(el);
  }
  const plain = el.querySelector('.cell:not(.city)'); // 성이 아닌 빈칸은 테두리·여백 없이 딱 한 칸 크기
  const cellPx = plain ? plain.getBoundingClientRect().width : 0;
  if (!(cellPx > 0)) return; // 숨겨진 탭이라 아직 크기가 없다: 보일 때 다시 온다
  const w = cellPx * MAP.cols, h = cellPx * MAP.rows, key = `${MAP_BG_TONE}:${w}x${h}`;
  if (el._bgKey === key) return; // 이미 이 크기로 깔려 있다
  el._bgKey = key;
  if (!bgCache[key]) bgCache[key] = paintBg(MAP_BG_TONE, w, h);
  el.classList.add('bg');
  el.style.backgroundImage = `url(${bgCache[key]})`;
  el.style.backgroundOrigin = 'content-box';
  el.style.backgroundClip = 'content-box';
  el.style.backgroundSize = `${w}px ${h}px`;
  el.style.backgroundRepeat = 'no-repeat';
}
