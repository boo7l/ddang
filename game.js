'use strict';

// ===== 화면 =====
// 게임 계산은 engine.js, 규칙과 숫자는 rules.js, 지도 그리기는 map.js에 있다. 여기는 화면이다.
let MY_ID = null;     // 내 계정 id (서버 계정)
let IS_ADMIN = false; // 개발자 도구를 쓸 수 있는 계정인지 (서버가 알려 준다)
const me = () => S.generals[MY_ID];
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const fmtLeft = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

// ===== 서버와 주고받기 =====
// 세계는 서버에 있다. 무슨 일을 하든 서버에 요청하고, 서버가 돌려준 "내가 볼 수 있는 세계"로 화면을 다시 그린다.
let ORIGIN = null;  // 지도 파일에 적힌 처음 성 주인 (새 시즌이면 여기로 되돌린다)
let lastFetch = 0;  // 마지막으로 서버에서 받아 온 시각
let busy = false;   // 서버 요청 중

function applyView(d) {
  S = d.view || null;
  if (S) S.timeOffset += d.serverNow - Date.now(); // 내 컴퓨터 시계를 서버 시계에 맞춘다
  IS_ADMIN = !!d.admin;
  $('#adminBtn').hidden = !IS_ADMIN;
  // 오른쪽 위 순위 단추에 내 순위를 함께 (세계를 받아 올 때마다 새로)
  const myRank = S && me() ? meritRanking().findIndex(g => g.name === me().name && g.faction === me().faction) + 1 : 0;
  $('#rankBtn').textContent = myRank ? `🏆 순위 (${myRank}위)` : '🏆 순위';
  ACCOUNTS = d.accounts || {};
  lastFetch = Date.now();
  if (!ORIGIN) ORIGIN = MAP.cities.map(c => c.faction);
  MAP.cities.forEach((c, i) => { c.faction = ORIGIN[i]; });
  if (S) applyOwners();
}

// 서버에 요청하고 세계를 받아 온다. 성공하면 true (실패 이유는 알림 창으로)
async function call(action, payload = {}) {
  busy = true;
  try {
    const d = await api(action, payload);
    applyView(d);
    if (d.error) { alert(d.error); return false; }
    return true;
  } catch (e) {
    alert('서버와 연결하지 못했어요: ' + (e.message || e));
    return false;
  } finally {
    busy = false;
  }
}

// ===== 천하통일 화면 =====
let celebrated = false; // 이번에 페이지를 연 뒤 축하 화면을 띄웠는지
// u를 주면 그 내용으로 보여 준다 (개발자 도구의 미리 보기: 진행 상태는 바꾸지 않는다)
function unifyDialog(u = S.unified) {
  const f = factionById(u.faction);
  const rows = meritRanking().map((g, i) => `<tr><td class="num">${i + 1}</td><td>${esc(g.name)}</td>
    <td>${g.faction ? `<span class="swatch" style="background:${factionById(g.faction).color}"></span>${esc(factionById(g.faction).name)}` : '<span class="dim">재야</span>'}</td><td class="num">${fmt(g.merit)}</td></tr>`).join('');
  openModal(`
    <h2>🏆 천하통일</h2>
    <p class="unifyHead"><span class="swatch" style="background:${f.color}"></span><b class="hi">${esc(f.name)}</b> 세력이 천하를 손에 넣었습니다!</p>
    <p class="dim">${RULES.startYear}년 ${RULES.startMonth}월 → ${dateText(u.turn)} (${u.turn}달)</p>
    <h3>공적 순위</h3>
    <table class="stats rank"><tr><th>순위</th><th>장수</th><th>세력</th><th>공적</th></tr>${rows}</table>
    <p class="dim">이번 시즌은 여기서 끝났어요. 다음 시즌을 기다려 주세요.</p>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`);
}

// ===== 관리자 보기 (개발자 도구) =====
// 모든 장수의 자세한 정보(아이디·금·예약)와 모든 세력의 채팅. 서버가 관리자에게만 보내 준다
let ACCOUNTS = {}; // 계정id → 아이디 (관리자만 받는다)
function adminDialog(tab = 'users', fid = null) {
  const gens = allGenerals().sort((a, b) => String(a.faction).localeCompare(String(b.faction)) || b.merit - a.merit);
  const fname = id => (id ? esc(factionById(id).name) : '<span class="dim">재야</span>');
  const swatch = id => (id ? `<span class="swatch" style="background:${factionById(id).color}"></span>` : '');
  const counts = {};
  gens.forEach(g => { counts[g.faction || ''] = (counts[g.faction || ''] || 0) + 1; });
  const tabs = `<div class="helpTabs">${[['users', '유저 목록'], ['chat', '세력 채팅']].map(([k, t]) =>
    `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  let body;
  if (tab === 'users') {
    const summary = Object.entries(counts).map(([f, n]) => `${swatch(f)}${fname(f)} ${n}명`).join(' · ') || '장수가 없어요.';
    const rows = gens.map(g => `<tr><td>${esc(ACCOUNTS[g.id] || '?')}</td><td>${esc(g.name)}</td><td>${swatch(g.faction)}${fname(g.faction)}</td>
      <td>${g.city ? esc(cityById(g.city).name) : '-'}</td><td class="num">${g.unitType ? `${g.unitType} ` : ''}${fmt(g.troops)}</td>
      <td class="num">${fmt(g.gold || 0)}</td><td class="num">${fmt(g.merit)}</td>
      <td>${(g.queue || []).filter(Boolean).map(o => esc(orderLabel(o))).join(', ') || '<span class="dim">없음</span>'}</td></tr>`).join('');
    body = `<p>${summary} <span class="dim">(모두 ${gens.length}명)</span></p>
      <div class="adminScroll"><table class="stats rank"><tr><th>아이디</th><th>장수</th><th>세력</th><th>위치</th><th>병력</th><th>금</th><th>공적</th><th>예약</th></tr>${rows}</table></div>`;
  } else {
    // 채팅이 있거나 장수가 있는 세력만
    const fs = MAP.factions.filter(f => chatOf(f.id).length || counts[f.id]);
    fid = fid || (fs[0] && fs[0].id);
    const list = fid ? chatOf(fid) : [];
    body = `<div class="picks">${fs.map(f => `<button class="pick${f.id === fid ? ' on' : ''}" data-f="${f.id}">${swatch(f.id)}${esc(f.name)} <span class="dim">${chatOf(f.id).length}</span></button>`).join('') || '<p class="dim">채팅이 있는 세력이 없어요.</p>'}</div>
      <ul class="adminChat">${list.map(m => `<li><span class="t">${fmtTime(m.t)}</span><span class="who">${chatWho(m)}</span>${esc(m.text)}</li>`).join('') || '<li class="dim">아직 아무 말도 없어요.</li>'}</ul>`;
  }
  openModal(`<h2>👁 관리자 보기 <span class="dim small">· 새 정보는 1분마다 받아 와요</span></h2>${tabs}${body}
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => adminDialog(b.dataset.tab); });
    box.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => adminDialog('chat', b.dataset.f); });
  });
  $('#modalBox').classList.add('adminBox');
}

// ===== 관리 창 (관리자만, 어느 화면에서든 오른쪽 위 "🛠 관리") =====
// 장수가 없거나 세력에 들기 전에도 쓸 수 있다. 턴·시즌을 바꾸면 모든 장수에게 적용된다
function adminToolsDialog() {
  const state = !S ? '-' : S.unified ? '천하통일 (턴 멈춤)' : S.paused ? '⏸ 멈춤' : '흐르는 중';
  const ahead = S && Math.round(S.timeOffset / RULES.turnLength);
  openModal(`
    <h2>🛠 관리 <span class="dim small">· 관리자만 보여요</span></h2>
    <table class="stats">
      <tr><th>날짜</th><td>${S ? `${dateText(S.turn)} (${S.turn}턴)` : '-'} · ${state}</td></tr>
      <tr><th>시각</th><td>${S ? fmtTime(now()) : '-'}${ahead ? ` <span class="dim">(실제보다 ${ahead}턴 빠름)</span>` : ''}</td></tr>
      <tr><th>장수</th><td>${S ? allGenerals().length : 0}명</td></tr>
    </table>
    <p class="sub">턴 <span class="dim">(모든 장수에게 적용)</span></p>
    <p><button id="aPause">${S && S.paused ? '▶ 턴 다시 흐르기' : '⏸ 턴 멈추기'}</button>
       <button data-skip="1">+1턴</button> <button data-skip="5">+5턴</button> <button data-skip="12">+12턴</button></p>
    <p class="sub">보기</p>
    <p><button id="aView">👁 관리자 보기</button> <button id="aUnify">통일 미리 보기</button></p>
    <p class="sub">시즌·계정</p>
    <p><button id="aSeason">새 시즌 시작</button> <button id="aReset" class="danger">완전 초기화 (내 계정)</button></p>
    <p><a class="link" href="editor.html">▶ 지도 편집기 (내 컴퓨터에서만)</a></p>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelectorAll('[data-skip]').forEach(b => { b.onclick = async () => { await call('skip', { turns: +b.dataset.skip }); afterAdmin(); }; });
    $('#aPause').onclick = async () => { await call('pause'); afterAdmin(); };
    $('#aView').onclick = () => adminDialog();
    $('#aUnify').onclick = () => {
      const fid = (me() && me().faction) || (playable()[0] && playable()[0].id);
      unifyDialog({ faction: fid, turn: S.turn });
    };
    $('#aSeason').onclick = async () => {
      if (!confirm('새 시즌을 시작할까요?\n모든 장수와 진행 상황이 지워지고, 모두 장수 만들기부터 다시 해요. (계정은 그대로)\n새 시즌은 턴이 흐르는 상태로 시작해요.')) return;
      if (await call('newSeason')) location.reload();
    };
    $('#aReset').onclick = async () => {
      if (!confirm('완전히 초기화할까요?\n내 장수가 세계에서 빠지고, 내 계정(아이디)도 지워져 첫 화면으로 돌아가요.\n관리자 지정도 다시 해야 해요.')) return;
      await call('leave');
      try { await serverSignOut(); } catch (e) { /* 무시 */ }
      location.reload();
    };
  });
}
// 관리 창에서 무언가 바꾼 뒤: 게임 화면이면 다시 그리고, 관리 창도 새 상태로 다시 연다
function afterAdmin() {
  if (!$('#game').hidden && me() && me().faction) { render(); renderLegend(); renderAll(); }
  adminToolsDialog();
}

// ===== 공적 순위 (오른쪽 위 "🏆 순위") =====
// 모든 장수의 공적 순위. 세계를 새로 받아 올 때마다(턴이 바뀔 때, 1분마다) 최신으로 바뀐다
function rankDialog() {
  if (!S) return;
  const list = meritRanking();
  const rows = list.map((g, i) => {
    const mine = me() && g.name === me().name && g.faction === me().faction;
    return `<tr class="${mine ? 'mine' : ''}"><td class="num">${i + 1}</td><td>${esc(g.name)}</td>
      <td>${g.faction ? `<span class="swatch" style="background:${factionById(g.faction).color}"></span>${esc(factionById(g.faction).name)}` : '<span class="dim">재야</span>'}</td>
      <td class="num">${fmt(g.merit)}</td></tr>`;
  }).join('');
  openModal(`<h2>🏆 공적 순위 <span class="dim small">· ${dateText(S.turn)} · 장수 ${list.length}명</span></h2>
    ${list.length ? `<div class="adminScroll"><table class="stats rank members"><tr><th>순위</th><th>장수</th><th>세력</th><th>공적</th></tr>${rows}</table></div>` : '<p class="dim">아직 장수가 없어요.</p>'}
    <p class="dim">공적은 수련을 뺀 명령마다 쌓이고, 전투에 이기면 많이 쌓여요. 천하통일 때 이 순위로 시즌을 마무리해요.</p>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`);
}

// ===== 턴 =====
// 턴 처리는 서버가 한다. 여기서는 세계를 다시 받아 와서 그린다
async function refresh() {
  if (busy) return;
  await call('state');
  if (!S || $('#game').hidden) return;
  render();
  renderLegend();
  renderAll();
}

// ===== 예약표 =====
let slot = 0; // 예약표에서 고른 칸
const slotTime = i => nextTurn(now()) + i * RULES.turnLength;

// 고른 칸에 명령을 넣고, 다음 칸으로 넘어간다
let lastOrder = null; // 마지막으로 예약한 명령 ("빈 칸 채우기"에 쓴다)
async function reserve(order) {
  const at = slot;
  if (order.cmd !== 'resign') lastOrder = order;
  if (await call('order', { i: at, order })) slot = Math.min(at + 1, RULES.queueSize - 1);
  renderCommands();
}
async function clearSlot(i) {
  await call('order', { i, order: null });
  renderCommands();
}

// 방어 모드 (예약 없이 바로)
async function onDefense() {
  await call('defense');
  renderAll();
}

// ===== 명령 창 (작은 대화 상자) =====
function openModal(html, onMount) {
  $('#modalBox').innerHTML = html;
  $('#modal').hidden = false;
  $('#modalBox').querySelectorAll('[data-close]').forEach(b => { b.onclick = closeModal; });
  if (onMount) onMount($('#modalBox'));
}
function closeModal() { $('#modal').hidden = true; $('#modalBox').innerHTML = ''; $('#modalBox').classList.remove('wideBox', 'adminBox'); }

// 대화 상자 공통: 목록에서 하나 고르고 예약하기
function pickDialog(title, intro, opts, okText, onOk, extra = '') {
  openModal(`
    <h2>${title} <span class="dim small">· ${dateText(S.turn + 1 + slot)} (${fmtClock(slotTime(slot))}) 턴에 예약</span></h2>
    ${intro}
    ${opts ? `<div class="opts">${opts}</div>` : '<p class="bad">고를 수 있는 대상이 없어요. (이 턴에 있을 성 기준)</p>'}
    ${extra}
    <div class="modalBtns"><button data-close>취소</button><button id="mOk" class="main" disabled>${okText}</button></div>`, box => {
    box.querySelectorAll('input[name=tgt]').forEach(r => { r.onchange = () => { $('#mOk').disabled = false; }; });
    if (box.querySelector('input[name=tgt]:checked')) $('#mOk').disabled = false;
    $('#mOk').onclick = () => { const v = box.querySelector('input[name=tgt]:checked'); if (onOk(v.value, box) !== false) closeModal(); };
  });
}

// 성의 수비 부대 글: 우리 세력 성이면 모두 보여 주고, 다른 세력 성이면 수비대장만 자세히, 장수는 있는지만
function defenseText(c, defs, sep) {
  const ours = c.faction === me().faction;
  const out = defs.filter(d => ours || d.guard).map(d => `${esc(d.name)} · ${d.type} ${fmt(d.troops)}`);
  if (!ours && defs.some(d => !d.guard)) out.push('장수 수비 있음');
  return out.join(sep);
}

function attackDialog() {
  const p = me(), from = cityAtSlot(p, slot), me1 = unitOf(p);
  const rows = attackTargetsFrom(from.id, p.faction).map(c => {
    const f = factionById(c.faction);
    const defs = defendersOf(c);
    const seen = canSee(p, c), d = defs[0];
    const hidden = defs.some(x => !x.guard); // 장수가 지키면 병력을 몰라 예상할 수 없다
    // 맨 앞에서 요격할 부대와 맞붙었을 때를 비교한다 (상성 포함, 지금 기준. 수비대장만 있을 때)
    const can = d && me1.type && !hidden;
    const mine = can ? attackPower(me1, d) : 0, def = can ? defensePower(d, c.faction ? S.cities[c.id].wall : 0, me1) : 0;
    let guess = !seen ? '?' : !d ? '무혈입성' : !me1.type || hidden ? '?' : mine > def * 1.2 ? '유리' : mine < def * 0.8 ? '불리' : '비슷';
    let cls = guess;
    // 지키는 부대가 없는 세력 성: 성벽(방어)을 이번에 다 깎을 수 있는지 (지금 병력 기준)
    const wall = c.faction ? S.cities[c.id].wall : 0;
    if (seen && !d && c.faction) {
      const lo = Math.max(1, Math.floor(p.troops * RULES.siegeRate.min)), hi = Math.max(1, Math.floor(p.troops * RULES.siegeRate.max));
      [guess, cls] = !p.troops ? ['?', '?'] : wall <= lo ? ['점령 가능', '유리'] : wall <= hi ? ['점령할 수도', '비슷'] : [`성벽 ${Math.ceil(wall / ((lo + hi) / 2))}번쯤`, '불리'];
    }
    return `<label class="opt"><input type="radio" name="tgt" value="${c.id}">
      <span class="swatch" style="background:${f ? f.color : 'var(--empty)'}"></span>
      <b>${esc(c.name)}</b> <span class="dim">${f ? esc(f.name) : '공백지'}</span>
      <span class="r">${!seen ? '수비 ? (첩보 필요)' : defs.length ? defenseText(c, defs, ', ') : c.faction ? `수비 없음 · 방어 ${fmt(wall)}` : '수비 없음'} · <span class="g-${cls}">${guess}</span></span></label>`;
  }).join('');
  pickDialog('출진', `<p>${esc(from.name)}에서 병력 전부를 이끌고 바로 옆 성을 칩니다. 그 턴에 바로 전투가 벌어지고, 지키는 부대가 없거나 모두 물리치면 성벽(방어)을 공격해요. 방어가 0이 되면 점령해요.</p>
    <p class="dim">지금 ${p.unitType || '병사 없음'} ${fmt(p.troops)} · 출진 군량 ${fmt(marchFood(p.troops))} (병력 × ${RULES.marchFoodRate}, 결과와 상관없이 사라짐) · 예상은 지금 병력 기준</p>`,
  rows, '예약', v => reserve({ cmd: 'attack', to: v }));
}

// 고른 칸이 실행될 때의 병종: 그 앞 칸에 예약한 징병이 있으면 그 병종, 없으면 지금 병종
function unitAtSlot(p, i) {
  const d = p.queue.slice(0, i).reverse().find(o => o && o.cmd === 'draft');
  return d ? d.unit : p.unitType;
}

function draftDialog() {
  const p = me(), from = cityAtSlot(me(), slot), cur = unitAtSlot(p, slot);
  const lea = effStats(p).lea, lo = lea * RULES.draftPerLea.min, hi = lea * RULES.draftPerLea.max;
  const statName = k => STATS.find(s => s.key === k).name;
  const opts = Object.entries(UNIT_TYPES).map(([t, u]) => `<label class="opt"><input type="radio" name="tgt" value="${t}"${t === cur ? ' checked' : ''}>
      <b>${t}</b> <span class="dim">${statName(u.stat)} ${effStats(p)[u.stat]}</span>
      <span class="r dim">${u.beats}에 강함 · ${Object.keys(UNIT_TYPES).find(k => UNIT_TYPES[k].beats === t)}에 약함</span></label>`).join('');
  pickDialog('징병', `<p>${esc(from.name)}에서 병사 <b class="hi">${fmt(lo)}~${fmt(hi)}</b>명을 모읍니다 (통솔 ${lea} × ${RULES.draftPerLea.min}~${RULES.draftPerLea.max}, 최대 병력 ${fmt(troopsMax(p))}까지). 병종마다 전투력에 쓰는 능력치가 달라요.</p>
    <p class="dim">${p.troops > 0 ? `지금 ${p.unitType} ${fmt(p.troops)}. 다른 병종을 모으면 지금 병력은 모두 흩어져요.` : '병사가 없어요. 병종을 골라 새로 모아요.'} 금 ${RULES.myGoldCost.draft}</p>`,
  opts, '예약', t => {
    if (p.troops > 0 && cur && t !== cur && !confirm(`${t}을 모으면 그때 있는 ${cur} 병력은 모두 흩어져요. 예약할까요?`)) return false;
    reserve({ cmd: 'draft', unit: t });
  });
}

function spyDialog() {
  const from = cityAtSlot(me(), slot);
  const opts = spyTargetsFrom(from.id, me().faction).map(c => {
    const f = factionById(c.faction), i = intelOf(me(), c);
    return `<label class="opt"><input type="radio" name="tgt" value="${c.id}">
      <span class="swatch" style="background:${f.color}"></span><b>${esc(c.name)}</b> <span class="dim">${esc(f.name)}</span>
      <span class="r dim">${i ? `${fmtClock(i.at + RULES.spyValid)}까지 알고 있음` : '모름'}</span></label>`;
  }).join('');
  pickDialog('첩보', `<p>${esc(from.name)}의 이웃한 다른 세력 성에 첩자를 보내 수비 병력·방어·군량을 알아냅니다. 알아낸 정보는 ${RULES.spyValid / HOUR}시간 동안 성 정보와 출진 창에 보여요.</p>
    <p class="dim">내 금 ${RULES.myGoldCost.spy}</p>`, opts, '예약', v => reserve({ cmd: 'spy', to: v }));
}

function trainDialog() {
  const p = me(), xp = k => (p.statExp && p.statExp[k]) || 0;
  const opts = STATS.map(st => `<label class="opt"><input type="radio" name="tgt" value="${st.key}"${p.stats[st.key] >= RULES.statMax ? ' disabled' : ''}>
      <b>${st.name} 수련</b> <span class="dim">${p.stats[st.key]}</span>
      <span class="r">${bar(xp(st.key), expNeed(p.stats[st.key]))} <span class="dim">${xp(st.key)}/${expNeed(p.stats[st.key])}</span></span></label>`).join('');
  pickDialog('수련', `<p>능력치 하나를 골라 경험치를 집중해서 쌓습니다 (한 번에 ${RULES.statExp.train.min}~${RULES.statExp.train.max}). 경험치가 다 차면 그 능력치가 1 올라요.</p>
    <p class="dim">필요한 경험치 = ${RULES.expNeedBase} + 지금 능력치 · 금 ${RULES.myGoldCost.train}</p>`, opts, '예약', v => reserve({ cmd: 'train', stat: v }));
  $('#modalBox .opts').classList.add('train');
}

function siegeDialog() {
  const p = me(), from = cityAtSlot(me(), slot), cs = S.cities[from.id];
  const opts = Object.entries(SIEGE).map(([t, w]) => {
    const have = p.siege && p.siege[t], ok = cs.tech >= w.tech;
    return `<label class="opt"><input type="radio" name="tgt" value="${t}"${have ? ' disabled' : ''}>
      <b>${t}</b> <span class="dim">기술 ${w.tech} · 내 금 ${w.price}</span>
      <span class="r ${have ? 'dim' : ok ? '' : 'bad'}">${have ? '가지고 있음' : ok ? w.desc : `기술 모자람 (${esc(from.name)} ${cs.tech})`}</span></label>`;
  }).join('');
  pickDialog('병기 생산', `<p>${esc(from.name)}의 기술로 병기를 만들어 내 부대에 갖춥니다. 부대마다 병기는 하나만 가질 수 있어요. 다른 병기를 만들면 가지고 있던 병기는 버려져요.</p>
    <p class="dim">지금 병기 ${Object.keys(SIEGE).find(t => p.siege && p.siege[t]) || '없음'} · 내 금 ${fmt(p.gold)} · ${esc(from.name)} 기술 ${cs.tech}</p>`, opts, '예약', v => {
    const old = Object.keys(SIEGE).find(t => p.siege && p.siege[t]);
    if (old && !confirm(`실행되면 가지고 있던 ${josa(old, '은는')} 버려지고 ${josa(v, '으로')} 바뀌어요. 예약할까요?`)) return false;
    reserve({ cmd: 'siege', type: v });
  });
}

// 상점: 예약 없이 바로 산다 (턴을 쓰지 않고, 공적은 없다). 사면 창을 그대로 두고 값만 다시 보여 준다
function shopDialog(msg = '') {
  const p = me(), statName = k => STATS.find(s => s.key === k).name;
  const rows = Object.entries(SHOP).map(([name, it]) => {
    const n = gearCount(p, name), price = shopPrice(p, name), top = effStats(p)[it.stat] >= RULES.statMax;
    return `<div class="opt"><b>${name}</b> <span class="dim">${statName(it.stat)} +${it.bonus} · 가진 것 ${n}개 · 지금 ${statName(it.stat)} ${effStats(p)[it.stat]}</span>
      <span class="r">${top ? `<span class="dim">${statName(it.stat)} 최고</span>` : `<button data-buy="${name}"${p.gold < price ? ' disabled' : ''}>금 ${fmt(price)}에 사기</button>`}</span></div>`;
  }).join('');
  openModal(`<h2>상점 <span class="dim small">· 바로 사요 (턴을 쓰지 않아요)</span></h2>
    <p>하나 살 때마다 그 능력치가 ${SHOP.명검.bonus} 올라요. 여러 번 살 수 있지만, 같은 물건은 살 때마다 금 ${RULES.shopPrice.step}씩 비싸져요. (능력치 최대 ${RULES.statMax})</p>
    <p class="dim">지금 내 금 <b class="hi">${fmt(p.gold)}</b></p>
    <div class="opts">${rows}</div>
    ${msg ? `<p class="hi">${esc(msg)}</p>` : ''}
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelectorAll('[data-buy]').forEach(b => {
      b.onclick = async () => {
        const item = b.dataset.buy;
        box.querySelectorAll('[data-buy]').forEach(x => { x.disabled = true; });
        const ok = await call('buy', { item });
        renderAll();
        shopDialog(ok ? `${item}${josa(item, '을를').slice(-1)} 샀어요!` : '');
      };
    });
  });
}



// 계략: 이웃한 다른 세력 성을 고른다. 성공 확률은 지금 지력 기준
function plotDialog(kind) {
  const p = me(), from = cityAtSlot(me(), slot), int = effStats(p).int, name = PLOT_NAME[kind];
  const opts = spyTargetsFrom(from.id, me().faction).map(c => {
    const f = factionById(c.faction), cs = S.cities[c.id];
    return `<label class="opt"><input type="radio" name="tgt" value="${c.id}">
      <span class="swatch" style="background:${f.color}"></span><b>${esc(c.name)}</b> <span class="dim">${esc(f.name)}</span>
      <span class="r dim">${kind === 'destroy' ? `방어 ${cs.wall}` : `치안 ${cs.peace} · 농업 ${cs.agri} · 상업 ${cs.comm}`}</span></label>`;
  }).join('');
  const effect = kind === 'destroy'
    ? `성공하면 그 성의 <b>방어</b>를 약 ${Math.floor(int * PLOT.destroy.wallPerInt)} 낮춰요.`
    : `성공하면 그 성의 <b>치안</b>을 약 ${Math.floor(int * PLOT.rumor.peacePerInt)}, 농업·상업을 약 ${Math.floor(int * PLOT.rumor.devPerInt)}씩 낮춰요.`;
  pickDialog(name, `<p>${esc(from.name)}의 이웃한 다른 세력 성에 ${kind === 'destroy' ? '공작대를 보내 성벽을 무너뜨립니다' : '흉흉한 소문을 퍼뜨립니다'}. ${effect} 대성공이면 2배!</p>
    <p class="dim">지력 ${int} · 성공 확률 약 ${Math.round(PLOT.successRate(int) * 100)}% · 금은 들지 않아요</p>`,
  opts, '예약', v => reserve({ cmd: kind, to: v }));
}

// 하야: 되돌릴 수 없으니 한 번 더 묻는다
function resignDialog() {
  const p = me(), f = factionById(p.faction);
  if (!confirm(`${dateText(S.turn + 1 + slot)} 턴에 ${f.name} 세력을 떠나 재야가 되도록 예약할까요?

- 거느린 병사는 모두 흩어져요.
- 남은 예약 명령은 모두 지워져요.
- 공적·금·능력치는 그대로예요.
- 그 뒤 세력을 새로 골라 들어가요.
- ${f.name} 세력에는 ${RULES.rejoinWait}턴 동안 다시 들어갈 수 없어요.`)) return;
  reserve({ cmd: 'resign' });
}

function moveDialog() {
  const from = cityAtSlot(me(), slot);
  const opts = linkedOwnCities(from.id, me().faction).map(c =>
    `<label class="opt"><input type="radio" name="tgt" value="${c.id}"><b>${esc(c.name)}</b>
      <span class="r dim">${GRADE_NAME[c.grade]} · 군량 ${fmt(S.cities[c.id].food)}</span></label>`).join('');
  pickDialog('이동', `<p>${esc(from.name)}에서 내 세력의 다른 성으로 장수와 병력이 옮겨 갑니다. 병사는 머무는 성의 군량을 먹어요.</p>`,
    opts, '예약', v => reserve({ cmd: 'move', to: v }));
}

// ===== 도움말 (초심자 안내) =====
// 핵심만 짧게. 숫자는 rules.js에서 가져와서 규칙을 고쳐도 안내가 따라간다
// 한 번에 한 항목씩: 위의 항목 단추나 이전·다음으로 넘겨 본다
function helpDialog(page = 0) {
  const turnMin = RULES.turnLength / MIN;
  const pages = [
    ['🎯 목표', '<p>세력에 들어가 동료들과 함께 이웃 성을 하나씩 차지해, 천하를 손에 넣는 게임이에요.</p>'],
    ['⏳ 턴과 명령 예약', `<ul>
      <li>1턴 = ${turnMin}분 = 게임 속 <b>1달</b>. 모든 장수가 같은 정각에 움직여요.</li>
      <li>오른쪽 <b>명령 예약표</b>에 ${RULES.queueSize}턴까지 명령을 넣어 두면, 접속하지 않아도 한 턴에 하나씩 실행돼요.</li>
      <li>실행할 수 없는 명령(금이 모자람 등)은 <b>실패 → 대기</b>로 넘어가요. 결과는 <b>기록</b> 창에서 확인해요.</li></ul>`],
    ['💰 금과 군량', `<ul>
      <li><b>금</b> (내 것): 1·4·7·10월 💰에 <b>내가 있는 성의 상업</b>만큼 들어와요. 징병·수련·상점·군량 사기에 써요. 내정은 금 없이 턴만 써요.</li>
      <li><b>군량</b> (성마다 따로): 4·10월 🌾 수확 때 그 성의 농업만큼 들어오고, 병사는 머무는 성의 군량을 매달 먹어요. 출진하면 병력의 ${Math.round(RULES.marchFoodRate * 100)}%만큼 더 들어요.</li></ul>`],
    ['📊 능력치', `<ul>
      <li><b>통솔</b>: 최대 병력(통솔 × ${RULES.troopsPerLea}), 징병, 치안, 보병</li>
      <li><b>무력</b>: 축성, 기병, <b>일기토</b>(양쪽 무력 ${RULES.duel.minWar} 이상이면 전투 중 가끔)</li>
      <li><b>지력</b>: 농업·상업, 궁병, <b>계략</b>(파괴·유언 성공률)</li>
      <li>행동하면 그 능력치의 <b>경험치</b>가 쌓이고, 다 차면 1 올라요. (내정 → 그 내정의 능력치, 출진 → 병종의 능력치, <b>수련</b> → 고른 능력치)</li>
      <li><b>상점</b>(장수 창의 단추)에서 명마(통솔)·명검(무력)·서적(지력)를 사면 하나에 +${SHOP.명검.bonus}. 예약 없이 바로 사지고, 여러 번 살 수 있지만 살 때마다 비싸져요.</li></ul>`],
    ['⚔ 싸우는 법', `<ol>
      <li><b>징병</b>으로 병사를 모아요. 병종은 <b>기병 → 보병 → 궁병 → 기병</b> 순으로 상대에게 강해요. 다른 병종을 모으면 있던 병력은 흩어지니 조심해요.</li>
      <li>성을 누르면 이웃 적 성의 수비 병력을 미리 볼 수 있어요.</li>
      <li>출진하면 최대 <b>${RULES.roundsMax}합</b>까지 싸워요. 수비 부대를 모두 쓰러뜨리면 이어서 <b>성벽</b>을 공격해요. 남은 병력의 ${Math.round(RULES.siegeRate.min * 100)}~${Math.round(RULES.siegeRate.max * 100)}%만큼 성의 방어가 깎이고(그 ${RULES.siegeLoss}배의 병력을 잃어요), <b>방어가 0이 되면 점령</b>해요. 지키는 장수가 없는 성도 성벽은 깎아야 해요.</li>
      <li>쳐들어가기 전에 <b>계략</b>(파괴·유언)으로 적 성의 방어·치안을 깎아 두면 좋아요.</li>
      <li>빈 땅(공백지)은 싸우지 않고 들어가요. 이기면 성을 차지해요.</li></ol>`],
    ['🌱 처음엔 이렇게', `<ol>
      <li>농업·상업으로 성을 키워요. 상업이 높은 성에 있으면 금이 많이 들어와요.</li>
      <li>치안이 50 아래로 떨어지면 수입과 징병이 줄어요. 치안 명령으로 올려요.</li>
      <li>징병으로 부대를 갖춰요.</li>
      <li>이웃 공백지부터 출진해서 땅을 넓혀요.</li></ol>`],
    ['💡 작은 팁', `<ul>
      <li>지도에서 성을 누르면 그 성의 정보가 나와요.</li>
      <li>장수 창의 <b>방어 모드</b>를 켜 두면, 내가 있는 성이 공격받을 때 앞장서서 막아요.</li>
      <li><b>축성</b>으로 성의 <b>방어</b>를 올려 두면, 적이 쳐들어올 때 수비하는 쪽 전투력이 세져요. (방어 100마다 +${Math.round(100 / RULES.wallDivisor * 100)}%)</li>
      <li>출진할 군량이 모자라면 <b>군량 사기</b>로 금을 군량으로 바꿀 수 있어요.</li></ul>`],
  ];
  const [title, body] = pages[page];
  const last = page === pages.length - 1;
  openModal(`
    <h2>쌈국지 처음 안내</h2>
    <div class="helpTabs">${pages.map(([t], i) => `<button data-page="${i}" class="${i === page ? 'on' : ''}">${t}</button>`).join('')}</div>
    <div class="help"><h3>${title}</h3>${body}</div>
    <div class="modalBtns helpNav">
      <button data-close>닫기</button>
      <button id="helpPrev"${page ? '' : ' disabled'}>◀ 이전</button>
      <span class="dim helpPage">${page + 1} / ${pages.length}</span>
      ${last ? '<button data-close class="main">알겠어요</button>' : '<button id="helpNext" class="main">다음 ▶</button>'}
    </div>`, box => {
    box.querySelectorAll('[data-page]').forEach(b => { b.onclick = () => helpDialog(+b.dataset.page); });
    $('#helpPrev').onclick = () => helpDialog(page - 1);
    if (!last) $('#helpNext').onclick = () => helpDialog(page + 1);
  });
  $('#modalBox').classList.add('wideBox');
}

// ===== 화면 전환 (기획서 12장 화면 흐름) =====
// 7 장수 생성 → 4 세력 선택 → 5 메인 화면. 1·6 로그인·가입은 서버 단계에서 만든다.
function showScreen(id) {
  ['title', 'create', 'join', 'game'].forEach(s => { $('#' + s).hidden = s !== id; });
  closeModal();
  // 오른쪽 위 접속 정보: 로그인 화면이 아니면 보인다
  $('#who').hidden = id === 'title';
  if (id !== 'game') $('#nowDate').textContent = '';
  $('#whoName').textContent = ME ? ME.nickname : '';
}

// ===== 1. 메인 / 로그인 =====
// 아이디·비밀번호로 로그인하거나, 같은 화면에서 계정을 만든다. 로그인해 두면 다음에 열 때 바로 들어간다
let authMode = 'login'; // 'login' 로그인 | 'new' 계정 만들기

function showTitle(msg) {
  showScreen('title');
  setAuthMode(authMode);
  $('#tMsg').hidden = !msg;
  $('#tMsg').textContent = msg || '';
}

// 로그인 ↔ 계정 만들기. 입력칸은 다시 만들지 않고 보이기·글자만 바꾼다 (한글 입력이 안 깨지게)
function setAuthMode(mode) {
  authMode = mode;
  const isNew = mode === 'new';
  $('#tTabLogin').className = isNew ? '' : 'on';
  $('#tTabNew').className = isNew ? 'on' : '';
  $('#tHelp').hidden = !isNew;
  $('#tPw2').hidden = !isNew;
  $('#tId').placeholder = isNew ? '아이디 (2~8자)' : '아이디';
  $('#tPw').placeholder = isNew ? '비밀번호 (4자 이상)' : '비밀번호';
  $('#tPw').autocomplete = isNew ? 'new-password' : 'current-password';
  $('#tGo').textContent = isNew ? '계정 만들고 시작하기' : '로그인';
  $('#tMsg').hidden = true;
}

async function submitAuth() {
  const id = $('#tId').value.trim(), pw = $('#tPw').value;
  const say = m => { $('#tMsg').hidden = false; $('#tMsg').textContent = m; };
  if (!sb) { say('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
  if (authMode === 'new') {
    if (!ID_RULE.test(id)) { say('아이디는 2~8자의 한글·영문·숫자로 정해 주세요.'); return; }
    if (pw.length < 4) { say('비밀번호는 4자 이상으로 정해 주세요.'); return; }
    if (pw !== $('#tPw2').value) { say('비밀번호 두 칸이 서로 달라요.'); return; }
  } else if (!id || !pw) { say('아이디와 비밀번호를 적어 주세요.'); return; }
  $('#tGo').disabled = true;
  try {
    if (authMode === 'new') await signUp(id, pw); else await signIn(id, pw);
    $('#tPw').value = $('#tPw2').value = '';
    enterFlow();
  } catch (e) {
    say(e.message || String(e));
  } finally {
    $('#tGo').disabled = false;
  }
}

async function logout() {
  try { await serverSignOut(); } catch (e) { /* 무시 */ }
  S = null;
  setAuthMode('login');
  showTitle();
}

// ===== 7. 장수 생성 화면 =====
const draft = { face: FACES[0].id, base: null, bonus: {} }; // base: 주사위로 나온 통/무/지
const bonusLeft = () => RULES.startBonus - STATS.reduce((s, st) => s + (draft.bonus[st.key] || 0), 0);

function showCreate() {
  showScreen('create');
  STATS.forEach(st => { draft.bonus[st.key] = 0; });
  draft.base = rollStats();
  renderFacePick();
  renderCreateStats();
}

// 얼굴 고르기: 큰 미리보기 + 작은 얼굴 목록
function renderFacePick() {
  const big = $('#cFaceBig');
  big.innerHTML = '';
  big.appendChild(faceCanvas(draft.face));
  const list = $('#cFaces');
  list.innerHTML = '';
  FACES.forEach(f => {
    const b = document.createElement('button');
    b.className = f.id === draft.face ? 'on' : '';
    b.title = f.name;
    b.appendChild(faceCanvas(f.id));
    b.onclick = () => { draft.face = f.id; renderFacePick(); };
    list.appendChild(b);
  });
}

// 능력치 표만 다시 그린다 (이름 입력칸은 건드리지 않아서 한글 입력이 안 깨진다)
function renderCreateStats() {
  const base = draft.base;
  $('#cLeft').textContent = bonusLeft();
  $('#cStats').innerHTML = STATS.map(st => {
    const b = draft.bonus[st.key] || 0;
    return `<tr><th>${st.name}</th>
      <td class="num">${base[st.key] + b}</td>
      <td class="plus">${b ? `+${b}` : ''}</td>
      <td><button class="mini" data-k="${st.key}" data-d="-1"${b ? '' : ' disabled'}>−</button>
          <button class="mini" data-k="${st.key}" data-d="1"${bonusLeft() ? '' : ' disabled'}>+</button></td></tr>`;
  }).join('') + `<tr class="sum"><th>합계</th><td class="num">${STATS.reduce((s, st) => s + base[st.key] + (draft.bonus[st.key] || 0), 0)}</td><td></td><td></td></tr>`;
  $('#cStats').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.k, d = +b.dataset.d;
      const next = (draft.bonus[k] || 0) + d;
      if (next < 0 || (d > 0 && bonusLeft() <= 0) || draft.base[k] + next > RULES.statMax) return;
      draft.bonus[k] = next;
      renderCreateStats();
    };
  });
}

async function createGeneral() {
  const name = $('#cName').value.trim();
  if (!name) { alert('장수 이름을 적어 주세요.'); $('#cName').focus(); return; }
  if (bonusLeft() > 0 && !confirm(`보너스 포인트가 ${bonusLeft()}점 남았어요. 남은 포인트는 사라져요. 결정할까요?`)) return;
  const stats = {};
  STATS.forEach(st => { stats[st.key] = draft.base[st.key] + (draft.bonus[st.key] || 0); });
  if (await call('create', { name, face: draft.face, stats })) showJoin();
}

// ===== 4. 세력 선택 화면 =====
let joinPick = null;  // 고른 세력
let joinCity = null;  // 시작할 성 (고른 세력의 성 가운데 하나)

function showJoin() {
  showScreen('join');
  joinPick = null;
  joinCity = null;
  renderJoin();
}

function renderJoin() {
  drawMap($('#joinMap'), {
    focusFaction: joinPick,
    homeId: joinCity,
    // 지도에서 성을 누르면 그 성의 세력과 그 성을 함께 고른다
    // 이미 고른 성을 다시 누르면 선택을 해제한다
    onClick: c => {
      if (joinCity === c.id) { joinPick = null; joinCity = null; renderJoin(); return; }
      if (playable().some(f => f.id === c.faction)) { joinPick = c.faction; joinCity = c.id; renderJoin(); }
    },
  });
  $('#jList').innerHTML = playable().map(f =>
    `<button class="pick${f.id === joinPick ? ' on' : ''}" data-f="${esc(f.id)}">
      <span class="swatch" style="background:${f.color}"></span>${esc(f.name)}
      <span class="dim">${citiesOfFaction(f.id).length}성${rejoinLeft(me(), f.id) ? ` · ${rejoinLeft(me(), f.id)}턴 뒤` : ''}</span></button>`).join('');
  $('#jList').querySelectorAll('button').forEach(b => {
    b.onclick = () => { joinPick = b.dataset.f; joinCity = startCity(joinPick).id; renderJoin(); };
  });
  renderJoinInfo();
}

function renderJoinInfo() {
  const box = $('#jInfo');
  if (!joinPick) { box.innerHTML = '<h2>세력 정보</h2><p class="dim">세력을 고르면 정보가 나와요.</p>'; return; }
  const f = factionById(joinPick);
  const cities = citiesOfFaction(f.id);
  const sum = k => cities.reduce((s, c) => s + S.cities[c.id][k], 0);
  box.innerHTML = `
    <h2>${esc(f.name)}</h2>
    <table class="stats">
      <tr><th>장수</th><td>${memberCount(f.id)}명 <span class="dim">(소속한 유저 수)</span></td></tr>
      <tr><th>성</th><td>${cities.length}개</td></tr>
      <tr><th>군량</th><td>${fmt(sum('food'))} <span class="dim">(성들의 합)</span></td></tr>
    </table>
    <p class="sub">시작할 성 <span class="dim">(지도에서 눌러도 돼요)</span></p>
    <div class="picks" id="jCities">${cities.map(c =>
      `<button class="pick${c.id === joinCity ? ' on' : ''}" data-c="${esc(c.id)}">${esc(c.name)} <span class="grade">${'★'.repeat(c.grade)}</span></button>`).join('')}</div>
    <p class="dim">소속하면 이 세력의 수비대장은 물러나고, 성은 소속원들이 지켜야 해요.</p>
    ${rejoinLeft(me(), f.id)
      ? `<p class="bad">얼마 전에 하야한 세력이라 ${rejoinLeft(me(), f.id)}턴 뒤(${dateText(me().leftFaction.until)})부터 다시 들어갈 수 있어요.</p>
    <button id="jOk" class="btn big" disabled>${esc(f.name)} 세력에 소속하기</button>`
      : `<button id="jOk" class="btn big">${esc(f.name)} 세력에 소속하기</button>`}`;
  $('#jOk').onclick = pickFaction;
  box.querySelectorAll('#jCities button').forEach(b => { b.onclick = () => { joinCity = b.dataset.c; renderJoin(); }; });
}

async function pickFaction() {
  if (await call('join', { faction: joinPick, city: joinCity })) enterGame();
}

// ===== 5. 메인 화면 =====
function enterGame() {
  showScreen('game');
  selected = null;
  slot = 0;
  render();
  renderLegend();
  renderAll();
}

function renderAll() {
  // 성을 모두 잃어 세력이 없어졌으면 세력 선택부터 다시
  if (!me().faction) { showJoin(); return; }
  renderGeneral();
  renderMembers();
  renderCommands();
  renderInfo();
  renderLog();
  renderChat();
  if (S.unified && !celebrated) { celebrated = true; unifyDialog(); }
}

// 우리 세력 장수: 누가 어디에 얼마나 있는지 (공적 순). 남의 예약·금은 서버가 보내 주지 않는다
function renderMembers() {
  const p = me(), f = factionById(p.faction);
  const list = allGenerals().filter(g => g.faction === p.faction).sort((a, b) => b.merit - a.merit);
  $('#membersTitle').textContent = `· ${f.name} ${list.length}명`;
  $('#members').innerHTML = `<table class="stats rank members"><tr><th>장수</th><th>위치</th><th>병력</th><th>공적</th></tr>${list.map(g => `
      <tr class="${g.id === MY_ID ? 'mine' : ''}"><td>${esc(g.name)}</td><td>${esc(cityById(g.city).name)}</td>
        <td class="num">${g.unitType ? `${g.unitType} ` : ''}${fmt(g.troops)}</td><td class="num">${fmt(g.merit)}</td></tr>`).join('')}</table>`;
}

function bar(v, max) {
  return `<span class="bar"><span style="width:${Math.min(100, (v / max) * 100)}%"></span></span>`;
}

function renderGeneral() {
  const p = me(), f = factionById(p.faction), city = cityById(p.city);
  $('#general').innerHTML = `
    <h2>장수</h2>
    <div class="gHead"><span id="gFace"></span><div>
      <p class="gname">${esc(p.name)}</p>
      <table class="stats">
        <tr><th>세력</th><td><span class="swatch" style="background:${f.color}"></span>${esc(f.name)}</td></tr>
        <tr><th>위치</th><td>${esc(city.name)}</td></tr>
        <tr><th>군량</th><td>${fmt(S.cities[p.city].food)} <span class="dim">/ ${fmt(foodMax(city.grade))}</span></td></tr>
        <tr><th>병력</th><td>${p.unitType ? `${p.unitType} ` : ''}${fmt(p.troops)} <span class="dim">/ ${fmt(troopsMax(p))}</span></td></tr>
        ${RULES.features.drill ? '' : '<!--'}<tr><th>훈련</th><td>${p.training} <span class="dim">/ 100</span></td></tr>${RULES.features.drill ? '' : '-->'}
        <tr><th>방어</th><td><button id="gDefense" class="mini${p.defense && p.troops > 0 ? ' on' : ''}"${p.troops > 0 ? '' : ' disabled title="병력이 없으면 켤 수 없어요"'}>${p.defense && p.troops > 0 ? '켜짐' : '꺼짐'}</button></td></tr>
        ${RULES.features.siege ? '' : '<!--'}<tr><th>병기</th><td>${Object.keys(SIEGE).filter(t => p.siege && p.siege[t]).join(' · ') || '<span class="dim">없음</span>'}</td></tr>${RULES.features.siege ? '' : '-->'}
        ${RULES.features.shop ? '' : '<!--'}<tr><th>장비</th><td>${Object.keys(SHOP).filter(t => gearCount(p, t)).map(t => `${t} ${gearCount(p, t)}`).join(' · ') || '<span class="dim">없음</span>'} <button id="gShop" class="mini">상점</button></td></tr>${RULES.features.shop ? '' : '-->'}
        <tr><th>금</th><td>${fmt(p.gold)}</td></tr>
        <tr><th>공적</th><td>${fmt(p.merit)} <span class="dim">(순위 점수)</span></td></tr>
      </table>
    </div></div>
    <table class="statbars">${STATS.map(st => `
      <tr><th>${st.name}</th><td class="num">${effStats(p)[st.key]}${effStats(p)[st.key] > p.stats[st.key] ? `<small class="plusg">+${effStats(p)[st.key] - p.stats[st.key]}</small>` : ''}</td><td>${bar(effStats(p)[st.key], RULES.statMax)}</td>
        <td class="xp dim" title="경험치 / 다음 1까지">${p.stats[st.key] >= RULES.statMax ? '최대' : `${(p.statExp && p.statExp[st.key]) || 0}/${expNeed(p.stats[st.key])}`}</td></tr>`).join('')}
    </table>`;
  $('#gFace').replaceWith(faceCanvas(p.face || FACES[0].id));
  $('#gDefense').onclick = onDefense;
  if ($('#gShop')) $('#gShop').onclick = () => shopDialog();
}

// 1초마다 바뀌는 부분만 고친다 (버튼을 다시 만들지 않아서 클릭이 씹히지 않는다)
function updateTurn() {
  const el = $('#turnLeft');
  if (el && (S.unified || S.paused)) el.parentElement.textContent = S.unified ? '(턴 멈춤)' : '(⏸ 관리자가 턴을 멈춤)';
  else if (el) el.textContent = fmtLeft(nextTurn(now()) - now());
}

// 명령 창 = 예약표. 칸을 고르고 아래 명령 버튼을 누르면 그 칸에 예약된다
function renderCommands() {
  const p = me();
  $('#nowDate').textContent = dateText(S.turn); // 상단: 게임 속 지금 연월
  const statName = k => STATS.find(s => s.key === k).name;
  const cost = k => (RULES.myGoldCost[k] ? `금${RULES.myGoldCost[k]}` : '');
  const btn = (cmd, name, sub) => (cmdOn(cmd) ? `<button data-cmd="${cmd}">${name}<small>${sub}</small></button>` : '');
  const rows = p.queue.map((o, i) => `<li data-i="${i}" class="${i === slot ? 'sel' : ''}${o ? '' : ' idle'}">
      <span class="t">${dateOf(S.turn + 1 + i).month}월${RULES.goldMonths.includes(dateOf(S.turn + 1 + i).month) ? '💰' : ''}${RULES.harvestMonths.includes(dateOf(S.turn + 1 + i).month) ? '🌾' : ''}</span>
      <span class="clock">${fmtClock(slotTime(i))}</span>
      <span class="what">${o ? esc(orderLabel(o)) : '대기'}</span>
      ${o ? `<button class="mini x" data-x="${i}" title="이 칸 비우기">✕</button>` : ''}</li>`).join('');
  const at = cityAtSlot(me(), slot);
  // 기타 명령: 모두 꺼져 있으면 제목도 숨긴다
  const plot = [btn('destroy', '파괴', '방어 낮추기 · 지력'), btn('rumor', '유언', '치안 낮추기 · 지력')].join('');
  const etc = [btn('explore', '탐색', cost('explore')), btn('spy', '첩보', `적 성 · ${cost('spy')}`),
    btn('train', '수련', `능력치 경험 · ${cost('train')}`), btn('buyFood', '군량 사기', `금${RULES.foodBuy.gold} → 군량 ${RULES.foodBuy.food}`), btn('resign', '하야', '세력을 떠남')].join('');
  $('#queueBox').innerHTML = `
    <h2>명령 예약</h2>
    <p class="turnInfo">다음 턴 ${fmtClock(slotTime(0))} <span class="dim">(<b id="turnLeft"></b> 남음)</span>
      <span class="dim">· 1턴 ${RULES.turnLength / MIN}분 = 1달</span></p>
    <ol class="queue">${rows}</ol>
    <p class="cmds two"><button id="qClear">칸 비우기</button><button id="qClearAll" class="danger">모두 비우기</button></p>
    <p class="cmds one"><button id="qFill"${lastOrder ? '' : ' disabled'}>빈 칸 모두 채우기<small>${lastOrder ? `마지막 명령: ${esc(orderLabel(lastOrder))}` : '명령을 하나 넣으면 쓸 수 있어요'}</small></button></p>
`;
  $('#commands').innerHTML = `
    <h2>명령</h2>
    <p class="sub">${dateText(S.turn + 1 + slot)} (${fmtClock(slotTime(slot))}) 턴에 넣을 명령 <span class="dim">(이때 ${esc(at.name)}에 있을 예정)</span></p>
    <p class="sub">내정</p>
    <div class="cmds">${Object.entries(DOMESTIC).map(([k, d]) => btn(k, d.name, statName(d.stat))).join('')}</div>
    <p class="sub">군사</p>
    <div class="cmds">
      ${btn('draft', '징병', `통솔 · ${cost('draft')}`)}
      ${btn('drill', '훈련', '통솔')}
      ${btn('attack', '출진', '이웃 성 공격')}
      ${btn('move', '이동', '아군 성으로')}
      ${btn('siege', '병기', '충차·정란·벽력거')}
    </div>
    <p class="sub">계략</p>
    <div class="cmds">${plot}</div>
    ${etc ? `<p class="sub">기타</p>
    <div class="cmds">${etc}</div>` : ''}
`;
  const dialogs = { resign: resignDialog, siege: siegeDialog, shop: shopDialog, draft: draftDialog, attack: attackDialog, move: moveDialog, spy: spyDialog, train: trainDialog, destroy: () => plotDialog('destroy'), rumor: () => plotDialog('rumor') };
  $('#commands').querySelectorAll('button[data-cmd]').forEach(b => {
    const k = b.dataset.cmd;
    b.onclick = () => (dialogs[k] ? dialogs[k]() : reserve({ cmd: k }));
  });
  $('#queueBox').querySelectorAll('.queue li').forEach(li => { li.onclick = () => { slot = +li.dataset.i; renderCommands(); }; });
  $('#queueBox').querySelectorAll('[data-x]').forEach(b => { b.onclick = e => { e.stopPropagation(); clearSlot(+b.dataset.x); }; });
  $('#qClear').onclick = () => clearSlot(slot);
  $('#qFill').onclick = async () => { if (lastOrder) { await call('fill', { order: lastOrder }); renderCommands(); } };
  $('#qClearAll').onclick = async () => {
    if (!confirm('예약한 명령을 모두 비울까요?')) return;
    await call('clear');
    slot = 0;
    renderCommands();
  };
  // 천하통일로 시즌이 끝나면: 버튼은 그대로 보이지만 아무 작동도 하지 않는다
  if (S.unified) {
    $('#commands').querySelectorAll('button').forEach(b => { b.disabled = true; b.onclick = null; });
    $('#queueBox').querySelectorAll('button').forEach(b => { b.disabled = true; b.onclick = null; });
    $('#queueBox').querySelectorAll('.queue li').forEach(li => { li.onclick = null; });
    $('#commands h2').insertAdjacentHTML('afterend', `<p class="hi">🏆 ${esc(factionById(S.unified.faction).name)} 세력 천하통일! 시즌이 끝나 턴이 멈췄어요. <button id="cResult" class="mini">결과 보기</button></p>`);
    $('#cResult').onclick = () => unifyDialog();
  }
  updateTurn();
}

// ===== 세력 채팅 (기획서 10장) =====
// 우리 세력끼리만, 최근 50개. 서버의 세계에 함께 저장된다 (화면은 1분마다 새로 받아 온다)
const CHAT_MAX = 50, CHAT_LEN = 100;
const chatOf = fid => (S.chat && S.chat[fid]) || [];
// 채팅에 보이는 이름: 장수 이름(보낼 때 있던 성). 성이 적혀 있지 않은 예전 글은 그 장수가 지금 있는 성으로
const chatWho = m => {
  const g = m.city ? null : allGenerals().find(x => x.name === m.name);
  const c = cityById(m.city || (g && g.city));
  return esc(m.name) + (c ? `<span class="dim">(${esc(c.name)})</span>` : '');
};
async function sendChat(text) {
  text = text.trim().slice(0, CHAT_LEN);
  if (!text || !me().faction) return;
  await call('chat', { text });
  renderChatList();
}
// 틀(입력칸)은 한 번만 만든다. 다시 그리면 한글 입력 중이던 글자가 깨지므로 그 뒤로는 목록만 고친다
function renderChat() {
  const box = $('#chat');
  if (!box.querySelector('.chatForm')) {
    box.innerHTML = `<h2>세력 채팅 <span class="dim" id="chatFaction"></span></h2>
      <ul class="chatList"></ul>
      <form class="chatForm" autocomplete="off">
        <input type="text" id="chatInput" maxlength="${CHAT_LEN}" placeholder="우리 세력에게 한마디">
        <button type="submit">보내기</button>
      </form>
      <p class="note">같은 세력 장수들끼리만 보여요. 새 글은 1분마다 받아 와요. (최근 ${CHAT_MAX}개)</p>`;
    box.querySelector('.chatForm').onsubmit = e => {
      e.preventDefault();
      const input = $('#chatInput');
      sendChat(input.value);
      input.value = '';
    };
  }
  $('#chatFaction').textContent = `· ${factionById(me().faction).name}`;
  renderChatList();
}
function renderChatList() {
  const ul = $('#chat .chatList'), p = me(), list = chatOf(p.faction);
  ul.innerHTML = list.length
    ? list.map(m => `<li class="${m.name === p.name ? 'mine' : ''}"><span class="t">${fmtClock(m.t)}</span><span class="who">${chatWho(m)}</span>${esc(m.text)}</li>`).join('')
    : '<li class="empty">아직 아무 말도 없어요. 첫마디를 남겨 보세요.</li>';
  ul.scrollTop = ul.scrollHeight; // 새 글이 보이게 맨 아래로
}

function renderLog() {
  $('#log').innerHTML = `<h2>기록</h2><ul>${me().log.map(l =>
    `<li${l.text.includes('\n') ? ' class="report"' : ''}><span class="t">${fmtTime(l.t)}</span>${esc(l.text).replace(/\n/g, '<br>')}</li>`).join('')}</ul>`;
}

// map.js가 성 정보 창을 그릴 때 부르는 함수들
function homeCityId() { return S && MY_ID && me() ? me().city : null; }
function cityDetailRows(c) {
  if (!S) return '';
  const cs = S.cities[c.id];
  if (!cs) return '';
  const rows = [];
  const p = me();
  // 다른 세력 성은 첩보로 엿봐야 속사정이 보인다
  if (!canSee(p, c)) return '<tr class="gap"><td colspan="2"></td></tr><tr class="wide"><th>수비</th><td class="dim">? (첩보로 알아볼 수 있어요)</td></tr>';
  const intel = c.faction && c.faction !== p.faction ? intelOf(p, c) : null;
  // 지키는 부대
  if (!c.faction) rows.push('<tr class="wide"><th>수비</th><td class="dim">없음 (공백지)</td></tr>');
  else {
    const defs = defendersOf(c);
    rows.push(`<tr class="wide"><th>수비</th><td>${defs.length ? defenseText(c, defs, '<br>') : '<span class="dim">방어하는 장수 없음</span>'}</td></tr>`);
  }
  rows.push(...Object.keys(DOMESTIC).filter(cmdOn).map(k =>
    `<tr><th>${DOMESTIC[k].label}</th><td>${cs[k]} <span class="dim">/ ${devMax(c.grade, k)}</span></td></tr>`));
  if (c.faction) rows.push(`<tr class="wide"><th>군량</th><td>${fmt(cs.food)} <span class="dim">/ ${fmt(foodMax(c.grade))}</span></td></tr>`);
  if (intel) rows.push(`<tr class="wide"><td colspan="2" class="dim">첩보 정보 · ${fmtClock(intel.at + RULES.spyValid)}까지</td></tr>`);
  return `<tr class="gap"><td colspan="2"></td></tr>${rows.join('')}`;
}

// ===== 시작 =====
// map.js가 지도를 다 읽으면 부른다. 1. 들어와 있지 않으면 로그인 화면부터
async function onMapReady() {
  try { await serverInit(); } catch (e) { /* 서버가 안 되면 첫 화면에서 알려 준다 */ }
  if (ME) enterFlow(); else showTitle(sb ? '' : '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
}

// 2~5. 장수·세력이 있는지 보고 알맞은 화면으로 보낸다
async function enterFlow() {
  MY_ID = ME.id;
  try { localStorage.removeItem('sam2-save'); } catch (e) { /* 서버로 옮기기 전 브라우저 저장은 이제 안 쓴다 */ }
  if (!(await call('state'))) { showTitle('서버에서 세계를 받아 오지 못했어요. 잠시 뒤 다시 들어가 주세요.'); return; }
  renderLegend();
  // 2. 이번 시즌 내 장수가 없으면 → 7. 장수 생성
  if (!me()) { showCreate(); return; }
  // 3. 소속 세력이 없으면 → 4. 세력 선택
  if (!me().faction) { showJoin(); return; }
  enterGame(); // 5. 메인 화면
}


$('#cStart').onclick = createGeneral;
$('#cRoll').onclick = () => { draft.base = rollStats(); renderCreateStats(); };
$('#tForm').onsubmit = e => { e.preventDefault(); submitAuth(); };
$('#tTabLogin').onclick = () => setAuthMode('login');
$('#tTabNew').onclick = () => setAuthMode('new');
$('#logout').onclick = logout;
$('#helpBtn').onclick = () => helpDialog(); // 클릭 정보가 쪽 번호로 들어가지 않게
$('#adminBtn').onclick = adminToolsDialog;
$('#rankBtn').onclick = rankDialog;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

// 1초마다: 남은 시간·시계 갱신. 턴이 넘어갔거나 1분이 지났으면 서버에서 새로 받아 온다
setInterval(() => {
  if (!S || $('#game').hidden) return;
  const turnPassed = nextTurn(lastFetch + S.timeOffset) <= now() - 1000; // 서버가 턴을 처리할 1초 여유
  if (!busy && !document.hidden && (turnPassed || Date.now() - lastFetch > 60 * 1000)) { refresh(); return; }
  updateTurn();
}, 1000);
