'use strict';

// ===== 지도 파일을 읽어 칸 지도로 보여주기 (진행 상태와 명령은 game.js) =====
const $ = s => document.querySelector(s);

let MAP = null;
let selected = null;

const neighbors = c => neighborsOf(MAP, c);
const factionOf = c => MAP.factions.find(f => f.id === c.faction);

// ===== 화면 그리기 =====
// 지도 한 장을 el 안에 그린다. 메인 화면과 세력 선택 화면이 같이 쓴다.
//   opts.selectedId: 고른 성   opts.homeId: 내 장수가 있는 성
//   opts.focusFaction: 이 세력 성만 밝게   opts.onClick(c): 성을 눌렀을 때
function drawMap(el, opts = {}) {
  el.style.gridTemplateColumns = `repeat(${MAP.cols}, var(--cell))`;
  const sel = opts.selectedId && MAP.cities.find(c => c.id === opts.selectedId);
  const near = sel ? neighbors(sel).map(c => c.id) : [];
  el.innerHTML = '';
  for (let y = 0; y < MAP.rows; y++) {
    for (let x = 0; x < MAP.cols; x++) {
      const c = MAP.cities.find(c => c.x === x && c.y === y);
      const div = document.createElement('div');
      div.className = 'cell';
      if (c) {
        const f = factionOf(c);
        div.classList.add('city');
        if (!f) div.classList.add('empty');
        else div.style.background = f.color;
        if (c === sel) div.classList.add('sel');
        if (near.includes(c.id)) div.classList.add('near');
        if (c.id === opts.homeId) div.classList.add('home');
        if (opts.focusFaction && c.faction !== opts.focusFaction) div.classList.add('faded');
        div.innerHTML = `<span class="name">${c.name}</span><span class="grade">${'★'.repeat(c.grade)}</span>`;
        div.title = `${c.name} (${f ? f.name : '공백지'} · ${GRADE_NAME[c.grade]})`;
        if (opts.onClick) div.onclick = () => opts.onClick(c);
      }
      el.appendChild(div);
    }
  }
  if (typeof applyMapBg === 'function') applyMapBg(el); // 도트 배경 (mapbg.js)
}

// 메인 화면 지도
function render() {
  drawMap($('#map'), {
    selectedId: selected && selected.id,
    homeId: homeCityId(),
    onClick: c => { selected = selected === c ? null : c; render(); },
  });
  renderInfo();
}

function renderInfo() {
  const box = $('#info');
  // 아무 성도 안 골랐으면 내 장수가 있는 성을 보여준다
  const c = selected || (homeCityId() && MAP.cities.find(o => o.id === homeCityId()));
  if (!c) { box.innerHTML = '<h2>성 정보</h2><p class="dim">성을 클릭하면 정보가 나와요.</p>'; return; }
  const f = factionOf(c);
  box.innerHTML = `
    <h2>성 정보</h2>
    <table class="stats">
      <tr><th>이름</th><td>${c.name}</td></tr>
      <tr><th>세력</th><td>${f ? `<span class="swatch" style="background:${f.color}"></span>${f.name}` : '<span class="dim">공백지</span>'}</td></tr>
      <tr><th>규모</th><td>${GRADE_NAME[c.grade]} <span class="grade">${'★'.repeat(c.grade)}</span></td></tr>
      <tr class="wide"><th>이웃</th><td>${neighbors(c).map(n => n.name).join(' · ')}</td></tr>
      ${cityDetailRows(c)}
    </table>`;
}

let legendPick = null; // 세력 창에서 눌러 특성을 펼쳐 본 세력
function renderLegend() {
  const count = id => MAP.cities.filter(c => c.faction === id).length;
  // 멸망한 세력(성이 하나도 없는 세력)은 목록에서 뺀다. 세력을 누르면 아래에 그 세력 특성이 보인다 (다시 누르면 접힘)
  const rows = MAP.factions.filter(f => count(f.id) > 0).map(f =>
    `<li data-f="${f.id}" class="pickable${f.id === legendPick ? ' on' : ''}" title="눌러서 세력 특성 보기"><span class="swatch" style="background:${f.color}"></span>${f.name} <span class="cnt">${count(f.id)}</span></li>`);
  rows.push(`<li><span class="swatch" style="background:var(--empty)"></span>공백지 <span class="cnt">${count('')}</span></li>`);
  $('#legend').innerHTML = rows.join('');
  $('#legend').querySelectorAll('[data-f]').forEach(li => { li.onclick = () => { legendPick = legendPick === li.dataset.f ? null : li.dataset.f; renderLegend(); }; });
  const box = $('#legendTrait');
  if (!box) return;
  // 누른 세력: 첫 줄 이름(장수 수), 둘째 줄 특성 이름, 셋째 줄 특성 설명
  const f = legendPick && MAP.factions.find(x => x.id === legendPick), t = f && FACTION_TRAITS[f.name];
  const members = f && typeof S !== 'undefined' && S ? Object.values(S.generals).filter(g => g.faction === f.id).length : 0;
  box.innerHTML = !f ? '세력을 누르면 정보가 보여요.'
    : `<b>${f.name} (${members}명)</b><br><b>특성</b> : ${t ? t.name : '없음'}${t ? `<br>${t.desc}` : ''}`;
}

function renderCheck() {
  const box = $('#check');
  const lost = findIsolated(MAP);
  // 검사는 늘 하지만, 게임 화면에는 문제가 있을 때만 보여준다 (평소 표시는 지도 편집기에서)
  box.hidden = lost.length === 0;
  box.className = 'bad';
  box.textContent = `✘ 지도에 떨어진 성이 있어요: ${lost.map(c => c.name).join(', ')}`;
}

// ===== 지도 불러오기 =====
function start(data) {
  MAP = data;
  selected = null;
  renderCheck();
  renderLegend();
  onMapReady(); // 어느 화면을 보여줄지는 game.js가 정한다
}

// 지도는 data/map_190.js에 들어 있다 (서버가 쓰는 지도와 같은 파일에서 만든다: supabase/build.sh).
// 따로 읽어 오지 않으니 파일을 더블클릭해 열어도, 웹에서 열어도 늘 같은 지도가 바로 뜬다
// (game.js까지 다 읽은 뒤에 시작한다)
addEventListener('DOMContentLoaded', () => start(JSON.parse(JSON.stringify(MAP_DATA))));
