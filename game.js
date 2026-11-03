'use strict';

// ===== 화면 =====
// 게임 계산은 engine.js, 규칙과 숫자는 rules.js, 지도 그리기는 map.js에 있다. 여기는 화면이다.
let MY_ID = null;     // 내 계정 id (서버 계정)
let IS_ADMIN = false; // 개발자 도구를 쓸 수 있는 계정인지 (서버가 알려 준다)
const me = () => S.generals[MY_ID];
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
// 가운데 점 붙이기·물결 내리기 (2026-11-03, 삼국지3글꼴): 이 글꼴은 '·' 자체가 넓어서 양옆 띄어쓰기를 화면에서 뺀다 ("통솔 87 · 무력" → "통솔 87·무력").
// 글자를 쓰는 곳(코드·서버 기록·채팅)은 그대로 두고, 화면에 붙는 글자만 바꾼다. 입력칸은 건드리지 않는다. 글꼴을 다른 것으로 바꾸면 TIGHT_DOTS를 false로
const TIGHT_DOTS = true;
(function tightDots() {
  if (!TIGHT_DOTS || typeof MutationObserver !== 'function') return;
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION|TITLE|text)$/; // OPTION 안에는 span을 넣을 수 없다
  const ok = t => t.parentNode && !SKIP.test(t.parentNode.nodeName) && !t.parentNode.isContentEditable;
  const one = t => {
    if (!(t.data.includes('·') || t.data.includes('~')) || !ok(t)) return;
    let d = t.data.replace(/ +· +/g, '·').replace(/ +·$/, '·').replace(/^· +/, '·');
    if (d.startsWith('·') && document.body.contains(t)) { // 점이 덩어리 맨 앞이면 앞 글자 덩어리 끝의 띄어쓰기도 뺀다 (예: "명예의 전당 <span>· 지난 통일")
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); w.currentNode = t;
      const p = w.previousNode();
      if (p && / +$/.test(p.data) && ok(p)) p.data = p.data.replace(/ +$/, '');
    }
    if (d !== t.data) t.data = d;
    // 물결(~)은 이 글꼴에서 위에 붙어 보여서, 화면에서만 <span class="tl">로 감싸 조금 내린다 (2026-11-03)
    if (d.includes('~') && !(t.parentNode.classList && t.parentNode.classList.contains('tl'))) {
      const frag = document.createDocumentFragment();
      d.split('~').forEach((part, i) => {
        if (i) { const sp = document.createElement('span'); sp.className = 'tl'; sp.textContent = '~'; frag.appendChild(sp); }
        if (part) frag.appendChild(document.createTextNode(part));
      });
      t.parentNode.replaceChild(frag, t);
    }
  };
  const fix = n => {
    if (n.nodeType === 3) return one(n);
    if (n.nodeType !== 1 || SKIP.test(n.nodeName)) return;
    const w = document.createTreeWalker(n, NodeFilter.SHOW_TEXT), list = [];
    for (let t = w.nextNode(); t; t = w.nextNode()) list.push(t);
    list.forEach(one);
  };
  const start = () => {
    fix(document.body);
    new MutationObserver(list => { for (const m of list) { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(fix); } })
      .observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
const fmtLeft = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

// ===== 서버와 주고받기 =====
// 세계는 서버에 있다. 무슨 일을 하든 서버에 요청하고, 서버가 돌려준 "내가 볼 수 있는 세계"로 화면을 다시 그린다.
let ORIGIN = null;  // 지도 파일에 적힌 처음 성 주인 (새 시즌이면 여기로 되돌린다)
let lastFetch = 0;  // 마지막으로 서버에서 받아 온 시각
let turnWait = 1000; // 턴이 넘어간 뒤 몇 ms 기다렸다 받아 올지: 1~6초 무작위 (2026-10-28 흩어 묻기: 모두가 같은 1초에 몰리지 않게)
let busy = false;   // 서버 요청 중

function applyView(d) {
  const oldSeason = S && S.season;
  S = d.view || null;
  if (S && oldSeason && S.season !== oldSeason) { location.reload(); return; } // 게임 화면에 있는 동안 새 시즌이 시작됐다 (자동 시즌 시작, 2026-11-02)
  if (S) S.timeOffset += d.serverNow - Date.now(); // 내 컴퓨터 시계를 서버 시계에 맞춘다
  IS_ADMIN = !!d.admin;
  $('#adminBtn').hidden = !IS_ADMIN;
  // 오른쪽 위 순위 단추에 내 순위를 함께 (세계를 받아 올 때마다 새로)
  const myRank = S && me() ? meritRanking().findIndex(g => g.name === me().name && g.faction === me().faction) + 1 : 0;
  $('#rankBtn').textContent = myRank ? `🏆 순위 (${myRank}위)` : '🏆 순위';
  ACCOUNTS = d.accounts || {};
  lastFetch = Date.now();
  turnWait = 1000 + Math.random() * 5000; // 다음 턴에 받아 올 때 기다릴 시간 (사람마다 다르게)
  if (!ORIGIN) ORIGIN = MAP.cities.map(c => c.faction);
  MAP.cities.forEach((c, i) => { c.faction = ORIGIN[i]; });
  if (S) applyOwners();
  syncChatChannel();
}

// 서버에 요청하고 세계를 받아 온다. 성공하면 true (실패 이유는 알림 창으로)
async function call(action, payload = {}) {
  busy = true;
  try {
    const d = await api(action, payload);
    // 정지된 계정은 로그아웃. 시즌 준비 중이면 로그인한 채로 첫 화면으로: 게임은 못 들어가도 게시판은 쓴다 (관리자는 들어온다, 2026-10-31)
    if (d.banned) { await logout(); sayTitle(d.error); return null; }
    if (d.preparing) { IS_ADMIN = false; showTitle(preparing ? undefined : d.error); return null; } // 문이 닫혔으면 첫 화면 안내가 맡고, 통일 뒤 장수가 없는 사람에게는 이유를 보여 준다
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
  // 공적 순위의 소속은 명예의 전당처럼 가장 오래 몸담은 세력으로 (2026-10-27)
  const rows = rankRows(meritRanking().map(r => ({ ...r, faction: homeFaction(S.generals[r.id]) })));
  openModal(`
    <h2>🏆 천하통일</h2>
    <p class="unifyHead"><span class="swatch" style="background:${f.color}"></span><b class="hi">${esc(f.name)}</b> 세력이 천하를 손에 넣었습니다!</p>
    <p class="dim">${dateText(0)} → ${dateText(u.turn)} (${u.turn}달)</p>
    <h3>공적 순위 <span class="dim small">· 상위 10명</span></h3>
    <table class="stats rank members"><tr><th>순위</th><th>장수</th><th>세력</th><th>공적</th></tr>${rows}</table>
    <p class="dim">이번 시즌은 여기서 끝났어요. 다음 시즌을 기다려 주세요.</p>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`);
}

// 관리자 보기 탭: 유저 목록(이번 시즌 장수) · 세력 채팅 · 가입자(계정 전체)
const adminTabs = tab => `<div class="helpTabs">${[['users', '유저 목록'], ['chat', '세력 채팅'], ['members', '가입자']].map(([k, t]) =>
  `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${t}</button>`).join('')}</div>`;
// 가입자 탭 (2026-10-31): 가입한 계정 전체. 장수가 없는 계정도 보이고 정지할 수 있다. 검색은 다시 그리지 않고 줄만 숨긴다 (한글 입력)
async function membersDialog() {
  openModal(`<h2>👁 관리자 보기</h2>${adminTabs('members')}<p class="dim">불러오는 중…</p><div class="modalBtns"><button data-close class="main">닫기</button></div>`);
  $('#modalBox').classList.add('adminBox');
  let d;
  try { d = await api('adminMembers'); } catch (e) { d = { error: e.message }; }
  if ($('#modal').hidden) return; // 불러오는 사이에 닫았다
  const list = d.members || [];
  const banText = t => (t > Date.now() ? `⛔ ${t - Date.now() > 5 * 365 * 24 * HOUR ? '영구' : fmtTime(t).split(' ')[0] + '까지'}` : '');
  const rows = list.map(m => {
    const g = S && S.generals[m.id];
    const prev = m.prev || []; // 예전 아이디 (최근 것부터). 옛 아이디로 검색해도 찾아진다
    return `<tr data-name="${esc([m.name, ...prev.map(h => h.name)].join(' ').toLowerCase())}"><td>${esc(m.name)}</td><td>${prev.length ? prev.map(h => `${esc(h.name)} <span class="dim small">(${fmtTime(h.t).split(' ')[0]}까지)</span>`).join('<br>') : '<span class="dim">-</span>'}</td><td>${m.at ? fmtTime(m.at) : '-'}</td>
      <td>${g ? `<button class="link" data-pid="${esc(m.id)}" title="정보 · 제재">${esc(g.name)}</button>` : '<span class="dim">없음</span>'}</td>
      <td>${medalBadge(m.medals)}</td><td>${m.admin ? '관리자' : banText(m.ban)}</td>
      <td>${m.admin ? '' : `<button class="mini" data-mban="${esc(m.id)}">정지</button>`}</td></tr>`;
  }).join('');
  openModal(`<h2>👁 관리자 보기</h2>${adminTabs('members')}
    ${d.error ? `<p>${esc(d.error)}</p>` : `<p><input type="text" id="memberFind" placeholder="아이디 검색" autocomplete="off"> <span class="dim" id="memberCount">모두 ${list.length}명</span></p>
    <div class="adminScroll"><table class="stats rank"><tr><th>아이디</th><th>예전 아이디</th><th>가입 시각</th><th>이번 시즌 장수</th><th>훈장</th><th>상태</th><th></th></tr>${rows}</table></div>`}
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => adminDialog(b.dataset.tab); });
    box.querySelectorAll('[data-pid]').forEach(b => { b.onclick = () => playerDialog(b.dataset.pid, 'members'); });
    box.querySelectorAll('[data-mban]').forEach(b => { b.onclick = () => memberBanDialog(list.find(m => m.id === b.dataset.mban)); });
    const find = box.querySelector('#memberFind');
    if (find) find.oninput = () => {
      const q = find.value.trim().toLowerCase();
      let n = 0;
      box.querySelectorAll('tr[data-name]').forEach(tr => { const show = tr.dataset.name.includes(q); tr.hidden = !show; if (show) n++; });
      box.querySelector('#memberCount').textContent = `${n}명`;
    };
  });
  $('#modalBox').classList.add('adminBox');
}
function memberBanDialog(m) {
  const banned = m.ban > Date.now();
  openModal(`<h2>🛠 ${esc(m.name)} <span class="dim small">· 계정 정지</span></h2>
    <p>정지되는 동안 아예 접속할 수 없어요.${banned ? ` 지금 정지 중이에요.` : ''}</p>
    <p><button data-days="1" class="danger">하루</button> <button data-days="7" class="danger">7일</button> <button data-days="3650" class="danger">영구</button>${banned ? ' <button data-days="0">풀기</button>' : ''}</p>
    <div class="modalBtns"><button id="mBack">◀ 목록</button><button data-close class="main">닫기</button></div>`, box => {
    box.querySelector('#mBack').onclick = () => membersDialog();
    box.querySelectorAll('[data-days]').forEach(b => { b.onclick = async () => {
      const days = +b.dataset.days;
      if (!confirm(days ? `${m.name}의 계정을 ${b.textContent} 정지할까요?` : '계정 정지를 풀까요?')) return;
      if (await call('adminBan', { id: m.id, days })) membersDialog();
    }; });
  });
}

// ===== 관리자 보기 (개발자 도구) =====
// 모든 장수의 자세한 정보(아이디·금·예약)와 모든 세력의 채팅. 서버가 관리자에게만 보내 준다
let ACCOUNTS = {}; // 계정id → 아이디 (관리자만 받는다)
// 관리자 보기 · 유저 목록: 세력을 한 번도 바꾸지 않은 장수(가입 1번)만 보기 (2026-11-03, 개국공신 후보 확인용)
let adminLoyalOnly = false;
function adminDialog(tab = 'users', fid = null) {
  if (tab === 'members') { membersDialog(); return; }
  const gens = allGenerals().sort((a, b) => String(a.faction).localeCompare(String(b.faction)) || b.merit - a.merit);
  const fname = id => (id ? esc(factionById(id).name) : '<span class="dim">재야</span>');
  const swatch = id => (id ? `<span class="swatch" style="background:${factionById(id).color}"></span>` : '');
  const counts = {};
  gens.forEach(g => { counts[g.faction || ''] = (counts[g.faction || ''] || 0) + 1; });
  const tabs = adminTabs(tab);
  let body;
  if (tab === 'users') {
    // 세력을 눌러 그 세력 장수만 본다 (재야는 '-'). 처음엔 장수가 가장 많은 세력
    const keys = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const pick = fid !== null && counts[fid === '-' ? '' : fid] ? (fid === '-' ? '' : fid) : (keys[0] || '');
    const summary = keys.map(f => `<button class="pick${f === pick ? ' on' : ''}" data-uf="${f || '-'}">${swatch(f)}${fname(f)} <span class="dim">${counts[f]}</span></button>`).join('') || '장수가 없어요.';
    // 예약은 개수만 (내용은 장수 이름을 눌러서 본다)
    const queueCount = g => (g.queue || []).filter(Boolean).length;
    const traitText = g => { const t = GENERAL_TRAITS[g.trait]; return t ? `${esc(t.name)} <span class="dim">(${t.tier})</span>` : '<span class="dim">-</span>'; };
    const faceLabel = id => { const f = FACES.find(x => x.id === id); return f ? f.style[0] + f.id.slice(1) : '-'; }; // m1 → 무1, c2 → 문2
    const changes = g => Math.max(0, (g.joins || 1) - 1); // 세력 변경 횟수 (장수 기록 창과 같은 셈)
    const rows = gens.filter(g => (g.faction || '') === pick && (!adminLoyalOnly || changes(g) === 0)).map(g => `<tr><td>${esc(ACCOUNTS[g.id] || '?')}${medalOf(g.id)}</td><td><button class="link" data-pid="${esc(g.id)}" title="정보 · 제재">${esc(g.name)}</button>${(S.mutes || {})[g.id] > Date.now() ? ' 🔇' : ''}${(S.bans || {})[g.id] > Date.now() ? ' ⛔' : ''}</td><td>${faceLabel(g.face)}</td><td>${swatch(g.faction)}${fname(g.faction)}</td>
      <td>${g.city ? esc(cityById(g.city).name) : '-'}</td><td class="num">${g.unitType ? `${g.unitType} ` : ''}${fmt(g.troops)}</td>
      <td class="num">${fmt(g.gold || 0)}</td><td class="num">${fmt(g.merit)}</td>
      <td class="num">${changes(g)}</td><td class="num">${queueCount(g)}</td><td>${traitText(g)}</td></tr>`).join('');
    body = `<div class="picks">${summary}</div><p class="dim">모두 ${gens.length}명 · ${fname(pick)} ${counts[pick] || 0}명${adminLoyalOnly ? ` 중 세력 변경 0회 ${(rows.match(/<tr>/g) || []).length}명` : ''} 보는 중
        <label class="lockSw" style="margin-left:12px"><input type="checkbox" id="aLoyal" data-keep="${pick || '-'}"${adminLoyalOnly ? ' checked' : ''}> 세력 변경 0회만</label></p>
      <div class="adminScroll"><table class="stats rank"><tr><th>아이디</th><th>장수</th><th>얼굴</th><th>세력</th><th>위치</th><th>병력</th><th>금</th><th>공적</th><th>변경</th><th>예약</th><th>특성</th></tr>${rows}</table></div>`;
  } else {
    // 채팅이 있거나 장수가 있는 세력만
    const fs = MAP.factions.filter(f => chatOf(f.id).length || counts[f.id]);
    fid = fid || (fs[0] && fs[0].id);
    const list = fid ? chatOf(fid) : [];
    body = `<div class="picks">${fs.map(f => `<button class="pick${f.id === fid ? ' on' : ''}" data-f="${f.id}">${swatch(f.id)}${esc(f.name)} <span class="dim">${chatOf(f.id).length}</span></button>`).join('') || '<p class="dim">채팅이 있는 세력이 없어요.</p>'}</div>
      <ul class="adminChat">${list.map(m => `<li><span class="t">${fmtTime(m.t)}</span><span class="who">${m.letter ? `📜 ${m.letter.dir === 'in' ? `${fName(m.letter.other)}에서 온 서신 · ` : `${fName(m.letter.other)}에 보낸 서신 · `}` : ''}${chatWho(m)}</span>${esc(m.text)}${m.id ? ` <button class="mini x" data-delchat="${esc(m.id)}" title="이 글 지우기">✕</button>` : ''}</li>`).join('') || '<li class="dim">아직 아무 말도 없어요.</li>'}</ul>`;
  }
  openModal(`<h2>👁 관리자 보기 <span class="dim small">· 새 정보는 1분마다 받아 와요</span></h2>${tabs}${body}
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelectorAll('[data-tab]').forEach(b => { b.onclick = () => adminDialog(b.dataset.tab); });
    box.querySelectorAll('[data-f]').forEach(b => { b.onclick = () => adminDialog('chat', b.dataset.f); });
    box.querySelectorAll('[data-uf]').forEach(b => { b.onclick = () => adminDialog('users', b.dataset.uf); });
    if (box.querySelector('#aLoyal')) box.querySelector('#aLoyal').onchange = e => { adminLoyalOnly = e.target.checked; adminDialog('users', e.target.dataset.keep); };
    box.querySelectorAll('[data-pid]').forEach(b => { b.onclick = () => playerDialog(b.dataset.pid, tab, fid); }); // 장수 이름 → 정보·제재
    box.querySelectorAll('[data-delchat]').forEach(b => { b.onclick = async () => { // 채팅 글 지우기 (2026-10-31)
      if (!confirm('이 글을 지울까요? 되돌릴 수 없어요.')) return;
      if (await call('adminDelChat', { id: b.dataset.delchat })) adminDialog('chat', fid);
    }; });
  });
  $('#modalBox').classList.add('adminBox');
}

// 오픈 예고 문구: 시즌 5 · 11월 8일(일) 저녁 8시 시작 예정 (연도는 보이지 않는다)
const hourText = h => (h < 6 ? `새벽 ${h}시` : h < 12 ? `오전 ${h}시` : h === 12 ? '낮 12시' : h < 18 ? `오후 ${h - 12}시` : `저녁 ${h - 12}시`);
const openText = ({ season, at }) => { const k = new Date(at + 9 * 3600000); return `시즌 ${season} · ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일(${'일월화수목금토'[k.getUTCDay()]}) ${hourText(k.getUTCHours())} 시작 예정`; };

// ===== 관리 창 (관리자만, 어느 화면에서든 오른쪽 위 "🛠 관리") =====
// 장수가 없거나 세력에 들기 전에도 쓸 수 있다. 턴·시즌을 바꾸면 모든 장수에게 적용된다
function adminToolsDialog() {
  const state = !S ? '-' : S.unified ? '천하통일 (턴 멈춤)' : S.paused ? '⏸ 멈춤' : '흐르는 중';
  const door = S && S.closed ? '🔒 닫힘 (관리자만 들어옴)' : S && S.unified ? '🔓 열림 (시즌 종료: 구경·채팅만)' : '🔓 열림';
  const ahead = S && Math.round(S.timeOffset / MIN); // 빨리 감은 분
  const plan = S && S.nextOpen, pk = plan && new Date(plan.at + 9 * 3600000); // 오픈 예약 (한국 시각으로 칸에 다시 채운다)
  openModal(`
    <h2>🛠 관리 <span class="dim small">· 관리자만 보여요</span></h2>
    <table class="stats">
      <tr><th>날짜</th><td>${S ? `${dateText(S.turn)} (${S.turn}턴)` : '-'} · ${state}</td></tr>
      <tr><th>시각</th><td>${S ? fmtTime(now()) : '-'}${ahead ? ` <span class="dim">(실제보다 ${ahead}분 빠름)</span>` : ''}</td></tr>
      <tr><th>장수</th><td>${S ? allGenerals().length : 0}명</td></tr>
      <tr><th>문</th><td>${door}</td></tr>
    </table>
    <p class="sub">턴 <span class="dim">(모든 장수에게 적용)</span></p>
    <p><button id="aPause">${S && S.paused ? '▶ 턴 다시 흐르기' : '⏸ 턴 멈추기'}</button>
       <button data-skip="1">+1턴</button> <button data-skip="5">+5턴</button> <button data-skip="12">+12턴</button></p>
    <p class="sub">보기</p>
    <p><button id="aView">👁 관리자 보기</button></p>
    <p class="sub">시즌·계정</p>
    <p><button id="aDoor">${S && S.closed ? '🔓 문 열기 (모두 들어오게)' : '🔒 문 닫기 (관리자만)'}</button></p>
    <p><button id="aSeason">새 시즌 시작</button> <button id="aReset" class="danger">완전 초기화 (내 계정)</button></p>
    <p class="sub">전체 메시지 <span class="dim">(지금 있는 모든 장수의 기록에 노란색으로, ${S ? allGenerals().length : 0}명)</span></p>
    <p><input id="aMsg" maxlength="200" value="[📢] " placeholder="200자까지" style="width:100%;box-sizing:border-box"></p><!-- 입력칸에 [📢]를 미리 넣어 둔다. 필요 없으면 지우면 된다 (2026-11-02) -->
    <p><button id="aMsgSend">보내기</button></p>
    <p class="sub">다음 시즌 오픈 예약 <span class="dim">(한국 시각)</span></p>
    <p>${plan ? `<b>${esc(openText(plan))}</b><br><span class="dim">${plan.auto ? (S.season !== plan.season ? `🔓 그 시각에 시즌 ${S.season}이 끝나 있으면 ${esc(MAP.scenario || '지금')} 지도로 시즌 ${plan.season}을 만들어 자동으로 열어요. 아직 진행 중이면 예약만 없어져요.` : '🔓 그 시각에 자동으로 열려요.') : '🔒 예고만 보여요. 새 시즌과 문은 직접 처리해요.'}</span>` : '<span class="dim">예약 없음</span>'}</p>
    <p>시즌 <input id="aoS" type="number" value="${plan ? plan.season : S ? S.season + (S.closed && !S.unified ? 0 : 1) : ''}">
       연 <input id="aoY" type="number" value="${pk ? pk.getUTCFullYear() : new Date().getFullYear()}">
       월 <input id="aoM" type="number" min="1" max="12" value="${pk ? pk.getUTCMonth() + 1 : ''}">
       일 <input id="aoD" type="number" min="1" max="31" value="${pk ? pk.getUTCDate() : ''}">
       시간 <select id="aoH">${[...Array(24).keys()].map(h => `<option value="${h}"${(pk ? pk.getUTCHours() : 20) === h ? ' selected' : ''}>${hourText(h)}</option>`).join('')}</select></p>
    <p><label class="lockSw"><input type="checkbox" id="aoAuto"${plan && plan.auto ? ' checked' : ''}> 자동 시즌 시작</label> <span class="dim small">체크하지 않으면 자동으로 열지 않아요</span></p>
    <p><button id="aoSave">${plan ? '예약 변경' : '예약 저장'}</button>${plan ? ' <button id="aoClear">예약 취소</button>' : ''}</p>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelectorAll('[data-skip]').forEach(b => { b.onclick = async () => { await call('skip', { turns: +b.dataset.skip }); afterAdmin(); }; });
    $('#aPause').onclick = async () => { await call('pause'); afterAdmin(); };
    $('#aView').onclick = () => adminDialog();
    $('#aMsgSend').onclick = async () => {
      const text = $('#aMsg').value.trim();
      if (!text || text === '[📢]') { alert('보낼 내용을 적어 주세요.'); return; }
      if (!confirm(`모든 장수의 기록에 보낼까요? 보내면 지울 수 없어요.\n\n${text}`)) return;
      if (await call('adminNotice', { text })) afterAdmin();
    };
    $('#aoSave').onclick = async () => {
      const v = id => +$(id).value;
      if (await call('nextOpen', { season: $('#aoS').value === '' ? NaN : v('#aoS'), year: v('#aoY'), month: $('#aoM').value === '' ? NaN : v('#aoM'), day: $('#aoD').value === '' ? NaN : v('#aoD'), hour: v('#aoH'), auto: $('#aoAuto').checked })) afterAdmin();
    };
    if ($('#aoClear')) $('#aoClear').onclick = async () => { if (!confirm('오픈 예약을 취소할까요? 첫 화면 예고도 사라져요.')) return; await call('nextOpen', { clear: true }); afterAdmin(); };
    $('#aDoor').onclick = async () => {
      if (!confirm(S.closed ? '문을 열까요?\n모든 사람이 로그인해서 장수를 만들고 세력에 들어올 수 있어요.\n(새 시즌이면 첫 장수가 세력에 들어올 때 턴이 흐르기 시작해요)' : '문을 닫을까요?\n관리자 말고는 아무도 들어올 수 없어요.')) return;
      await call('door'); afterAdmin();
    };
    $('#aSeason').onclick = async () => {
      if (!confirm(`새 시즌을 시작할까요?\n모든 장수와 진행 상황이 지워지고, 모두 장수 만들기부터 다시 해요. (계정은 그대로)\n새 시즌은 문이 닫힌 채로 열려요 (관리자만 들어옴). 준비가 끝나면 "문 열기"를 누르세요.\n첫 장수가 세력에 들어오면 ${MAP.scenario ? MAP.scenario + " · " : ""}${MAP.year || RULES.startYear}년 ${RULES.startMonth}월부터 턴이 흘러요.`)) return;
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
// 공적 순위 표의 줄들: 상위 10명만. 내가 10위 밖이면 맨 아래에 내 줄을 따로 붙인다
function rankRows(list) {
  const isMe = g => g.id === MY_ID; // 소속을 바꿔 보여 줄 때도 나를 찾게 계정 id로
  const myIdx = list.findIndex(isMe);
  const shown = list.map((g, i) => [g, i]).filter(([, i]) => i < 10 || i === myIdx);
  return shown.map(([g, i]) => {
    const mine = isMe(g);
    return `${i >= 10 ? '<tr><td colspan="4" class="dim center">…</td></tr>' : ''}<tr class="${mine ? 'mine' : ''}"><td class="num">${i + 1}</td><td>${esc(g.name)}${medalOf(g.id)}</td>
      <td>${g.faction ? `<span class="swatch" style="background:${factionById(g.faction).color}"></span>${esc(factionById(g.faction).name)}` : '<span class="dim">재야</span>'}</td>
      <td class="num">${fmt(g.merit)}</td></tr>`;
  }).join('');
}

function rankDialog() {
  if (!S) return;
  const list = meritRanking(), rows = rankRows(list);
  openModal(`<h2>🏆 공적 순위 <span class="dim small">· ${dateText(S.turn)} · 상위 10명 (장수 ${list.length}명)</span></h2>
    ${list.length ? `<div class="adminScroll"><table class="stats rank members"><tr><th>순위</th><th>장수</th><th>세력</th><th>공적</th></tr>${rows}</table></div>` : '<p class="dim">아직 장수가 없어요.</p>'}
    <p class="dim">공적은 수련을 뺀 명령마다 쌓이고, 전투에 이기면 많이 쌓여요.<br>천하통일 때 이 순위로 시즌을 마무리해요.</p>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`);
}

// 첫 화면: 지금 시즌 상태 (로그인 없이 서버에 물어본다)
// 시즌이 끝나고 새 시즌을 시작하기 전에는 관리자만 게임에 들어온다 (2026-10-27). 로그인과 아이디 정하기는 그때도 된다: 게시판을 쓸 수 있게 (2026-10-31)
let preparing = 0; // 준비 중인 시즌 번호 (0 = 열려 있음)
function applyLoginGate() {
  const closed = preparing && !IS_ADMIN;
  $('#tPrep').hidden = !closed;
  $('#tPrep').textContent = closed ? `🛠 시즌 ${preparing} 준비 중이에요. 그동안 게시판은 이용할 수 있어요.` : '';
  if (closed) $('#tEnter').hidden = true; // 관리자가 아니면 들어갈 수 없다
}
async function renderSeasonBadge() {
  const el = $('#tSeason');
  try {
    const s = await api('status');
    preparing = s.preparing ? s.season + (s.unified ? 1 : 0) : 0; // 통일로 끝났으면 다음 시즌, 문을 닫아 둔 새 시즌이면 그 시즌
    applyLoginGate();
    const f = s.unified && factionById(s.unified);
    const note = s.nextOpen ? `<span class="tNext">📢 ${esc(openText(s.nextOpen))}</span>` : ''; // 다음 시즌 예고: 🛠 관리에서 예약한다 (2026-11-02)
    el.innerHTML = f ? `🏆 시즌 ${s.season} 종료 · <span class="swatch" style="background:${f.color}"></span>${esc(f.name)} 천하통일` + (note ? `<br>${note}` : '')
      : s.preparing ? note // 준비 중 문구는 예고 아래 안내(tPrep)가 맡는다 (2026-10-31)
      : s.paused && !s.waiting ? `⏸ 시즌 ${s.season} · 잠시 멈춤`
      : `<span class="tNow">⚔ 시즌 ${s.season}${s.scenario ? ' ' + esc(s.scenario) : ''} 진행 중</span><span class="tDate">${dateText(s.turn, s.startYear)}</span>`; // 첫 장수를 기다리는 중이어도 "진행 중"으로 보인다
  } catch (e) { el.innerHTML = ''; }
}

// ===== 명예의 전당 (첫 화면 아래) =====
// 시즌이 끝날 때마다 서버가 남긴 공적 상위 10명 (소속 = 가장 오래 몸담은 세력. 시즌 1은 그 기록이 없어 소속 칸을 안 보인다). 모두 접혀 있고, 시즌 제목을 누르면 펼쳐진다
// 첫 화면에는 단추 하나, 내용은 하위 페이지 (2026-11-01). HOF는 최신 시즌이 맨 앞
let HOF = [], hofCur = 0, hofStart = 0;
const hofPerPage = () => (innerWidth <= 700 ? 3 : 6); // 한 줄에 보이는 시즌 수. 다 들어가면 화살표를 숨긴다
const hofSw = c => (c ? `<span class="swatch" style="background:${c}"></span>` : '');
async function renderHof() {
  const box = $('#hof');
  if (!sb) return;
  const { data, error } = await sb.from('hall_of_fame').select('season,ended_at,winner,winner_color,turn,top,heroes,start_year,scenario').order('season', { ascending: false }); // replay(세력 변화 기록)는 다시 보기를 열 때만 따로 받는다
  if (error || !data || !data.length) { box.innerHTML = ''; return; }
  HOF = data;
  box.innerHTML = `<button class="hofEntry">🏆 명예의 전당 <span class="hofLast">· 지난 통일 ${hofSw(HOF[0].winner_color)}${esc(HOF[0].winner || '?')}</span></button>`;
  box.querySelector('.hofEntry').onclick = () => { hofCur = 0; hofStart = 0; showScreen('hofPage'); hofRender(); scrollTo(0, 0); };
}
function hofRender() {
  const n = hofPerPage();
  hofStart = Math.max(0, Math.min(hofStart, HOF.length - n));
  const shown = HOF.slice(hofStart, hofStart + n);
  $('#hofChips').innerHTML = shown.map((h, k) => `<button data-i="${hofStart + k}"${hofStart + k === hofCur ? ' class="on"' : ''}>시즌 ${h.season}</button>`).join('') + '<span class="blank"></span>'.repeat(n - shown.length);
  $('#chipPrev').hidden = $('#chipNext').hidden = HOF.length <= n;
  $('#chipPrev').disabled = hofStart === 0;
  $('#chipNext').disabled = hofStart + n >= HOF.length;
  const h = HOF[hofCur], heroes = h.heroes || [];
  // 공적 1위 훈장은 시즌 4부터 (2026-11-02). 상위 10명 표의 맨 위 한 명 (동점이면 서버가 먼저 임관한 장수를 맨 위에 둔다)
  const topMerit = h.season >= 4 && h.top.length && h.top[0].merit > 0 ? [h.top[0]] : [];
  const isHero = name => heroes.some(x => x.name === name) || topMerit.some(x => x.name === name);
  const hasFaction = h.top.some(g => g.faction);
  // 훈장 칸: 시즌 4부터는 계정 기준 누적이 표에 저장된다. 그 전 시즌은 시즌 3에서 처음 받은 훈장뿐이라 개국공신이면 1
  const medals = g => g.medals ?? (isHero(g.name) ? 1 : 0);
  $('#hofView').innerHTML = `<div class="winCard"><span class="s">시즌 ${h.season}${h.scenario ? ` (${esc(h.scenario)})` : ''} · ${dateText(h.turn, h.start_year || 190)} 천하통일</span><span class="w">${hofSw(h.winner_color)} ${esc(h.winner || '?')}</span></div>
    <table class="hofTable2"><tr><th></th><th>이름</th>${hasFaction ? '<th>소속</th>' : ''}<th class="num">공적</th><th class="num">통솔</th><th class="num">무력</th><th class="num">지력</th><th class="num">훈장</th></tr>${h.top.map((g, i) => `<tr${i === 0 ? ' class="top"' : ''}><td class="num">${i + 1}</td><td>${esc(g.name)}${isHero(g.name) ? `<span class="medal" title="훈장">${MEDAL}</span>` : ''}</td>${hasFaction ? `<td>${g.faction ? `${hofSw(g.color)}<span class="fName">${esc(g.faction)}</span>` : '<span class="dim">-</span>'}</td>` : ''}<td class="num">${fmt(g.merit)}</td><td class="num">${g.lea ?? '-'}</td><td class="num">${g.war ?? '-'}</td><td class="num">${g.int ?? '-'}</td><td class="num">${medals(g)}</td></tr>`).join('')}</table>
    ${heroes.length ? `<p class="hofHeroes"><span class="medal">${MEDAL}</span> 개국공신: ${heroes.map(x => esc(x.name)).join(', ')}</p>` : ''}
    ${topMerit.length ? `<p class="hofHeroes"><span class="medal">${MEDAL}</span> 공적 1위: ${topMerit.map(x => esc(x.name)).join(', ')}</p>` : ''}
    ${HOF_NOTES[h.season] ? `<p class="hofNote dim">${esc(HOF_NOTES[h.season])}</p>` : ''}`;
}
// 명예의 전당 시즌별 맨 아랫줄 안내 (2026-11-03)
const HOF_NOTES = { 4: '*다계정 의심으로 수여가 보류된 장수가 있습니다. 사실과 다를 시 메일로 알려주세요.' };
$('#hofBack').onclick = () => showTitle();
$('#chipPrev').onclick = () => { hofStart -= hofPerPage(); hofRender(); };
$('#chipNext').onclick = () => { hofStart += hofPerPage(); hofRender(); };
$('#hofChips').onclick = e => { const b = e.target.closest('button'); if (b) { hofCur = +b.dataset.i; hofRender(); } };
addEventListener('resize', () => { if (!$('#hofPage').hidden) hofRender(); });

// ===== 턴 =====
// 턴 처리는 서버가 한다. 여기서는 세계를 다시 받아 와서 그린다
async function refresh() {
  if (busy) return;
  await call('state');
  if (!S || $('#game').hidden) return;
  render();
  renderLegend();
  renderAll();
  showWarns();
}

// ===== 예약표 =====
let slot = 0; // 예약표에서 고른 칸
const slotTime = i => turnAfter(now(), i);
// 밤 턴(rules.js night)인 칸은 예약표에서 어둡게: 바로 앞 시간이 밤이었던 턴 (지금은 01:15 ~ 07:00)
const isNightTurn = t => turnLengthAt(t - 1) === RULES.night.turnLength && RULES.night.turnLength !== RULES.turnLength;

// 고른 칸에 명령을 넣고, 다음 칸으로 넘어간다
let lastOrder = null; // 마지막으로 예약한 명령 ("빈 칸 채우기"에 쓴다)
async function reserve(order) {
  const at = slot;
  lastOrder = order;
  slot = Math.min(at + 1, RULES.queueSize - 1);
  if (!(await queueCall('order', { i: at, order }, q => { q[at] = order; }))) { slot = at; renderCommands(); }
}
async function clearSlot(i) {
  await queueCall('order', { i, order: null }, q => { q[i] = null; });
}

// 예약표 바꾸기는 서버 답을 기다리지 않고 화면에 먼저 보여 준다 (서버가 느려도 바로 보이게).
// 서버가 거절하면 서버가 돌려준 진짜 예약표로 되돌아간다. 여러 번 빠르게 누르면 마지막 답이 올 때 한 번만 맞춘다
// 서버가 몰리지 않게 요청은 한 번에 하나씩 차례로 보낸다 (화면에는 바로 보임)
let pendingOrders = 0;
let orderChain = Promise.resolve();
async function queueCall(action, payload, change) {
  change(me().queue);
  renderCommands();
  pendingOrders++;
  busy = true;
  let ok = false;
  try {
    const send = orderChain.then(() => api(action, payload));
    orderChain = send.catch(() => {});
    const d = await send;
    ok = !d.error;
    if (!ok || pendingOrders === 1) applyView(d);
    if (!ok) alert(d.error);
  } catch (e) {
    alert('서버와 연결하지 못했어요: ' + (e.message || e));
  }
  pendingOrders--;
  busy = pendingOrders > 0;
  if (!ok && !busy) await call('state'); // 실패했으면 서버의 진짜 예약표를 다시 받아 온다
  if (!busy) renderCommands();
  return ok;
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
function closeModal() { const bc = document.getElementById('boardCover'); if (bc) bc.remove(); $('#modal').hidden = true; $('#modalBox').innerHTML = ''; $('#modalBox').classList.remove('wideBox', 'adminBox', 'recBox', 'memberBox'); }

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
// 첩보가 유효한 성은 수비 장수도 이름·병종·병력까지 (2026-10-30)
function defenseText(c, defs, sep) {
  const ours = c.faction === me().faction || !!(S.cities[c.id] || {}).spied;
  const out = defs.filter(d => ours || d.guard).map(d => `${esc(d.name)} · ${d.type} ${fmt(d.troops)}`);
  if (!ours && defs.some(d => !d.guard)) out.push('장수 수비 있음');
  return out.join(sep);
}

function attackDialog() {
  const p = me(), from = cityAtSlot(p, slot), me1 = unitOf(p);
  const rows = attackTargetsFrom(from.id, p.faction).map(c => {
    const f = factionById(c.faction);
    const defs = defendersOf(c);
    const d = defs[0];
    const hidden = defs.some(x => !x.guard) && !(S.cities[c.id] || {}).spied; // 장수가 지키면 병력을 몰라 예상할 수 없다 (첩보가 유효하면 안다, 2026-10-30)
    // 다른 세력 성의 방어는 첩보가 있어야 안다 (2026-10-26)
    const wall = c.faction ? S.cities[c.id].wall : 0, seen = wall !== undefined;
    // 맨 앞에서 요격할 부대와 맞붙었을 때를 비교한다 (상성 포함, 지금 기준. 수비대장만 있을 때)
    const can = d && me1.type && !hidden && seen;
    const mine = can ? attackPower(me1, d) : 0, def = can ? defensePower(d, wall, me1) : 0;
    // 공백지는 무혈입성, 수비 부대가 있으면 전투력 비교 (모르면 ?), 수비 부대 없는 세력 성은 아래에서 성벽으로 판단
    let guess = !c.faction ? '무혈입성' : !can ? '?' : mine > def * 1.2 ? '유리' : mine < def * 0.8 ? '불리' : '비슷';
    let cls = guess;
    // 지키는 부대가 없는 세력 성: 성벽(방어)을 이번에 다 깎을 수 있는지 (지금 병력 기준)
    if (seen && !d && c.faction) {
      const lo = Math.max(1, Math.floor(p.troops * RULES.siegeRate.min)), hi = Math.max(1, Math.floor(p.troops * RULES.siegeRate.max));
      [guess, cls] = !p.troops ? ['?', '?'] : wall <= lo ? ['점령 가능', '유리'] : wall <= hi ? ['점령할 수도', '비슷'] : [`성벽 ${Math.ceil(wall / ((lo + hi) / 2))}번쯤`, '불리'];
    }
    return `<label class="opt"><input type="radio" name="tgt" value="${c.id}">
      <span class="swatch" style="background:${f ? f.color : 'var(--empty)'}"></span>
      <b>${esc(c.name)}</b> <span class="dim">${f ? esc(f.name) : '공백지'}</span>
      <span class="r">${defs.length ? defenseText(c, defs, ', ') : c.faction ? `수비 없음 · 방어 ${seen ? fmt(wall) : '?'}` : '수비 없음'} · <span class="g-${cls}">${guess}</span></span></label>`;
  }).join('');
  pickDialog('출진', `<p>${esc(from.name)}에서 병력 전부를 이끌고 바로 옆 성을 칩니다. 그 턴에 바로 전투가 벌어지고, 지키는 부대가 없거나 모두 물리치면 성벽(방어)을 공격해요. 방어가 0이 되면 점령해요.</p>
    <p class="dim">지금 ${p.unitType || '병사 없음'} ${fmt(p.troops)} · 금 ${fmt(attackGoldOf(p.troops))} (병력 1,000당 ${RULES.attackGold.per1000}) · 출진 군량 ${fmt(marchFood(p.troops))} (병력 × ${RULES.marchFoodRate}, 결과와 상관없이 사라짐) · 예상은 지금 병력 기준</p>`,
  rows, '예약', v => reserve({ cmd: 'attack', to: v }));
}

// 고른 칸이 실행될 때의 병종: 그 앞 칸에 예약한 징병이 있으면 그 병종, 없으면 지금 병종
function unitAtSlot(p, i) {
  const d = p.queue.slice(0, i).reverse().find(o => o && o.cmd === 'draft');
  return d ? d.unit : p.unitType;
}

// '병과 고정' 스위치 (2026-10-30): 켜 두면 징병을 누르자마자 그 칸 때의 병종으로 예약 (병종 고르는 창 없이). 이 브라우저에 기억
const DRAFT_LOCK_KEY = 'ddang-draft-lock';
let draftLock = false;
try { draftLock = localStorage.getItem(DRAFT_LOCK_KEY) === '1'; } catch (e) { /* 저장소를 못 쓰면 꺼진 채 */ }
function draftDialog() {
  const p = me(), from = cityAtSlot(me(), slot), cur = unitAtSlot(p, slot);
  const queuedDraft = p.queue.slice(0, slot).reverse().find(o => o && o.cmd === 'draft');
  const lockUnit = queuedDraft ? queuedDraft.unit : p.troops > 0 ? p.unitType : null;
  if (draftLock && lockUnit) { reserve({ cmd: 'draft', unit: lockUnit }); return; }
  const lea = effStats(p).lea, bonus = Math.floor(p.merit * RULES.draftPerMerit);
  const lo = lea * RULES.draftPerLea.min + bonus, hi = lea * RULES.draftPerLea.max + bonus;
  const statName = k => STATS.find(s => s.key === k).name;
  const opts = Object.entries(UNIT_TYPES).map(([t, u]) => `<label class="opt"><input type="radio" name="tgt" value="${t}"${t === cur ? ' checked' : ''}>
      <b>${t}</b> <span class="dim">${statName(u.stat)} ${effStats(p)[u.stat]}</span>
      <span class="r dim">${u.beats}에 강함 · ${Object.keys(UNIT_TYPES).find(k => UNIT_TYPES[k].beats === t)}에 약함</span></label>`).join('');
  pickDialog('징병', `<p>${esc(from.name)}에서 병사 <b class="hi">${fmt(lo)}~${fmt(hi)}</b>명을 모읍니다 (최대 병력 ${fmt(troopsMax(p))}까지). 병종마다 전투력에 쓰는 능력치가 달라요.</p>
    <p class="dim">${p.troops > 0 ? `지금 ${p.unitType} ${fmt(p.troops)}. 다른 병종을 모으면 지금 병력은 모두 흩어져요.` : '병사가 없어요. 병종을 골라 새로 모아요.'} 금 ${RULES.myGoldCost.draft}</p>`,
  opts, '예약', t => {
    if (p.troops > 0 && cur && t !== cur && !confirm(`${t}을 모으면 그때 있는 ${cur} 병력은 모두 흩어져요. 예약할까요?`)) return false;
    reserve({ cmd: 'draft', unit: t });
  }, `<p class="dim small">치안이 ${RULES.peaceLow} 미만인 성에서는 징병할 수 없어요.</p>`);
}

function spyDialog() {
  const from = cityAtSlot(me(), slot);
  const int = effStats(me()).int;
  const opts = spyTargetsFrom(from.id, me().faction).map(c => {
    const f = factionById(c.faction), until = (S.cities[c.id] || {}).spied;
    return `<label class="opt"><input type="radio" name="tgt" value="${c.id}">
      <span class="swatch" style="background:${f.color}"></span><b>${esc(c.name)}</b> <span class="dim">${esc(f.name)}</span>
      <span class="r dim">${until ? `${dateText(until)} 전까지 알고 있음` : '모름'}</span></label>`;
  }).join('');
  pickDialog('첩보', `<p>${esc(from.name)}의 이웃한 다른 세력 성에 첩자를 보내 농업·상업·방어·치안·군량을 알아냅니다. 성공하면 ${RULES.spyTurns}턴 동안 우리 세력 모두가 성 정보와 출진 창에서 볼 수 있어요.</p>
    <p class="dim">지력 ${int} · 성공 확률 약 ${Math.round((spySuccessRate(int) + (gTrait(me()).plot || 0)) * 100)}% · 금 ${RULES.myGoldCost.plot}</p>`, opts, '예약', v => reserve({ cmd: 'spy', to: v }));
}

// '능력 고정' 스위치 (2026-11-02, 징병의 병과 고정처럼): 켜 두면 수련을 누르자마자 고정된 능력치로 예약 (고르는 창 없이). 이 브라우저에 기억
// 고정되는 능력치: 이 칸보다 앞에 예약한 수련이 있으면 그 능력치, 없으면 이 브라우저에서 마지막으로 고른 능력치. 이미 최대면 고정하지 않는다
const TRAIN_LOCK_KEY = 'ddang-train-lock', TRAIN_STAT_KEY = 'ddang-train-stat';
let trainLock = false;
try { trainLock = localStorage.getItem(TRAIN_LOCK_KEY) === '1'; } catch (e) { /* 저장소를 못 쓰면 꺼진 채 */ }
function trainLockStat(p, i) {
  const queued = p.queue.slice(0, i).reverse().find(o => o && o.cmd === 'train');
  let k = queued ? queued.stat : null;
  if (!k) try { k = localStorage.getItem(TRAIN_STAT_KEY); } catch (e) { /* 없음 */ }
  return k && STATS.some(s => s.key === k) && p.stats[k] < RULES.statMax ? k : null;
}
function trainDialog() {
  const p = me(), xp = k => (p.statExp && p.statExp[k]) || 0;
  const lockStat = trainLockStat(p, slot);
  if (trainLock && lockStat) { reserve({ cmd: 'train', stat: lockStat }); return; }
  const opts = STATS.map(st => `<label class="opt"><input type="radio" name="tgt" value="${st.key}"${p.stats[st.key] >= RULES.statMax ? ' disabled' : ''}>
      <b>${st.name} 수련</b> <span class="dim">${p.stats[st.key]}</span>
      <span class="r">${bar(xp(st.key), expNeed(p.stats[st.key]))} <span class="dim">${xp(st.key)}/${expNeed(p.stats[st.key])}</span></span></label>`).join('');
  pickDialog('수련', `<p>능력치 하나를 골라 경험치를 집중해서 쌓습니다 (한 번에 ${RULES.statExp.train.min}~${RULES.statExp.train.max}). 경험치가 다 차면 그 능력치가 1 올라요.</p>
    <p class="dim">${traitOf(p.faction).freeTrain ? `금 들지 않음 (${traitOf(p.faction).name})` : `금 ${RULES.myGoldCost.train}`}</p>`, opts, '예약', v => {
      try { localStorage.setItem(TRAIN_STAT_KEY, v); } catch (e) { /* 이번만 */ }
      reserve({ cmd: 'train', stat: v });
    });
  $('#modalBox .opts').classList.add('train');
}

function siegeDialog() {
  const p = me();
  const opts = Object.entries(SIEGE).map(([t, w]) => {
    const have = p.siege && p.siege[t];
    // 설명은 16px, 괄호 부분은 다음 줄로 (2026-11-03: 충차·벽력거)
    return `<label class="opt siegeOpt"><input type="radio" name="tgt" value="${t}"${have ? ' disabled' : ''}>
      <b>${t}</b> <span class="dim">금 ${fmt(siegePrice(p, t))}</span>
      <span class="r ${have ? 'dim' : ''}">${have ? '가지고 있음' : w.desc.replace(' (', '<br>(')}</span></label>`;
  }).join('');
  pickDialog('병기 제작', `<p>금을 내고 병기를 만들어 내 부대에 갖춥니다. 공격할 때만 효과가 있어요. 부대마다 병기는 하나만 가질 수 있고, 다른 병기를 만들면 가지고 있던 병기는 사라져요. 부대가 전멸하면 50% 확률로 부서져요.</p>
    <p class="dim">지금 병기 ${Object.keys(SIEGE).find(t => p.siege && p.siege[t]) || '없음'} · 내 금 ${fmt(p.gold)}</p>`, opts, '예약', v => {
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
    <p>하나 살 때마다 그 능력치가 ${SHOP.명검.bonus} 올라요. 여러 번 살 수 있지만, 같은 물건은 살 때마다 비싸져요. (능력치 최대 ${RULES.statMax})</p>
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
      <span class="r dim">${kind === 'destroy' ? `방어 ${cs.wall === undefined ? '?' : cs.wall}` : ''}</span></label>`;
  }).join('');
  const effect = kind === 'destroy'
    ? `성공하면 그 성의 <b>방어</b>를 약 ${Math.floor(int * PLOT.destroy.wallPerInt)} 낮춰요.`
    : `성공하면 그 성의 <b>치안</b>을 약 ${Math.floor(int * PLOT.rumor.peacePerInt)}, 농업·상업을 약 ${Math.floor(int * PLOT.rumor.devPerInt)}씩 낮춰요.`;
  pickDialog(name, `<p>${esc(from.name)}의 이웃한 다른 세력 성에 ${kind === 'destroy' ? '공작대를 보내 성벽을 무너뜨립니다' : '흉흉한 소문을 퍼뜨립니다'}. ${effect} 대성공이면 ${PLOT.critMul}배!</p>
    <p class="dim">지력 ${int} · 성공 확률 약 ${Math.round((PLOT.successRate(int) + (gTrait(p).plot || 0)) * 100)}% · 금 ${RULES.myGoldCost.plot}</p>`,
  opts, '예약', v => reserve({ cmd: kind, to: v }));
}

// 군량 구매: 얼마어치 살지 고른다 (이 칸이 실행될 때 있을 성에 들어간다)
function buyFoodDialog() {
  // 쓸 금을 직접 적는다 (1~goldMax). 예전 선택지는 빠른 단추로
  const p = me(), at = cityAtSlot(p, slot), cs = S.cities[at.id], max = foodMax(at.grade), perGold = foodPrice(), { choices, goldMax } = RULES.foodBuy;
  openModal(`
    <h2>군량 구매 <span class="dim small">· ${dateText(S.turn + 1 + slot)} (${fmtClock(slotTime(slot))}) 턴에 예약</span></h2>
    <p>${esc(at.name)}에 군량을 들입니다. <b class="hi">이번 달 시세는 금 1당 군량 ${perGold}</b>이에요.</p>
    <p class="dim">시세는 매달 바뀌어요 (${RULES.foodBuy.min}~${RULES.foodBuy.max}). 실제로는 예약한 턴의 시세로 사요.</p>
    <p class="dim">${esc(at.name)} 군량 ${fmt(cs.food)} / ${fmt(max)} · 창고에 다 안 들어가면 들어가는 만큼만 사고 금도 그만큼만 내요</p>
    <p class="dim">지금 내 금 <b class="hi">${fmt(p.gold)}</b></p>
    <p class="sub">쓸 금 <span class="dim">(1~${fmt(goldMax)})</span></p>
    <p><input type="number" id="bGold" min="1" max="${goldMax}" step="1" value="${choices[0]}" style="width:110px">
      ${choices.map(n => `<button type="button" class="mini" data-gold="${n}">${fmt(n)}</button>`).join(' ')}
      <span class="dim" id="bEst"></span></p>
    <div class="modalBtns"><button data-close>취소</button><button id="mOk" class="main">예약</button></div>`, box => {
    const input = box.querySelector('#bGold');
    const est = () => { const n = Math.floor(+input.value); box.querySelector('#bEst').textContent = n >= 1 ? `→ 약 군량 ${fmt(n * perGold)}` : ''; };
    input.oninput = est;
    est();
    box.querySelectorAll('[data-gold]').forEach(b => { b.onclick = () => { input.value = b.dataset.gold; est(); }; });
    box.querySelector('#mOk').onclick = () => {
      const n = Math.floor(+input.value);
      if (!(n >= 1 && n <= goldMax)) { alert(`금은 1~${fmt(goldMax)} 사이로 적어 주세요.`); return; }
      closeModal();
      reserve({ cmd: 'buyFood', item: String(n) });
    };
  });
}

// 이동·수송 목록에서 성 이름 옆: 규모 별(★) + 이웃에 다른 세력 성이 있으면 ⚔전선 (2026-11-02)
const isFront = c => neighborsOf(MAP, c).some(n => n.faction && n.faction !== c.faction);
// 이동·수송 목록 (2026-11-03): 칼(전선)은 성 이름 옆, 규모 별은 오른쪽 정렬된 군량 글자 바로 왼쪽
const frontTag = c => (isFront(c) ? ' <span class="frontTag" title="전선: 이웃에 다른 세력 성이 있어요">⚔</span>' : '');
const gradeStars = c => `<span class="pstars" title="${GRADE_NAME[c.grade]}">${'<i></i>'.repeat(c.grade)}</span> `;

// 군량 수송: 이 턴에 있을 성과 2칸 안의 우리 성 사이에서 보내기·가져오기. 양은 1~transportMax(10,000) 직접 입력 (빠른 단추도)
function transportDialog() {
  const p = me(), at = cityAtSlot(p, slot), here = S.cities[at.id];
  const opts = linkedOwnCities(at.id, p.faction, RULES.moveRange).map(c => {
    const cs = S.cities[c.id];
    return `<label class="opt"><input type="radio" name="tgt" value="${c.id}"><b>${esc(c.name)}</b>${isFarRoad(at, c) ? ' <span class="dim">(먼 길)</span>' : ''}${frontTag(c)}
      <span class="r foodR">${gradeStars(c)}군량 ${fmt(cs.food)} / ${fmt(foodMax(c.grade))}</span></label>`;
  }).join('');
  const max = RULES.transportMax;
  const extra = `
    <p class="sub">방향</p>
    <p class="picks"><label class="opt"><input type="radio" name="dir" value="send" checked> 보내기 <span class="dim">(${esc(at.name)} → 고른 성)</span></label>
      <label class="opt"><input type="radio" name="dir" value="fetch"> 가져오기 <span class="dim">(고른 성 → ${esc(at.name)})</span></label></p>
    <p class="sub">양 <span class="dim">(1~${fmt(max)})</span></p>
    <p><input type="number" id="tAmount" min="1" max="${max}" step="1" value="1000" style="width:110px">
      ${[1000, 2000, 5000, max].map(n => `<button type="button" class="mini" data-amt="${n}">${fmt(n)}</button>`).join(' ')}</p>`;
  pickDialog('군량 수송', `<p>${esc(josa(at.name, '과와'))} 우리 땅으로 ${RULES.moveRange}칸 안의 우리 성 사이에서 군량을 옮겨요. 가는 동안 줄지 않아요.</p>
    <p class="dim">${esc(at.name)} 군량 ${fmt(here.food)} / ${fmt(foodMax(at.grade))} · 실행할 때 보내는 성에 있는 만큼만, 받는 성에 들어가는 만큼만 옮겨요</p>`,
  opts, '예약', (v, box) => {
    const amount = Math.floor(+box.querySelector('#tAmount').value);
    if (!(amount >= 1 && amount <= max)) { alert(`양은 1~${fmt(max)} 사이로 적어 주세요.`); return false; }
    const dir = box.querySelector('input[name=dir]:checked').value;
    reserve({ cmd: 'transport', to: v, dir, amount: String(amount) });
  }, extra);
  document.querySelectorAll('[data-amt]').forEach(b => { b.onclick = () => { $('#tAmount').value = b.dataset.amt; }; });
}

// 하야: 예약 없이 바로. 되돌릴 수 없으니 한 번 더 묻는다
async function resignDialog() {
  const p = me(), f = factionById(p.faction);
  if (!confirm(`지금 바로 ${f.name} 세력을 떠나 재야가 될까요?

- 거느린 병사는 모두 흩어져요.
- 예약해 둔 명령은 모두 지워져요.
- 공적·금·능력치는 그대로예요.
- 세력을 새로 골라 들어가요.
- ${f.name} 세력에는 ${RULES.rejoinWait}턴 동안 다시 들어갈 수 없어요.`)) return;
  if (await call('resign')) showJoin();
}

// 장수 삭제: 예약 없이 바로. 되돌릴 수 없고, 지운 뒤 한동안 새 장수를 못 만드니 한 번 더 묻는다 (2026-10-26)
async function deleteGeneralDialog() {
  const p = me();
  if (!confirm(`장수 ${josa(p.name, '을를')} 지우고 처음부터 다시 만들까요?

- 장수·병력·금·공적·능력치·기록이 모두 사라져요. 되돌릴 수 없어요.
- 계정(아이디)은 그대로예요.
- 지운 뒤 ${RULES.recreateWait}턴 동안은 새 장수를 만들 수 없어요.`)) return;
  if (await call('deleteGeneral')) { slot = 0; enterFlow(); }
}

function moveDialog() {
  const from = cityAtSlot(me(), slot);
  const opts = linkedOwnCities(from.id, me().faction, moveRangeOf(me()), !!gTrait(me()).freePath).map(c =>
    `<label class="opt"><input type="radio" name="tgt" value="${c.id}"><b>${esc(c.name)}</b>${isFarRoad(from, c) ? ' <span class="dim">(먼 길)</span>' : ''}${frontTag(c)}
      <span class="r foodR">${gradeStars(c)}군량 ${fmt(S.cities[c.id].food)}</span></label>`).join('');
  pickDialog('이동', `<p>${esc(from.name)}에서 내 세력의 다른 성으로 장수와 병력이 옮겨 갑니다. 한 번에 ${gTrait(me()).freePath ? '' : '우리 땅으로 '}${moveRangeOf(me())}칸까지 갈 수 있어요. 병사는 머무는 성의 군량을 먹어요.</p>`,
    opts, '예약', v => reserve({ cmd: 'move', to: v }));
}

// ===== 도움말 (초심자 안내) =====
// 핵심만 짧게. 숫자는 rules.js에서 가져와서 규칙을 고쳐도 안내가 따라간다
// 한 번에 한 항목씩: 위의 항목 단추나 이전·다음으로 넘겨 본다
function helpDialog(page = 0) {
  const turnMin = RULES.turnLength / MIN, nightMin = RULES.night.turnLength / MIN;
  const pages = [
    ['🎯 목표', '<p>세력에 들어가 동료들과 함께 이웃 성을 하나씩 차지해, 천하를 손에 넣는 게임이에요.</p>'],
    ['⏳ 턴과 명령 예약', `<ul>
      <li>1턴 = ${turnMin}분 = 게임 속 <b>1달</b>. 모든 장수가 같은 정각에 움직여요. 밤 ${RULES.night.from}~${RULES.night.to}시에는 1턴 = ${nightMin}분으로 느려져요.</li>
      <li>오른쪽 <b>명령 예약표</b>에 ${RULES.queueSize}턴까지 명령을 넣어 두면, 접속하지 않아도 한 턴에 하나씩 실행돼요.</li>
      <li>실행할 수 없는 명령(금이 모자람 등)은 <b>실패 → 대기</b>로 넘어가요. 결과는 <b>기록</b> 창에서 확인해요.</li></ul>`],
    ['💰 금과 군량', `<ul>
      <li><b>💰금</b> (내 것): 1·4·7·10월에 내가 있는 성의 <b>상업 수치</b>에 따라 들어와요. 징병·수련·상점·군량 구매에 써요. 내정은 금 없이 턴만 써요.</li>
      <li><b>🌾군량</b> (성마다 따로): 4·10월에 그 성의 <b>농업 수치</b>에 따라 수확하고, 병사는 머무는 성의 군량을 매달 먹어요. 출진하면 병력의 ${Math.round(RULES.marchFoodRate * 100)}%만큼이 소비돼요.</li></ul>`],
    ['📊 능력치', `<ul>
      <li><b>통솔</b>: 최대 병력(통솔 × ${RULES.troopsPerLea}), 징병, 치안, 보병</li>
      <li><b>무력</b>: 축성, 기병, <b>일기토</b>(양쪽 무력 ${RULES.duel.minWar} 이상이면 전투 중 가끔), <b>돌격</b>(무력 ${RULES.charge.minWar} 이상이면 전투 중 가끔), 모든 병종 전투력에 약간 보너스 (무력 20마다 +${Math.round(RULES.warAttackPer20 * 100)}%)</li>
      <li><b>지력</b>: 농업·상업, 궁병, <b>계략</b>(파괴·유언·첩보 성공률), <b>책략</b>(지력 ${RULES.scheme.minInt} 이상이면 전투 중 가끔)</li>
      <li>행동하면 그 능력치의 <b>경험치</b>가 쌓이고, 다 차면 1 올라요. (내정 → 그 내정의 능력치, 출진 → 병종의 능력치, <b>수련</b> → 고른 능력치)</li>
      <li><b>상점</b>(장수 창의 단추)에서 명마(통솔)·명검(무력)·서적(지력)를 사면 하나에 +${SHOP.명검.bonus}. 예약 없이 바로 사지고, 여러 번 살 수 있지만 살 때마다 비싸져요.</li></ul>`],
    ['⚔ 싸우는 법', `<ol>
      <li><b>징병</b>으로 병사를 모아요. 병종은 <b>기병 → 보병 → 궁병 → 기병</b> 순으로 상대에게 강해요. 다른 병종을 모으면 있던 병력은 흩어지니 조심해요.</li>
      <li>적 성을 누르면 수비대장 병력과 장수 수비가 있는지만 보여요. 수비 장수의 병력은 <b>첩보</b>에 성공해야 알 수 있어요.</li>
      <li>출진하면 최대 <b>${RULES.roundsMax}합</b>까지 싸워요. 수비 부대를 모두 쓰러뜨리면 이어서 <b>성벽</b>을 공격해요. <b>방어가 0이 되면 점령</b>해요. 지키는 장수가 없는 성도 성벽은 깎아야 해요.</li>
      <li>상대의 방어가 강하다면 <b>계략</b>(파괴·유언)으로 적 성의 방어·치안을 깎아 두면 좋아요.</li>
      <li>빈 땅(공백지)은 싸우지 않고 들어가요.</li></ol>`],
    // 전투 상세 (2026-11-04): 정확한 공식 대신 조건·느낌·예시만. 길어서 안에서 스크롤한다 (.helpScroll)
    ['🗡 전투 상세', `<div class="helpScroll">
      <p>출진하면 최대 ${RULES.roundsMax}합을 싸워요. 합 중에 아래 일이 가끔 벌어지는데, 셋 다 출진 한 번에 한 번까지만 나와요.</p>
      <p class="helpSub">⚡ 일기토</p><ul>
      <li>양쪽 모두 무력 ${RULES.duel.minWar} 이상일 때 낮은 확률로 발생해요.</li>
      <li>무력이 높은 쪽이 이기기 쉽지만, 낮은 쪽이 이길 때도 있어요.</li>
      <li>진 쪽만 병력을 잃고, 이긴 쪽 무력이 높을수록 많이 잃어요. (예: 무력 100이 이기면 1,500명 안팎)</li>
      <li><b>빠뜨롱 나와</b>가 있으면 더 자주 벌어지고, 가진 쪽이 더 잘 이겨요.</li></ul>
      <p class="helpSub">🔥 책략 · 🐎 돌격</p><ul>
      <li>책략은 지력, 돌격은 무력으로 해요. ${RULES.scheme.minInt} 이상이고 상대보다 높아야 쓸 수 있어요. 공격·수비 어느 쪽이든 써요.</li>
      <li>능력치가 높을수록 발생 확률이 높아요.</li>
      <li>상대와 능력치 차이가 클수록 아파요. (예: 차이 20이면 1,300명쯤, 60이면 2,300명쯤)</li>
      <li>책략과 돌격은 따로 세서, 한 출진에 둘 다 나올 수도 있어요.</li></ul>
      <p>🛡 <b>침착</b> 특성이 있으면 일기토·책략·돌격으로 받는 피해가 절반이에요.</p>
      <p class="helpSub">🏯 공성</p><ul>
      <li>수비 부대를 모두 물리치면(또는 막는 부대가 없으면) 성벽을 공격해요.</li>
      <li>남은 병력이 많을수록 방어를 많이 깎지만, 성벽에서 날아오는 화살·돌에 그만큼 병력도 잃어요. (예: 병력 10,000이면 방어 300~450을 깎고 1,000~1,500명을 잃어요)</li>
      <li><b>방어가 0이 되면 점령</b>이에요. 점령하면 방어는 성 크기에 따라 조금 다시 세워져요.</li>
      <li>방어가 높은 성은 수비 부대도 더 강해요. (방어 1,000이면 수비가 1.4배)</li>
      <li><b>충차</b>는 방어를 더 많이 깎고, <b>정란</b>은 수비 부대와 싸울 때 강해지고, <b>벽력거</b>는 싸우기 전에 먼저 쏴요.</li></ul>
    </div>`],
    ['📋 명령 한눈에', `
      <p class="sub">내정 <span class="dim">(금 없이 1턴)</span></p><ul>
      <li><b>농업</b>: 성의 농업을 올려요. 4·10월 수확 때 군량이 더 들어와요. (지력)</li>
      <li><b>상업</b>: 성의 상업을 올려요. 1·4·7·10월에 금이 더 들어와요. (지력)</li>
      <li><b>축성</b>: 성의 방어를 올려요. 수비할 때 전투력이 세져요 (방어 100마다 +${Math.round(100 / RULES.wallDivisor * 100)}%). (무력)</li>
      <li><b>치안</b>: 치안을 올려요. 50 아래면 수입과 징병이 줄어요. (통솔)</li></ul>
      <p class="sub">군사</p><ul>
      <li><b>징병</b>: 금 ${RULES.myGoldCost.draft}으로 병사를 모아요. 병종(보병·기병·궁병)을 골라요.</li>
      <li><b>출진</b>: 이웃 성을 공격해요. 공백지는 싸우지 않고 들어가요.</li>
      <li><b>이동</b>: 우리 땅으로 ${RULES.moveRange}칸 안의 우리 성으로 옮겨요.</li>
      ${RULES.features.siege ? '<li><b>병기</b>: 금으로 충차·정란·벽력거를 만들어요. 공격할 때 힘이 돼요.</li>' : ''}</ul>
      <p class="sub">계략 <span class="dim">(지력이 높을수록 잘 돼요)</span></p><ul>
      <li><b>파괴</b>: 이웃 적 성의 방어를 깎아요.</li>
      <li><b>유언</b>: 이웃 적 성의 치안·농업·상업을 깎아요.</li>
      ${cmdOn('spy') ? `<li><b>첩보</b>: 이웃 적 성의 농업·상업·방어·치안·군량을 알아내요. 성공하면 ${RULES.spyTurns}턴 동안 우리 세력 모두가 볼 수 있어요.</li>` : ''}</ul>
      <p class="sub">기타</p><ul>
      ${RULES.features.explore ? `<li><button class="link" id="helpExplore"><b>탐색</b></button>: 금 ${RULES.myGoldCost.explore}으로 주변을 뒤져요. 금·군량·의병·장비·능력치를 얻거나, 가끔 도적을 만나요. <span class="dim">(탐색을 누르면 확률표)</span></li>` : ''}
      <li><b>수련</b>: 금 ${RULES.myGoldCost.train}으로 고른 능력치의 경험치를 쌓아요.</li>
      <li><b>군량 구매</b>: 금을 군량으로 바꿔요. 시세는 매달 바뀌어요.</li>
      <li><b>군량 수송</b>: ${RULES.moveRange}칸 안의 우리 성과 군량을 주고받아요.</li></ul>`],
    ['💡 작은 팁', `<ul>
      <li>각 세력과 장수에게 개성을 주는 <b>특성</b>이 있어요. 장수 정보에서 확인할 수 있고, 탐색을 하면 특성을 바꿀 기회를 얻을 수도 있어요. <button class="link" id="helpTraitOdds">확률표</button></li>
      <li><b>세력</b> 창에서 세력을 누르면 그 세력의 인원수와 특성을 볼 수 있어요.</li>
      <li>장수 창의 <b>방어 모드</b>를 켜 두면, 내가 있는 성이 공격받을 때 앞장서서 막아요. 한 성에 최대 ${RULES.defenseMax}명까지 켤 수 있고, 수비 장수가 쓰러지면 병력 많은 장수가 자동으로 이어받아요.</li>
      <li><b>공적</b>이 높을수록 금 수입과 징병되는 병사가 늘어나요.</li>
      <li><b>훈장</b>: 통일 세력에 끝까지 남은 공적 상위 ${RULES.heroCount}명과 시즌 전체 공적 1위가 받아요. 한 사람이 시즌당 2개를 받지는 않아서, 시즌마다 5개 또는 6개가 지급돼요. 하나마다 다음 시즌부터 통솔·무력·지력 +${RULES.medalBonus}로 시작해요.</li>
      <li><b>수비대장</b>은 게임 초반 공백지를 제외한 성을 지켜주는 NPC 부대예요. 해당 세력의 소속 장수가 없는 동안에는 매턴 병력을 조금씩 회복하고, 한번 전멸하면 다시 생기지 않아요.</li></ul>`],
  ];
  const [title, body] = pages[page];
  const last = page === pages.length - 1;
  openModal(`
    <h2>땅국지 도움말</h2>
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
    const ex = box.querySelector('#helpExplore');
    if (ex) ex.onclick = () => exploreOddsDialog(page);
    const to = box.querySelector('#helpTraitOdds');
    if (to) to.onclick = () => traitOddsDialog(() => helpDialog(page), '도움말');
  });
  $('#modalBox').classList.add('wideBox');
}
// 도움말에서 들어가는 탐색 확률표 (2026-10-31). 숫자는 rules.js의 EXPLORE에서 읽는다. from: 돌아갈 도움말 쪽
function exploreOddsDialog(from) {
  const range = o => `${fmt(o.min)}~${fmt(o.max)}`;
  const text = {
    gold: e => `금 +${range(e)}<br><span class="dim">그중 ${Math.round(e.jackpot.rate * 100)}%는 대박 +${range(e.jackpot)}</span>`,
    food: e => `그 성 군량 +${range(e)}<br><span class="dim">그중 ${Math.round(e.jackpot.rate * 100)}%는 대박 +${range(e.jackpot)}</span>`,
    troops: e => `병력 +${range(e)} <span class="dim">(지금 병종, 없으면 보병)</span>`,
    item: () => '장비 하나 (명마·명검·서적) 획득',
    feast: e => `그 성 치안 +${e.peace}, 농업·상업 각각 +${e.min}~${e.max}`,
    none: () => '아무 일 없음',
    bandit: e => `병사가 있으면 병력 -${Math.round(e.minRate * 100)}~${Math.round(e.maxRate * 100)}%<br>없으면 금 -${Math.round(e.goldMinRate * 100)}~${Math.round(e.goldMaxRate * 100)}%`,
    master: e => `무작위 능력치 +${e.gain}`,
    pouch: () => '특성 3장 중 하나로 바꾸거나 지금 특성 유지',
  };
  const name = { gold: '금 발견', food: '군량 발견', troops: '의병 합류', item: '장비 발견', feast: '마을 잔치', none: '허탕', bandit: '도적', master: '★ 달인', pouch: '★ 특성 주머니' };
  const rows = [...EXPLORE].sort((a, b) => b.weight - a.weight).map(e => `<tr><th>${name[e.key]}</th><td class="num">${e.weight}%</td><td>${text[e.key](e)}</td></tr>`).join('');
  openModal(`
    <h2>탐색 확률표</h2>
    <p>금 ${RULES.myGoldCost.explore} · 1턴 · 공적 +${RULES.merit.explore}</p>
    <table class="oddsTable">${rows}</table>
    <div class="modalBtns"><button id="exploreBack" class="main">◀ 도움말로</button></div>`, box => {
    box.querySelector('#exploreBack').onclick = () => helpDialog(from);
  });
  $('#modalBox').classList.add('wideBox');
}

// ===== 화면 전환 (기획서 12장 화면 흐름) =====
// 7 장수 생성 → 4 세력 선택 → 5 메인 화면. 1·6 로그인·가입은 서버 단계에서 만든다.
// 처음 켤 때 "로딩 중..." 덮개: 첫 화면이 정해지고 글꼴(둥근모)까지 받은 뒤에 걷는다. 아무리 늦어도 10초 뒤엔 걷는다 (2026-10-27)
let loaderDone = false;
function hideLoader() {
  if (loaderDone) return;
  loaderDone = true;
  const off = () => { $('#loader').hidden = true; document.body.classList.remove('loading'); };
  Promise.race([document.fonts.load('16px Sam3KR'), new Promise(ok => setTimeout(ok, 10000))]).then(off, off);
}
setTimeout(() => { $('#loader').hidden = true; document.body.classList.remove('loading'); }, 15000); // 혹시 첫 화면을 못 정해도 덮개가 영영 남지 않게

function showScreen(id) {
  hideLoader();
  ['title', 'hofPage', 'create', 'trait', 'join', 'game'].forEach(s => { $('#' + s).hidden = s !== id; });
  closeModal();
  // 오른쪽 위 접속 정보: 로그인 화면이 아니면 보인다
  $('#who').hidden = id === 'title' || id === 'hofPage';
  $('#miniLink').hidden = id !== 'title';
  $('#mTabs').hidden = id !== 'game'; // 휴대폰 아래 탭은 게임 화면에서만
  $('#refreshBtn').hidden = id !== 'game'; // 새로고침 단추도 게임 화면에서만
  document.body.classList.toggle('inGame', id === 'game'); // 휴대폰: 게임 화면은 앱처럼 (화면 고정, 가운데만 스크롤)
  if (id !== 'game') { $('#nowDate').textContent = ''; $('#nowSeason').textContent = ''; $('#nowScenario').textContent = ''; }
  $('#whoName').textContent = ME ? ME.nickname : '';
}

// ===== 1. 메인 / 로그인 =====
// 구글 로그인 (2026-10-26 시즌 3부터). 만 14세 이상·처리방침·약관에 동의해야 단추를 누를 수 있다.
// 구글로 처음 들어온 사람은 게임 아이디를 정한다. 로그인해 두면 다음에 열 때 바로 들어간다
const AGREE_KEY = 'ddang-agreed'; // 한 번 동의했으면 다음엔 체크가 미리 되어 있다 (이 브라우저에서만)

// 첫 화면 패치노트 (patchnotes.js). 단추는 하나, 팝업에서 좌우로 넘겨 지난 업데이트를 본다 (2026-10-31, 그 전엔 업데이트마다 단추)
function renderNotes() {
  const box = $('#notes');
  if (typeof PATCH_NOTES === 'undefined' || !PATCH_NOTES.length) { box.innerHTML = ''; return; }
  // 빨간 NEW: 최신 패치노트에 isNew: true가 있는 동안 항상 보인다. 내릴 때는 patchnotes.js에서 지운다 (2026-10-31)
  box.innerHTML = `<div class="titleBtns"><button class="noteBtn">📜 패치노트${PATCH_NOTES[0].isNew ? ' <span class="newMark">NEW</span>' : ''}</button><button class="boardBtn">💬 게시판</button></div>`;
  box.querySelector('.noteBtn').onclick = () => noteDialog(0);
  box.querySelector('.boardBtn').onclick = () => boardDialog();
}
// ===== 게시판 (2026-10-31): 건의·자유 글과 댓글. 서버는 index.ts의 boardAction =====
// kind: '' 전체, '건의', '자유'. 다시 그릴 때 쓰던 글이 지워지지 않게 쓰기가 성공한 뒤에만 다시 불러온다
// 댓글 접기 (2026-11-03): 기본은 펼침. 접은 글은 페이지를 새로 열기 전까지 기억해서 다시 불러와도 접힌 채로 둔다
const BOARD_FOLDED = new Set();
const foldText = (id, n) => (BOARD_FOLDED.has(id) ? `▼ 댓글 ${n}개 펴기` : '▲ 댓글 접기');
// 게시판이 이미 열려 있으면 (글쓰기·댓글·지우기·탭·쪽 넘기기) 창을 그대로 두고 반투명 검정으로 덮는다 (2026-11-03: 창 크기가 들썩이지 않게)
function boardCover(on) {
  const old = document.getElementById('boardCover');
  if (old) old.remove();
  if (!on) return;
  const r = $('#modalBox').getBoundingClientRect(), c = document.createElement('div');
  c.id = 'boardCover';
  c.textContent = '불러오는 중…';
  Object.assign(c.style, { top: r.top + 'px', left: r.left + 'px', width: r.width + 'px', height: r.height + 'px' });
  $('#modal').appendChild(c);
}
async function boardDialog(page = 0, kind = '') {
  const reopen = !$('#modal').hidden && $('#modalBox').querySelector('.boardList');
  if (reopen) boardCover(true);
  else {
    openModal('<h2>💬 게시판</h2><p class="dim">불러오는 중…</p><div class="modalBtns"><button data-close class="main">닫기</button></div>');
    $('#modalBox').classList.add('wideBox');
  }
  let d;
  try { d = await api('boardList', { page, kind }); } catch (e) { d = { error: e.message }; }
  boardCover(false);
  if ($('#modal').hidden) return; // 불러오는 사이에 닫았다
  if (d.error) { openModal(`<h2>💬 게시판</h2><p>${esc(d.error)}</p><div class="modalBtns"><button data-close class="main">닫기</button></div>`); return; }
  const canWrite = d.me && !d.me.banned;
  const who = x => `<span class="who${x.admin ? ' boardAdmin' : ''}">${esc(x.name)}${medalBadge(x.medals)}${x.admin ? ' <small>관리자</small>' : ''}</span>`;
  const delBtn = (x, what) => (x.del ? ` <button class="mini x" data-bdel="${esc(x.id)}" data-what="${what}" title="지우기">✕</button>` : '');
  const items = d.posts.map(p => `<li class="boardPost">
      <p class="boardHead"><span class="tTag">[${esc(p.kind)}]</span> ${who(p)} <span class="dim small">${fmtTime(p.t)}</span>${delBtn(p, 'post')}</p>
      <p class="boardText">${esc(p.text)}</p>
      ${p.comments.length ? `<ul class="boardComments"${BOARD_FOLDED.has(p.id) ? ' hidden' : ''}>${p.comments.map(c => `<li><p class="boardHead">${who(c)} <span class="dim small">${fmtTime(c.t)}</span>${delBtn(c, 'comment')}</p><p class="boardText">${esc(c.text)}</p></li>`).join('')}</ul>` : ''}
      ${canWrite || p.comments.length ? `<p class="replyRow">${canWrite ? '<button type="button" class="mini replyBtn">💬 댓글</button>' : ''}${p.comments.length ? ` <button type="button" class="mini foldBtn" data-post="${esc(p.id)}" data-n="${p.comments.length}">${foldText(p.id, p.comments.length)}</button>` : ''}</p>` : ''}
      ${canWrite ? `<form class="boardReply" data-post="${esc(p.id)}" autocomplete="off" hidden><input type="text" maxlength="${d.commentMax}" placeholder="댓글 달기"><button type="submit">등록</button></form>` : ''}
    </li>`).join('') || '<li class="dim center">아직 글이 없어요. 첫 글을 남겨 보세요.</li>';
  const pages = Math.max(1, Math.ceil(d.total / d.pageSize));
  const kinds = [['', '전체'], ['건의', '건의'], ['자유', '자유']].map(([k, t]) => `<button data-kind="${k}" class="${k === kind ? 'on' : ''}">${t}</button>`).join('');
  openModal(`<h2>💬 게시판</h2>
    <div class="helpTabs">${kinds}</div>
    ${canWrite ? `<form class="boardWrite" autocomplete="off">
      <select aria-label="말머리"><option>건의</option><option>자유</option></select>
      <textarea maxlength="${d.postMax}" rows="2" placeholder="${esc(d.me.name)}(으)로 글 남기기 (${d.postMax}자까지)"></textarea>
      <button type="submit" class="main">글쓰기</button></form>` : `<p class="dim">${d.me ? '정지된 계정은 글을 쓸 수 없어요.' : '로그인하면 글과 댓글을 쓸 수 있어요.'}</p>`}
    <ul class="boardList">${items}</ul>
    <div class="notePager">
      <button id="boardPrev"${page > 0 ? '' : ' disabled'}>◀ 이전</button>
      <span class="dim">${page + 1} / ${pages}</span>
      <button id="boardNext"${page + 1 < pages ? '' : ' disabled'}>다음 ▶</button>
    </div>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelector('#boardPrev').onclick = () => boardDialog(page - 1, kind);
    box.querySelector('#boardNext').onclick = () => boardDialog(page + 1, kind);
    box.querySelectorAll('[data-kind]').forEach(b => { b.onclick = () => boardDialog(0, b.dataset.kind); });
    // 쓰기: 실패하면 쓰던 글을 그대로 두고 이유만 알려 준다
    const send = async (action, payload, btn, after) => {
      btn.disabled = true;
      try {
        const r = await api(action, payload);
        if (r.error) alert(r.error); else await after();
      } catch (e) { alert(e.message); }
      btn.disabled = false;
    };
    const write = box.querySelector('.boardWrite');
    if (write) write.onsubmit = e => {
      e.preventDefault();
      send('boardPost', { kind: write.querySelector('select').value, text: write.querySelector('textarea').value }, write.querySelector('button'), () => boardDialog(0, kind));
    };
    // [💬 댓글 달기]를 눌러야 그 글의 댓글 입력칸이 열린다 (2026-11-02). 다시 누르면 닫힌다
    box.querySelectorAll('.replyBtn').forEach(b => { b.onclick = () => {
      const f = b.closest('.boardPost').querySelector('.boardReply');
      f.hidden = !f.hidden;
      b.textContent = f.hidden ? '💬 댓글' : '닫기';
      if (!f.hidden) f.querySelector('input').focus();
    }; });
    box.querySelectorAll('.foldBtn').forEach(b => { b.onclick = () => {
      const id = b.dataset.post, list = b.closest('.boardPost').querySelector('.boardComments');
      if (BOARD_FOLDED.has(id)) BOARD_FOLDED.delete(id); else BOARD_FOLDED.add(id);
      list.hidden = BOARD_FOLDED.has(id);
      b.textContent = foldText(id, +b.dataset.n);
    }; });
    box.querySelectorAll('.boardReply').forEach(f => { f.onsubmit = e => {
      e.preventDefault();
      send('boardComment', { post: f.dataset.post, text: f.querySelector('input').value }, f.querySelector('button'), () => { BOARD_FOLDED.delete(f.dataset.post); return boardDialog(page, kind); }); // 댓글을 달면 그 글 댓글은 펼친다
    }; });
    box.querySelectorAll('[data-bdel]').forEach(b => { b.onclick = () => {
      if (!confirm('지울까요? 되돌릴 수 없어요.')) return;
      send('boardDel', { id: b.dataset.bdel, what: b.dataset.what }, b, () => boardDialog(page, kind));
    }; });
  });
  $('#modalBox').classList.add('wideBox');
}
// i: PATCH_NOTES 순서 (0이 최신). ◀ 더 옛날, ▶ 더 최신
function noteDialog(i) {
  const n = PATCH_NOTES[i], older = PATCH_NOTES[i + 1], newer = PATCH_NOTES[i - 1];
  const short = x => x.title.replace(' 주요 업데이트', '');
  openModal(`
    <h2>📜 ${n.title} <span class="dim small">(${n.date})</span></h2>
    <div class="help notesPop">${n.groups.map(gr => `<p class="noteHead">${gr.head}</p><ul>${gr.items.map(t => `<li>${t}</li>`).join('')}</ul>`).join('')}</div>
    <div class="notePager">
      <button id="noteOlder"${older ? '' : ' disabled'}>◀ ${older ? short(older) : ''}</button>
      <span class="dim">${PATCH_NOTES.length - i} / ${PATCH_NOTES.length}</span>
      <button id="noteNewer"${newer ? '' : ' disabled'}>${newer ? short(newer) : ''} ▶</button>
    </div>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`, box => {
    box.querySelector('#noteOlder').onclick = () => noteDialog(i + 1);
    box.querySelector('#noteNewer').onclick = () => noteDialog(i - 1);
  });
  $('#modalBox').classList.add('wideBox');
}
// 미니게임 일기당천: 첫 화면 상자 아래의 작은 글자로 여는 팝업. 게임 본체와 분리된 minigame.html을 띄우고, 서버와 주고받는 것은 없다 (2026-11-01)
window.miniBridge = { api: (a, p) => api(a, p), name: () => (ME && ME.nickname) || '' }; // 미니게임 창에서 랭킹을 부를 때 쓴다
function closeMinigame() { const w = $('#miniWrap'); if (w) w.remove(); }
function openMinigame() {
  closeMinigame();
  const w = document.createElement('div');
  w.id = 'miniWrap';
  w.innerHTML = '<div class="miniBox"><button class="miniClose" aria-label="닫기">✕</button><iframe src="minigame.html?t=' + Date.now() + '" title="미니게임"></iframe></div>';
  w.querySelector('.miniClose').onclick = closeMinigame;
  const f = w.querySelector('iframe');
  f.onload = () => f.contentWindow.focus(); // 바로 화살표 키가 먹게
  document.body.appendChild(w);
}
$('#miniLink').onclick = openMinigame;

function showTitle(msg) {
  showScreen('title');
  renderHof();
  renderNotes();
  renderSeasonBadge();
  const needNick = !!(ME && !ME.nickname);
  $('#tGoogleBox').hidden = needNick;
  $('#tNickBox').hidden = !needNick;
  // 로그인한 채로 첫 화면에 왔으면 (제목줄 낙관·로고를 눌러서) 로그인 대신 "입장하기" (2026-10-27, 2026-11-03 "게임으로 들어가기"에서 바꿈)
  const inGame = !!(ME && ME.nickname);
  $('#tEnter').hidden = !inGame;
  $('#tLogout').hidden = !inGame;
  $('#tAdmin').hidden = !(inGame && IS_ADMIN); // 관리자만 (2026-10-28)
  $('#tWithdraw').hidden = !inGame;
  $('#tRename').hidden = !inGame;
  if (inGame) $('#tGoogleBox').hidden = true;
  applyLoginGate();
  let agreed = false;
  try { agreed = localStorage.getItem(AGREE_KEY) === '1'; } catch (e) { /* 저장소를 못 쓰면 매번 체크 */ }
  $('#tAge').checked = $('#tAgree').checked = agreed;
  updateGoogleBtn();
  $('#tMsg').hidden = !msg;
  $('#tMsg').textContent = msg || '';
}
const sayTitle = m => { $('#tMsg').hidden = false; $('#tMsg').textContent = m; };

// 두 칸을 다 체크하면 구글 공식 로그인 단추를 보여 준다 (구글 스크립트가 늦게 오면 올 때까지 잠깐 기다린다)
let googleReady = false;
async function updateGoogleBtn() {
  const ok = $('#tAge').checked && $('#tAgree').checked;
  $('#tGoogle').hidden = !ok;
  $('#tGoogleHint').hidden = ok;
  if (!ok) return;
  try { localStorage.setItem(AGREE_KEY, '1'); } catch (e) { /* 무시 */ }
  if (googleReady) return;
  if (!(window.google && google.accounts && google.accounts.id)) { setTimeout(updateGoogleBtn, 300); return; }
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, nonce: await googleNonceHash(), callback: onGoogleCredential });
  google.accounts.id.renderButton($('#tGoogle'), { theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular', locale: 'ko', width: 260 });
  googleReady = true;
}

// 구글 팝업에서 계정을 고르면 불린다
async function onGoogleCredential(resp) {
  if (!sb) { sayTitle('서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
  try {
    await signInWithGoogleCredential(resp.credential);
    if (ME && ME.nickname) enterFlow(); else showTitle(); // 처음이면 아이디 정하기
  } catch (e) {
    sayTitle('구글 로그인에 실패했어요: ' + (e.message || e));
    googleReady = false; // 일회용 값을 새로 만들어 다시 시도할 수 있게
    $('#tGoogle').innerHTML = '';
    updateGoogleBtn();
  }
}

async function submitNick() {
  const nick = $('#tNick').value.trim();
  if (!ID_RULE.test(nick)) { sayTitle('아이디는 2~8자의 한글·영문·숫자로 정해 주세요.'); return; }
  $('#tNickGo').disabled = true;
  try {
    await registerNickname(nick);
    enterFlow();
  } catch (e) {
    sayTitle(e.message || String(e));
  } finally {
    $('#tNickGo').disabled = false;
  }
}

async function logout() {
  try { await serverSignOut(); } catch (e) { /* 무시 */ }
  S = null;
  syncChatChannel(); // 채팅 채널을 끊는다
  showTitle();
}

// 아이디 변경 (2026-10-31): 30일에 1번. 규칙 검사는 서버가 다시 한다
function renameDialog() {
  openModal(`<h2>아이디 변경</h2>
    <p>지금 아이디: <b class="hi">${esc(ME.nickname)}</b></p>
    <form id="renameForm" autocomplete="off">
      <p><input type="text" id="renameInput" maxlength="8" placeholder="새 아이디 (2~8자)"></p>
      <p class="dim">30일에 1번만 바꿀 수 있어요. 지금 아이디는 30일 동안 다른 사람이 쓸 수 없고, 이미 쓴 게시판 글은 예전 아이디로 남아요.</p>
      <p id="renameMsg" class="hi" hidden></p>
      <div class="modalBtns"><button type="submit" id="renameGo" class="main">바꾸기</button> <button type="button" data-close>취소</button></div>
    </form>`, box => {
    const say = t => { const m = box.querySelector('#renameMsg'); m.textContent = t; m.hidden = false; };
    box.querySelector('#renameForm').onsubmit = async e => {
      e.preventDefault();
      const nick = box.querySelector('#renameInput').value.trim();
      if (!ID_RULE.test(nick)) { say('아이디는 2~8자의 한글·영문·숫자로 정해 주세요.'); return; }
      if (!confirm(`아이디를 '${nick}'(으)로 바꿀까요?\n앞으로 30일 동안 다시 바꿀 수 없어요.`)) return;
      const go = box.querySelector('#renameGo');
      go.disabled = true;
      try {
        const d = await api('rename', { nickname: nick });
        if (d.error) { say(d.error); return; }
        ME.nickname = d.name;
        closeModal();
        showTitle(`아이디를 '${d.name}'(으)로 바꿨어요.`);
      } catch (err) {
        say('바꾸지 못했어요: ' + (err.message || err));
      } finally {
        go.disabled = false;
      }
    };
  });
}

// 회원 탈퇴: 장수와 계정을 지운다 (되돌릴 수 없음). 이미 쓴 채팅은 처리방침대로 3개월 뒤 지워진다
async function withdraw() {
  if (!confirm(`정말 탈퇴할까요?\n\n- 계정(구글 연결, 게임 아이디)과 이번 시즌 장수가 모두 지워져요.\n- 되돌릴 수 없어요.\n- 이미 쓴 세력 채팅과 게시판 글은 작성일로부터 3개월 뒤 지워져요.`)) return;
  try {
    const d = await api('leave');
    if (d.error) { alert(d.error); return; }
  } catch (e) { alert('탈퇴하지 못했어요: ' + (e.message || e)); return; }
  try { await serverSignOut(); } catch (e) { /* 무시 */ }
  S = null;
  syncChatChannel();
  showTitle('탈퇴했어요. 그동안 고마웠어요!');
}

// ===== 7. 장수 생성 화면 =====
const draft = { face: 'c1', base: null, bonus: {} }; // base: 주사위로 나온 통/무/지. 처음 골라 둔 얼굴은 문관 1 (윗줄 첫째, 2026-10-28)
const bonusLeft = () => RULES.startBonus - STATS.reduce((s, st) => s + (draft.bonus[st.key] || 0), 0);

function showCreate() {
  showScreen('create');
  STATS.forEach(st => { draft.bonus[st.key] = 0; });
  draft.base = rollStats();
  renderFacePick();
  renderCreateStats();
  // 장수를 지운 뒤 기다리는 중이면 알려 준다 (그때까지 결정 단추는 서버가 막는다)
  const wait = S && S.myRecreateAt ? S.myRecreateAt - S.turn : 0;
  $('#cWait').hidden = wait <= 0;
  $('#cWait').textContent = wait > 0 ? `장수를 지운 뒤라 ${wait}턴 뒤(${dateText(S.myRecreateAt)})부터 새 장수를 만들 수 있어요.` : '';
}

// 얼굴 고르기: 큰 미리보기 + 작은 얼굴 목록
function renderFacePick() {
  const big = $('#cFaceBig');
  big.innerHTML = '';
  big.appendChild(faceCanvas(draft.face));
  const list = $('#cFaces');
  list.innerHTML = '';
  [...FACES].sort((a, b) => (a.style === '문관' ? 0 : 1) - (b.style === '문관' ? 0 : 1)).forEach(f => { // 문관이 윗줄 (2026-10-28)
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
  // 개국공신 훈장: 개수만큼 통솔·무력·지력 +medalBonus (서버도 만들 때 똑같이 더한다). 숫자·합계에 미리 더해 보여 준다 (2026-10-27)
  const medals = (S && S.myMedals) || 0, mb = medals * RULES.medalBonus;
  const final = st => Math.min(RULES.statMax, base[st.key] + (draft.bonus[st.key] || 0) + mb);
  $('#cStats').innerHTML = (mb ? `<tr><th></th><td></td><td></td><td></td><td class="medalCol"><span class="medal" title="훈장 ${medals}개">${MEDAL}</span></td></tr>` : '') + STATS.map(st => {
    const b = draft.bonus[st.key] || 0;
    return `<tr><th>${st.name}</th>
      <td class="num">${final(st)}</td>
      <td class="plus">${b ? `+${b}` : ''}</td>
      <td><button class="mini" data-k="${st.key}" data-d="-1"${b ? '' : ' disabled'}>−</button>
          <button class="mini" data-k="${st.key}" data-d="1"${bonusLeft() ? '' : ' disabled'}>+</button></td>${mb ? `<td class="medalCol">+${mb}</td>` : ''}</tr>`;
  }).join('') + `<tr class="sum"><th>합계</th><td class="num">${STATS.reduce((s, st) => s + final(st), 0)}</td><td></td><td></td>${mb ? '<td></td>' : ''}</tr>`;
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
  if (await call('create', { name, face: draft.face, stats })) showTrait(); // 다음은 금낭(특성 고르기)
}

// ===== 3.5 금낭 (장수 특성 고르기, 2026-10-27) =====
// 제갈량의 금낭묘계 패러디: 비단 주머니를 누르면 열리면서 종이 3장이 나온다. 하나를 고르면 이 장수의 특성이 된다 (영구). 다시 뽑기 1번.
// 뽑기는 서버가 한다 (traitOpen·traitReroll·traitPick). 주머니 그림은 글자 지도로 찍은 도트 (한 글자 = 한 칸)
const POUCH_COLORS = { O: '#4a2c14', B: '#ead9ae', S: '#c9ad78', H: '#fbf1d2', R: '#b8231c', r: '#7a1410', G: '#f2c230', K: '#2a160c' };
const POUCH_CLOSED = [
  '........................',
  '.........OOOOOO.........',
  '........OBHBBBSO........',
  '.......OBHBBBBBSO.......',
  '........OBBBBBSO........',
  '.........RRGGRR.........',
  '........RrRGGRrR........',
  '.......OBBBBBBBSOr......',
  '......OBHBBBBBBBSOr.....',
  '.....OBHBBBBBBBBBSOr....',
  '....OBHBBBBBBBBBBSSO....',
  '....OBHBBBBRBBBBBBSO....',
  '...OBBHBBBRRRBBBBBSSO...',
  '...OBBBBBRRRRRBBBBSSO...',
  '...OBBBBBBRRRBBBBSSSO...',
  '...OBBBBBBBRBBBBBSSSO...',
  '...OSBBBBBBBBBBBBSSSO...',
  '....OSBBBBBBBBBBSSSO....',
  '....OSSBBBBBBBBSSSSO....',
  '.....OSSSSSSSSSSSSO.....',
  '......OOOOOOOOOOOO......',
];
const POUCH_OPEN = [
  '........................',
  '.....OO.........OO......',
  '....OBHO.......OBSO.....',
  '....OBBHOOOOOOOBBSO.....',
  '.....OBKKKKKKKKKBO......',
  '......OKKKKKKKKKO.......',
  '.......RRRRRRRRR........',
  '.......OBBBBBBBSOR......',
  '......OBHBBBBBBBSOR.....',
  '.....OBHBBBBBBBBBSOr....',
  '....OBHBBBBBBBBBBSSO....',
  '....OBHBBBBRBBBBBBSO....',
  '...OBBHBBBRRRBBBBBSSO...',
  '...OBBBBBRRRRRBBBBSSO...',
  '...OBBBBBBRRRBBBBSSSO...',
  '...OBBBBBBBRBBBBBSSSO...',
  '...OSBBBBBBBBBBBBSSSO...',
  '....OSBBBBBBBBBBSSSO....',
  '....OSSBBBBBBBBSSSSO....',
  '.....OSSSSSSSSSSSSO.....',
  '......OOOOOOOOOOOO......',
];
const pixelSvg = rows => `<svg viewBox="0 0 ${rows[0].length} ${rows.length}" shape-rendering="crispEdges">${rows.map((row, y) => [...row].map((ch, x) => POUCH_COLORS[ch] ? `<rect x="${x}" y="${y}" width="1" height="1" fill="${POUCH_COLORS[ch]}"/>` : '').join('')).join('')}</svg>`;

// 특성 종이 한 장. 티어마다 종이가 다르다: 하 보통 종이, 중 하늘색 고급 종이, 상 빛나는 금빛 종이
function slipHtml(id, i, animate, on) {
  const t = GENERAL_TRAITS[id] || { name: id, desc: '' };
  const tierCls = { SSR: ' tBest', SR: ' tTop', R: ' tMid' }[t.tier] || ''; // SSR은 보랏빛 (2026-10-28)
  return `<button class="trSlip${tierCls}${animate ? ' rise' : ''}${on ? ' on' : ''}" data-id="${id}" style="--i:${i}">
      <span class="trSeal">${pixelSvg(['RRR', 'RGR', 'RRR'])}</span>
      <b>${esc(t.name)}</b><span class="trDesc">${esc(t.desc)}</span></button>`;
}

// 탐색에서 주운 특성 주머니 (2026-10-28): 3장 중 하나로 바꾸거나 지금 특성 유지. 다시 뽑기 없음.
// 주운 뒤 처음 화면을 그릴 때 한 번 저절로 뜨고, 고르기 전까지는 장수 창의 단추로 다시 열 수 있다
let pouchShown = '';
function pouchDialog(pick = null, animate = true) {
  const g = me(), offer = g.traitFound || [];
  if (!offer.length) return;
  pouchShown = offer.join();
  const rerolls = IS_ADMIN ? 1 : g.traitFoundRerolls || 0; // 다시 뽑기 남은 수 (2026-10-30, 관리자는 무제한)
  const now = GENERAL_TRAITS[g.trait];
  openModal(`
    <h2>🧧 특성 주머니를 열었다!</h2>
    <p>3장 중 하나로 특성을 바꾸거나, 지금 특성을 그대로 둘 수 있어요. 다시 뽑기는 1번이에요.</p>
    ${now ? `<p class="traitLine myTrait"><span class="tTag">지금</span> <b>${esc(now.name)}</b><br>${esc(now.desc)}</p>` : ''}
    <div class="trSlips">${offer.map((id, i) => slipHtml(id, i, animate, pick === id)).join('')}</div>
    <p class="center"><button id="pfReroll"${rerolls ? '' : ' disabled'}>${IS_ADMIN ? '🔄 다시 뽑기 (관리자: 무제한)' : rerolls ? `🔄 다시 뽑기 (${rerolls}번 남음)` : '다시 뽑기를 썼어요'}</button></p>
    <div class="modalBtns"><button id="pfOdds" class="btnLeft">📋 확률표</button><button data-close>나중에</button><button id="pfKeep">지금 특성 유지</button>
      <button id="pfPick" class="main"${pick ? '' : ' disabled'}>이 특성으로 바꾸기</button></div>`, box => {
    box.querySelectorAll('.trSlip').forEach(b => { b.onclick = () => pouchDialog(b.dataset.id, false); });
    $('#pfOdds').onclick = () => traitOddsDialog(() => pouchDialog(pick, false)); // 돌아오면 고른 종이는 그대로
    $('#pfReroll').onclick = async () => {
      if (!IS_ADMIN && !confirm('종이 3장을 다시 뽑을까요? 다시 뽑기는 한 번뿐이에요.')) return;
      if (await call('traitFoundReroll', {})) pouchDialog();
    };
    $('#pfKeep').onclick = async () => {
      if (!confirm('지금 특성을 그대로 둘까요? 주머니는 사라져요.')) return;
      if (await call('traitFound', {})) { closeModal(); renderAll(); }
    };
    $('#pfPick').onclick = async () => {
      const t = GENERAL_TRAITS[pick];
      if (!t || !confirm(`「${t.name}」 특성으로 바꿀까요?${now ? ` 지금 특성 「${now.name}」은 사라져요.` : ''}\n(${t.desc})`)) return;
      if (await call('traitFound', { id: pick })) { closeModal(); renderAll(); }
    };
  });
  $('#modalBox').classList.add('wideBox');
}

// 특성 확률표 (2026-10-28): 등급·이름·성능·확률을 모두 공개. 확률은 종이 한 장에 그 특성이 나올 확률 (TRAIT_TIER_WEIGHT로 계산)
// back: 돌아갈 곳, backName: 돌아가기 단추에 쓸 이름 (2026-10-31). 특성 주머니는 R 이상 1장이 꼭 나온다
function traitOddsDialog(back = null, backName = '주머니') {
  const weight = k => TRAIT_TIER_WEIGHT[GENERAL_TRAITS[k].tier] || 1;
  const ids = Object.keys(GENERAL_TRAITS), total = ids.reduce((s, k) => s + weight(k), 0);
  const order = { SSR: 0, SR: 1, R: 2, N: 3 };
  const rows = ids.sort((a, b) => order[GENERAL_TRAITS[a].tier] - order[GENERAL_TRAITS[b].tier]).map(k => {
    const t = GENERAL_TRAITS[k];
    return `<tr><td class="oddsTier t${order[t.tier]}">${t.tier}</td><th>${esc(t.name)}</th><td class="dim">${esc(t.desc)}</td><td class="num">${(weight(k) / total * 100).toFixed(1)}%</td></tr>`;
  }).join('');
  openModal(`<h2>📋 특성 확률표</h2>
    <p class="dim">종이 한 장에 그 특성이 나올 확률이에요. 한 번에 서로 다른 3장이 나와요.${back ? '<br>탐색으로 발견한 특성 주머니는 R 이상이 적어도 1장은 나와요.' : ''}</p>
    <div class="oddsScroll"><table class="oddsTable"><tr><th>등급</th><th>이름</th><th>성능</th><th class="num">확률</th></tr>${rows}</table>
    <p class="dim center trNote">높은 등급이라도 무조건 좋은 성능을 보장하지 않아요!<br>대신 더 '재밌는' 플레이를 할 수 있어요.</p></div>
    <div class="modalBtns">${back ? `<button id="oddsBack" class="main">◀ ${backName}로</button>` : '<button data-close class="main">닫기</button>'}</div>`, box => {
    if (back) box.querySelector('#oddsBack').onclick = back;
  });
  $('#modalBox').classList.add('wideBox');
}
$('#trOdds').onclick = () => traitOddsDialog();

let trChoice = null; // 고른 종이 (특성 id)
function showTrait() {
  showScreen('trait');
  trChoice = null;
  renderTrait(false);
}
// 주머니·종이·단추를 지금 상태대로 그린다. animate = 방금 열었거나 다시 뽑았으면 종이가 올라오며 펼쳐진다
function renderTrait(animate) {
  const g = me(), offer = g.traitOffer || [];
  const open = offer.length > 0;
  $('#trPouch').innerHTML = pixelSvg(open ? POUCH_OPEN : POUCH_CLOSED);
  $('#trPouch').classList.toggle('open', open);
  $('#trPouch').disabled = open;
  $('#trHint').textContent = open ? '종이 한 장을 골라 주세요. 고른 특성은 이 장수에게 부여돼요.' : '비단 주머니를 눌러 열어 보세요.';
  $('#trSlips').innerHTML = offer.map((id, i) => slipHtml(id, i, animate, trChoice === id)).join('');
  $('#trSlips').querySelectorAll('.trSlip').forEach(b => { b.onclick = () => { trChoice = b.dataset.id; renderTrait(false); }; });
  $('#trReroll').hidden = !open;
  $('#trReroll').disabled = !(IS_ADMIN || g.traitRerolls > 0); // 관리자는 무제한 (2026-10-30)
  $('#trReroll').textContent = IS_ADMIN ? '🔄 다시 뽑기 (관리자: 무제한)' : g.traitRerolls > 0 ? `🔄 다시 뽑기 (${g.traitRerolls}번 남음)` : '다시 뽑기를 썼어요';
  $('#trPick').hidden = !open;
  $('#trPick').disabled = !trChoice;
}
$('#trPouch').onclick = async () => {
  $('#trPouch').classList.add('shake'); // 흔들리다가 열린다
  const ok = await call('traitOpen');
  setTimeout(() => { $('#trPouch').classList.remove('shake'); if (ok) renderTrait(true); }, 450);
};
$('#trReroll').onclick = async () => {
  if (!IS_ADMIN && !confirm('종이 3장을 다시 뽑을까요? 다시 뽑기는 한 번뿐이에요.')) return; // 관리자는 묻지 않고 바로
  trChoice = null;
  if (await call('traitReroll')) renderTrait(true);
};
$('#trPick').onclick = async () => {
  const t = GENERAL_TRAITS[trChoice];
  if (!t || !confirm(`「${t.name}」 특성으로 정할까요?\n(${t.desc})`)) return;
  if (await call('traitPick', { id: trChoice })) showJoin();
};

// ===== 4. 세력 선택 화면 =====
let joinPick = null;  // 고른 세력
let joinCity = null;  // 시작할 성 (고른 세력의 성 가운데 하나)

function showJoin() {
  showScreen('join');
  joinPick = null;
  joinCity = null;
  renderJoin();
  fallenDialog();
}
// 내 세력이 멸망해서 세력 선택으로 왔으면 알려 준다 (2026-10-30). 서버가 g.fallen에 적어 두고, 새 세력에 들어가면 지운다. 한 번 열면 이번 접속에서는 다시 안 띄운다
let fallenShown = false;
function fallenDialog() {
  const f = S && me() && me().fallen;
  if (!f || fallenShown) return;
  fallenShown = true;
  openModal(`<h2>⚔ ${esc(f.faction)} 세력 멸망</h2>
    <p>${dateText(f.turn)}, 마지막 성 <b>${esc(f.city)}</b>${f.by ? `${josa(f.city, '이가').slice(-1)} <b>${esc(f.by)}</b> 세력에게 함락되어` : `${josa(f.city, '을를').slice(-1)} 잃어`}${esc(f.faction)} 세력이 멸망했어요.${f.meritLost ? ` 공적이 ${fmt(f.meritLost)} 줄었어요.` : ''}</p>
    <p>새 세력을 골라 다시 천하를 노려 보세요.</p>
    <div class="modalBtns"><button data-close class="main">세력 고르기</button></div>`);
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
  box.innerHTML = `
    <h2>${esc(f.name)}</h2>
    <table class="stats">
      <tr><th>장수</th><td>${memberCount(f.id)}명 <span class="dim">(소속한 유저 수)</span></td></tr>
      <tr><th>성</th><td>${cities.length}개</td></tr>
      ${traitOf(f.id).name ? `<tr><th>특성</th><td><b class="hi">${traitOf(f.id).name}</b> <span class="dim">${traitOf(f.id).desc}</span></td></tr>` : ''}
    </table>
    <p class="sub">시작할 성 <span class="dim">(지도에서 눌러도 돼요)</span></p>
    <div class="picks" id="jCities">${cities.map(c =>
      `<button class="pick${c.id === joinCity ? ' on' : ''}" data-c="${esc(c.id)}">${esc(c.name)} <span class="grade">${'★'.repeat(c.grade)}</span></button>`).join('')}</div>
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
// 휴대폰: 게임 화면을 탭(지도·장수·명령·예약·채팅) 하나씩 보여 준다. 넓은 화면에서는 탭이 숨겨져 네 칸이 다 보인다 (2026-10-27)
function setTab(t) {
  $('#game').dataset.tab = t;
  document.querySelectorAll('#mTabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  $('#game').scrollTop = 0;
  if (t === 'chat') { const ul = $('#chat .chatList'); if (ul) ul.scrollTop = ul.scrollHeight; } // 숨어 있다 나오면 맨 아래(새 글)로
  if (t === 'chat') document.querySelector('#mTabs [data-tab=chat]').classList.remove('dot'); // 받은 서신 빨간 점을 지운다
}
document.querySelectorAll('#mTabs button').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
// 새로고침 단추: 페이지를 다시 열지 않고 서버에서 최신 상태만 받아 온다 (2026-10-31)
$('#refreshBtn').onclick = async () => {
  const b = $('#refreshBtn');
  b.disabled = true;
  try { await refresh(); } finally { b.disabled = false; }
};

function enterGame() {
  showScreen('game');
  setTab('map'); // 휴대폰: 게임 화면에 들어올 때는 언제나 지도 탭부터 (2026-10-30, 그 전엔 같은 페이지에서 마지막 탭을 기억)
  selected = null;
  slot = 0;
  render();
  renderLegend();
  renderAll();
  showWarns();
}

// 안 읽은 관리자 경고 (2026-11-02): 게임 화면에 있을 때 알림 창으로 하나씩 띄운다. [확인했어요]를 누르면 서버에서 읽음으로 지운다
let warnOpen = false;
function showWarns() {
  const w = S && (S.myWarns || [])[0];
  if (!w || warnOpen || $('#game').hidden || !$('#modal').hidden) return;
  warnOpen = true;
  openModal(`<h2>⚠ 관리자 경고</h2>
    <p class="dim small">${fmtTime(w.t)}${me() ? ` · 받은 장수: ${esc(me().name)}` : ''}</p>
    <p class="warnText">${esc(w.text)}</p>
    <p class="dim small">이 경고는 장수 기록에도 남아 있어요. 문의는 metal926@naver.com</p>
    <div class="modalBtns"><button id="warnOk" class="main">확인했어요</button></div>`, () => {
    $('#warnOk').onclick = async () => {
      closeModal();
      S.myWarns = S.myWarns.filter(x => x.t > w.t); // 서버 답을 기다리지 않고 다음 경고로
      await call('warnSeen', { t: w.t });
      warnOpen = false;
      showWarns();
    };
  });
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
  // 탐색에서 특성 주머니를 주웠으면 한 번 저절로 연다 (다른 창이 떠 있으면 다음에)
  if (me().traitFound && pouchShown !== me().traitFound.join() && $('#modal').hidden) pouchDialog();
}

// 우리 세력 장수: 누가 어디에 얼마나 있는지 (공적 순). 남의 예약·금은 서버가 보내 주지 않는다
function renderMembers() {
  const p = me(), f = factionById(p.faction);
  const list = allGenerals().filter(g => g.faction === p.faction).sort((a, b) => b.merit - a.merit);
  $('#membersTitle').textContent = `· ${f.name} ${list.length}명`;
  $('#members').innerHTML = `<table class="stats rank members"><tr><th>장수</th><th>위치</th><th>병력</th><th>공적</th></tr>${list.map(g => `
      <tr class="${g.id === MY_ID ? 'mine' : ''}"><td class="name" title="${esc(g.name)}"><button class="link" data-gid="${esc(g.id)}">${esc(g.name)}</button>${medalOf(g.id)}</td><td>${esc(cityById(g.city).name)}</td>
        <td class="num">${g.unitType ? `${g.unitType[0]} ` : ''}${fmt(g.troops)}</td><td class="num">${fmt(g.merit)}</td></tr>`).join('')}</table>`;
  $('#members').onclick = e => { const b = e.target.closest('[data-gid]'); if (b) memberDialog(b.dataset.gid); };
}
// 우리 세력 장수의 이름을 누르면 뜨는 정보 창 (2026-11-01). 금·예약·활동 기록은 보여 주지 않는다 (서버도 보내지 않는다)
function memberDialog(id) {
  const g = S.generals[id];
  if (!g) return;
  const f = factionById(g.faction), t = GENERAL_TRAITS[g.trait], none = '<span class="dim">없음</span>';
  const tierNo = t ? { SSR: 0, SR: 1, R: 2, N: 3 }[t.tier] : 3; // 색은 특성 확률표(.oddsTier)와 같다
  const eff = effStats(g);
  const gear = Object.keys(SHOP).filter(k => gearCount(g, k)).map(k => `${k} ${gearCount(g, k)}`).join(' · ');
  const siege = Object.keys(SIEGE).filter(k => g.siege && g.siege[k]).join(' · ');
  const guarding = g.defense && g.troops > 0; // 장수 창과 같이 병력이 없으면 꺼짐
  openModal(`<div class="mHead"><span id="mFace"></span><div><div class="mName">${esc(g.name)}</div><div><span class="swatch" style="background:${f.color}"></span>${esc(f.name)}</div></div></div>
    <table class="mTable">
      <tr><th>위치</th><td>${esc(cityById(g.city).name)}</td></tr>
      <tr><th>특성</th><td>${t ? `<span class="oddsTier t${tierNo}">${esc(t.name)}</span> <span class="dim">(${t.tier})</span><span class="mDesc">${esc(t.desc)}</span>` : none}</td></tr>
      <tr><th>능력치</th><td>${STATS.map(s => `${s.name} ${eff[s.key]}`).join(' · ')}</td></tr>
      <tr><th>장비</th><td>${gear ? esc(gear) : none}</td></tr>
      <tr><th>병력</th><td>${g.unitType ? `${g.unitType} ` : ''}${fmt(g.troops)}</td></tr>
      <tr><th>병기</th><td>${siege ? esc(siege) : none}</td></tr>
      <tr><th>수비</th><td class="${guarding ? 'mOn' : 'dim'}">${guarding ? '켜짐' : '꺼짐'}</td></tr>
      <tr><th>공적</th><td>${fmt(g.merit)}</td></tr>
      <tr><th>훈장</th><td>${(S.medals && S.medals[id]) || 0}개</td></tr>
    </table>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`);
  $('#mFace').replaceWith(faceCanvas(g.face || FACES[0].id));
  $('#modalBox').classList.add('memberBox');
}

function bar(v, max) {
  return `<span class="bar"><span style="width:${Math.min(100, (v / max) * 100)}%"></span></span>`;
}
// 능력치 막대: 기본 능력치는 노랑, 상점 아이템으로 오른 만큼은 초록으로 이어 붙인다 (숫자는 합친 값 하나만)
function statBar(base, eff, max) {
  const w = v => Math.min(100, (v / max) * 100);
  return `<span class="bar stat"><span style="width:${w(Math.min(base, eff))}%"></span><span class="item" style="width:${w(Math.max(0, eff - base))}%"></span></span>`;
}

// 장수 창의 세력·개인 특성 칸: 접고 펼 수 있다. 처음엔 펼친 채, 고른 상태는 이 브라우저에 기억한다 (2026-10-28)
const TRAITS_KEY = 'ddang-traits-open';
let traitsOpen = true;
try { traitsOpen = localStorage.getItem(TRAITS_KEY) !== '0'; } catch (e) { /* 저장소를 못 쓰면 늘 펼친 채 */ }
function renderGeneral() {
  const p = me(), f = factionById(p.faction), city = cityById(p.city);
  $('#general').innerHTML = `
    <h2>장수</h2>
    <div class="gHead"><div class="gFaceCol"><span id="gFace"></span>${medalOf(p.id)}</div><div>
      <p class="gname">${esc(p.name)}</p>
      <table class="stats">
        <tr><th>세력</th><td><span class="swatch" style="background:${f.color}"></span>${esc(f.name)}</td></tr>
        <tr><th>위치</th><td>${esc(city.name)}</td></tr>
        <tr><th>군량</th><td>${fmt(S.cities[p.city].food)} <span class="dim">/ ${fmt(foodMax(city.grade))}</span></td></tr>
        <tr><th>병력</th><td>${p.unitType ? `${p.unitType} ` : ''}${fmt(p.troops)} <span class="dim">/ ${fmt(troopsMax(p))}</span></td></tr>
        ${RULES.features.drill ? '' : '<!--'}<tr><th>훈련</th><td>${p.training} <span class="dim">/ 100</span></td></tr>${RULES.features.drill ? '' : '-->'}
        <tr><th>방어</th><td><button id="gDefense" class="mini${p.defense && p.troops > 0 ? ' on' : ''}"${p.troops > 0 ? '' : ' disabled title="병력이 없으면 켤 수 없어요"'}>${p.defense && p.troops > 0 ? '켜짐' : '꺼짐'}</button></td></tr>
        ${RULES.features.siege ? '' : '<!--'}<tr><th>병기</th><td>${Object.keys(SIEGE).filter(t => p.siege && p.siege[t]).join(' · ') || '<span class="dim">없음</span>'}</td></tr>${RULES.features.siege ? '' : '-->'}
        ${RULES.features.shop ? '' : '<!--'}<tr><th>장비</th><td>${Object.keys(SHOP).filter(t => gearCount(p, t)).map(t => `<span class="gear">${t} ${gearCount(p, t)}</span>`).join('') || '<span class="dim">없음</span>'} <button id="gShop" class="mini">상점</button></td></tr>${RULES.features.shop ? '' : '-->'}
        <tr><th>금</th><td>${fmt(p.gold)}</td></tr>
        <tr><th>공적</th><td>${fmt(p.merit)}</td></tr>
      </table>
    </div></div>
    <details id="gTraits" class="traitFold"${traitsOpen ? ' open' : ''}><summary>특성</summary>
    ${traitOf(f.id).name ? `<p class="traitLine"><span class="tTag">세력</span> <b>${traitOf(f.id).name}</b><br>${traitOf(f.id).desc}</p>` : ''}
    ${p.trait && GENERAL_TRAITS[p.trait] ? `<p class="traitLine myTrait"><span class="tTag">개인</span> <b>${GENERAL_TRAITS[p.trait].name}</b><br>${GENERAL_TRAITS[p.trait].desc}</p>` : ''}
    ${p.traitFound ? '<p><button id="gPouch" class="main">🧧 특성 주머니 열기</button></p>' : ''}
    </details>
    <table class="statbars">${STATS.map(st => `
      <tr><th>${st.name}</th><td class="num" title="기본 ${p.stats[st.key]} + 아이템 ${effStats(p)[st.key] - p.stats[st.key]}">${effStats(p)[st.key]}</td><td>${statBar(p.stats[st.key], effStats(p)[st.key], RULES.statMax)}</td>
        <td class="xp dim" title="경험치 / 다음 1까지">${p.stats[st.key] >= RULES.statMax ? '최대' : `${(p.statExp && p.statExp[st.key]) || 0}/${expNeed(p.stats[st.key])}`}</td></tr>`).join('')}
    </table>`;
  $('#gFace').replaceWith(faceCanvas(p.face || FACES[0].id));
  if ($('#gPouch')) $('#gPouch').onclick = () => pouchDialog();
  $('#gTraits').ontoggle = e => { traitsOpen = e.target.open; try { localStorage.setItem(TRAITS_KEY, traitsOpen ? '1' : '0'); } catch (err) { /* 저장 못 해도 이번엔 그대로 */ } };
  $('#gDefense').onclick = onDefense;
  if ($('#gShop')) $('#gShop').onclick = () => shopDialog();
  if (S.unified && !IS_ADMIN) ['#gPouch', '#gDefense', '#gShop'].forEach(id => { if ($(id)) { $(id).disabled = true; $(id).onclick = null; } }); // 시즌이 끝나면 구경·채팅만 (2026-11-02)
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
  $('#nowSeason').textContent = `시즌 ${S.season || 1}`; // 상단: 몇 번째 시즌
  $('#nowScenario').textContent = S.scenario || MAP.scenario || RULES.scenario; // 상단: 시나리오 이름 (예: 관도대전)
  const statName = k => STATS.find(s => s.key === k).name;
  // 명령 단추 아래 작은 글씨에는 금을 쓰지 않는다 (2026-11-03, 14px로 키우면서 한 줄에 들어가게). 금은 각 명령 창에 보인다
  const btn = (cmd, name, sub) => (cmdOn(cmd) ? `<button data-cmd="${cmd}">${name}${sub ? `<small>${sub}</small>` : ''}</button>` : '');
  const rows = p.queue.map((o, i) => `<li data-i="${i}" class="${i === slot ? 'sel' : ''}${o ? '' : ' idle'}${isNightTurn(slotTime(i)) ? ' night' : ''}">
      <span class="t">${dateOf(S.turn + 1 + i).month}월${RULES.goldMonths.includes(dateOf(S.turn + 1 + i).month) ? '💰' : ''}${RULES.harvestMonths.includes(dateOf(S.turn + 1 + i).month) ? '🌾' : ''}</span>
      <span class="clock">${fmtClock(slotTime(i))}</span>
      <span class="what">${o ? esc(orderLabel(o)) : '대기'}</span>
      ${o ? `<button class="mini x" data-x="${i}" title="이 칸 비우기">✕</button>` : ''}</li>`).join('');
  const at = cityAtSlot(me(), slot);
  // 이 칸 때 가지고 있을 병종: 앞 칸에 징병 예약이 있으면 그 병종, 없으면 지금 병사가 있을 때만 지금 병종 ('병과 고정'은 이때만 보인다)
  const queuedDraft = p.queue.slice(0, slot).reverse().find(o => o && o.cmd === 'draft');
  const lockUnit = queuedDraft ? queuedDraft.unit : p.troops > 0 ? p.unitType : null;
  const lockStat = trainLockStat(p, slot); // '능력 고정'은 고정할 능력치가 있을 때만 보인다
  // 기타 명령: 모두 꺼져 있으면 제목도 숨긴다
  const plot = [btn('destroy', '파괴', '방어 낮추기'), btn('rumor', '유언', '치안 낮추기'), btn('spy', '첩보', '적 성 엿보기')].join('');
  const etc = [btn('explore', '탐색', ''),
    btn('train', '수련', trainLock && lockStat ? `${statName(lockStat)} 고정` : '능력치 경험'), btn('buyFood', '군량 구매', `금 1 → 군량 ${foodPrice()}`), btn('transport', '군량 수송', '보내기·가져오기'),
    gTrait(p).levy ? btn('levy', '갈취', levyBlocked(p, slot) ? '이 칸은 쿨타임' : `금 ${levyRange(p).map(fmt).join('~')} · 치안 -${gTrait(p).levy.peace}`) : '', // 개인 특성 이게 일상이야
    IS_ADMIN ? btn('adminPouch', '특성 뽑기', '관리자 · 바로') : ''].join('');
  const oldQ = $('#queueBox .queue'), qTop = oldQ ? oldQ.scrollTop : 0; // 다시 그려도 예약표 스크롤 위치는 그대로
  $('#queueBox').innerHTML = `
    <h2>명령 예약</h2>
    <p class="turnInfo">다음 턴 ${fmtClock(slotTime(0))} <span class="dim">(<b id="turnLeft"></b> 남음)</span>
      <span class="dim">· 1턴 ${RULES.turnLength / MIN}분 = 1달 (밤 ${RULES.night.from}~${RULES.night.to}시는 ${RULES.night.turnLength / MIN}분)</span></p>
    <ol class="queue">${rows}</ol>
    <p class="cmds two"><button id="qClear">칸 비우기</button><button id="qClearAll" class="danger">모두 비우기</button></p>
    <p class="cmds one"><button id="qFill"${lastOrder ? '' : ' disabled'}>빈 칸 모두 채우기<small>${lastOrder ? `마지막 명령: ${esc(orderLabel(lastOrder))}` : '명령을 하나 넣으면 쓸 수 있어요'}</small></button></p>
`;
  $('#commands').innerHTML = `
    <h2>명령</h2>
    <p class="sub">${dateText(S.turn + 1 + slot)} (${fmtClock(slotTime(slot))}) 턴에 넣을 명령 <span class="dim">(이때 ${esc(at.name)}에 있을 예정)</span></p>
    <p class="sub">내정</p>
    <div class="cmds cg-dom">${Object.entries(DOMESTIC).map(([k, d]) => btn(k, d.name, statName(d.stat))).join('')}</div>
    <p class="sub subRow">군사${lockUnit ? `<label class="lockSw" title="켜 두면 징병을 누르자마자 지금 병종으로 예약해요"><input type="checkbox" id="draftLock"${draftLock ? ' checked' : ''}> 병과 고정</label>` : ''}</p>
    <div class="cmds cg-mil">
      ${btn('draft', '징병', draftLock && lockUnit ? `${lockUnit} 고정` : '통솔')}
      ${btn('drill', '훈련', '통솔')}
      ${btn('attack', '출진', attackBlocked(p, slot) ? '이 칸은 쿨타임' : '이웃 성 공격')}
      ${btn('move', '이동', '')}
      ${btn('siege', '병기', '')}
    </div>
    <p class="sub">계략</p>
    <div class="cmds cg-plot">${plot}</div>
    ${etc ? `<p class="sub subRow">기타${lockStat ? `<label class="lockSw" title="켜 두면 수련을 누르자마자 지금 능력치로 예약해요"><input type="checkbox" id="trainLock"${trainLock ? ' checked' : ''}> 능력 고정</label>` : ''}</p>
    <div class="cmds cg-etc">${etc}</div>` : ''}
`;
  const dialogs = { adminPouch: async () => { if (await call('adminPouch')) pouchDialog(); }, buyFood: buyFoodDialog, transport: transportDialog, siege: siegeDialog, shop: shopDialog, draft: draftDialog, attack: attackDialog, move: moveDialog, spy: spyDialog, train: trainDialog, destroy: () => plotDialog('destroy'), rumor: () => plotDialog('rumor') };
  if ($('#draftLock')) $('#draftLock').onchange = e => {
    draftLock = e.target.checked;
    try { localStorage.setItem(DRAFT_LOCK_KEY, draftLock ? '1' : '0'); } catch (err) { /* 이번만 */ }
    renderCommands();
  };
  if ($('#trainLock')) $('#trainLock').onchange = e => {
    trainLock = e.target.checked;
    try { localStorage.setItem(TRAIN_LOCK_KEY, trainLock ? '1' : '0'); } catch (err) { /* 이번만 */ }
    renderCommands();
  };
  $('#commands').querySelectorAll('button[data-cmd]').forEach(b => {
    const k = b.dataset.cmd;
    b.onclick = () => (dialogs[k] ? dialogs[k]() : reserve({ cmd: k }));
  });
  const q = $('#queueBox .queue'), sel = q.querySelector('li.sel');
  q.scrollTop = qTop;
  if (sel && sel.offsetTop < q.scrollTop) q.scrollTop = sel.offsetTop; // 고른 칸이 가려지면 보이게
  else if (sel && sel.offsetTop + sel.offsetHeight > q.scrollTop + q.clientHeight) q.scrollTop = sel.offsetTop + sel.offsetHeight - q.clientHeight;
  $('#queueBox').querySelectorAll('.queue li').forEach(li => { li.onclick = () => { slot = +li.dataset.i; renderCommands(); }; });
  $('#queueBox').querySelectorAll('[data-x]').forEach(b => { b.onclick = e => { e.stopPropagation(); clearSlot(+b.dataset.x); }; });
  $('#qClear').onclick = () => clearSlot(slot);
  $('#qFill').onclick = () => { if (lastOrder) queueCall('fill', { order: lastOrder }, q => q.forEach((o, i) => { if (!o) q[i] = lastOrder; })); };
  $('#qClearAll').onclick = () => {
    if (!confirm('예약한 명령을 모두 비울까요?')) return;
    slot = 0;
    queueCall('clear', {}, q => q.fill(null));
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
// 개국공신 훈장 (2026-10-27): 그 계정이 받은 횟수만큼 🎖 (서버가 S.medals에 { 계정 id: 개수 }로 준다)
// 훈장 그림: 금메달 + 빨강·흰색·파랑 끈 (8×9 도트, 2026-10-27 기획자가 고름)
const MEDAL = '<svg viewBox="0 0 8 9" shape-rendering="crispEdges"><rect x="1" y="0" width="2" height="3" fill="#c0392b"/><rect x="3" y="0" width="2" height="3" fill="#f0e0b0"/><rect x="5" y="0" width="2" height="3" fill="#2c4a8a"/><rect x="2" y="3" width="4" height="1" fill="#8a5a10"/><rect x="1" y="4" width="6" height="4" fill="#f2c230"/><rect x="2" y="8" width="4" height="1" fill="#b07a10"/><rect x="3" y="5" width="2" height="2" fill="#fff3a0"/><rect x="6" y="5" width="1" height="3" fill="#c08a10"/></svg>';
// 훈장 표시: 2개까지는 그림 그대로, 3개부터는 그림 하나에 ×개수 (자리를 덜 차지하게, 2026-10-31)
const medalBadge = n => (n ? `<span class="medal" title="훈장 ${n}개">${n >= 3 ? `${MEDAL}<small>×${n}</small>` : MEDAL.repeat(n)}</span>` : '');
const medalOf = id => medalBadge((S && S.medals && S.medals[id]) || 0);
// 채팅에 보이는 이름: 장수 이름(보낼 때 있던 성). 성이 적혀 있지 않은 예전 글은 그 장수가 지금 있는 성으로
// linkFaction을 주면, 그 세력에 이름이 같은 장수가 딱 한 명 있을 때만 이름을 눌러 정보 창을 볼 수 있다 (2026-11-01. 채팅에는 이름만 저장되어 있다)
const chatWho = (m, linkFaction) => {
  const g = allGenerals().find(x => x.name === m.name); // 훈장도 지금 장수에서 찾는다
  const c = cityById(m.city || (g && g.city));
  const f = g && FACES.find(x => x.id === g.face); // 닉네임은 장수 얼굴 색 (2026-10-30). 장수를 못 찾으면 기본 색
  const nm = f ? `<span style="color:${f.chat}">${esc(m.name)}</span>` : esc(m.name);
  const same = linkFaction ? allGenerals().filter(x => x.faction === linkFaction && x.name === m.name) : [];
  return (same.length === 1 ? `<button class="link chatName" data-gid="${esc(same[0].id)}">${nm}</button>` : nm) + (g ? medalOf(g.id) : '') + (c ? `<span class="dim">(${esc(c.name)})</span>` : '');
};
async function sendChat(text) {
  text = text.trim().slice(0, CHAT_LEN);
  if (!text || !me().faction) return;
  await call('chat', { text });
  renderChatList();
}
// 실시간 채팅: 우리 세력의 비밀 채널(S.chatTopic)을 듣고 있다가, 누가 글을 보내면 곧바로 채팅 목록에 붙인다.
// 글은 서버에도 저장되므로, 새로고침하거나 늦게 들어와도 지난 글이 보인다
let chatChannel = null, chatTopicNow = null;
function syncChatChannel() {
  const topic = (S && S.chatTopic) || null;
  if (topic === chatTopicNow) return;
  if (chatChannel) { sb.removeChannel(chatChannel); chatChannel = null; }
  chatTopicNow = topic;
  if (!topic || !sb) return;
  chatChannel = sb.channel(topic).on('broadcast', { event: 'msg' }, ({ payload: m }) => {
    if (!S || !me() || me().faction !== m.faction) return;
    S.chat = S.chat || {};
    const list = S.chat[m.faction] || (S.chat[m.faction] = []);
    if (list.some(x => x.t === m.t && x.name === m.name && x.text === m.text)) return; // 이미 받아 온 글
    list.push({ t: m.t, name: m.name, city: m.city, text: m.text, ...(m.letter ? { letter: m.letter } : {}) });
    if (list.length > CHAT_MAX) list.splice(0, list.length - CHAT_MAX);
    if (!$('#game').hidden) renderChatList();
    if (m.letter && m.letter.dir === 'in') letterAlert();
  }).subscribe();
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
        <button type="button" class="letterBtn" title="다른 세력에 외교 서신 보내기" aria-label="외교 서신">📜</button>
      </form>
      <p class="note">같은 세력 장수들끼리만 보여요. 새 글은 곧바로 떠요. (최근 ${CHAT_MAX}개)</p>`;
    box.querySelector('.chatList').onclick = e => {
      const r = e.target.closest('[data-reply]'); if (r) { letterDialog(r.dataset.reply); return; }
      const b = e.target.closest('[data-gid]'); if (b) memberDialog(b.dataset.gid);
    };
    box.querySelector('.letterBtn').onclick = () => letterDialog();
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
    ? list.map(m => m.letter ? letterLine(m, p) : `<li class="${m.name === p.name ? 'mine' : ''}"><span class="t">${fmtClock(m.t)}</span><span class="who">${chatWho(m, p.faction)}</span>${esc(m.text)}</li>`).join('')
    : '<li class="empty">아직 아무 말도 없어요. 첫마디를 남겨 보세요.</li>';
  ul.scrollTop = ul.scrollHeight; // 새 글이 보이게 맨 아래로
}

// 외교 서신 (2026-11-03): 채팅 목록 안에 양피지 줄로. 받은 서신에는 [답장]
const fName = fid => { const f = factionById(fid); return f ? esc(f.name) : '?'; };
// 서신의 이름: 얼굴 색만 (어느 성에 있는지는 적지 않는다)
const letterWho = m => { const g = allGenerals().find(x => x.name === m.name), f = g && FACES.find(x => x.id === g.face); return f ? `<span style="color:${f.chat}">${esc(m.name)}</span>` : esc(m.name); };
function letterLine(m, p) {
  const other = m.letter.other, sw = factionById(other) ? `<span class="swatch" style="background:${factionById(other).color}"></span>` : '';
  return m.letter.dir === 'in'
    ? `<li class="letter"><span class="t">${fmtClock(m.t)}</span>📜 ${sw}<b>${fName(other)}</b> 세력 ${letterWho(m)}의 서신: ${esc(m.text)}${citiesOfFaction(other).length && me().faction ? ` <button class="mini" data-reply="${esc(other)}">답장</button>` : ''}</li>`
    : `<li class="letter out"><span class="t">${fmtClock(m.t)}</span>📜 ${sw}<b>${fName(other)}</b> 세력에 보낸 서신 (${letterWho(m)}): ${esc(m.text)}</li>`;
}
// 받은 서신 알림 (2026-11-03): 휴대폰에서 채팅 탭이 아니면 탭에 빨간 점, 다른 브라우저 탭을 보고 있으면 제목에 (개수)
let unreadLetters = 0;
const BASE_TITLE = document.title;
function letterAlert() {
  if ($('#game').dataset.tab !== 'chat') document.querySelector('#mTabs [data-tab=chat]').classList.add('dot');
  if (document.hidden) document.title = `(${++unreadLetters}) ${BASE_TITLE}`;
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && unreadLetters) { unreadLetters = 0; document.title = BASE_TITLE; } });
// 서신 쓰기 창: 받을 세력(멸망하지 않은 다른 세력)을 고르고 100자까지. to를 주면 그 세력이 골라져 있다 (답장)
function letterDialog(to) {
  const p = me(); if (!p || !p.faction) return;
  const fs = MAP.factions.filter(f => f.id !== p.faction && citiesOfFaction(f.id).length);
  if (!fs.length) { alert('서신을 보낼 세력이 없어요.'); return; }
  openModal(`<h2>📜 외교 서신</h2>
    <p>다른 세력에 서신을 보내요. 받는 세력 채팅과 우리 세력 채팅에 함께 남아요. 한 세력에는 우리 세력 전체에서 5분에 한 통만 보낼 수 있어요.</p>
    <div class="opts">${fs.map(f => `<label class="opt"><input type="radio" name="lto" value="${f.id}"${f.id === to ? ' checked' : ''}><span class="swatch" style="background:${f.color}"></span><b>${esc(f.name)}</b></label>`).join('')}</div>
    <p><input type="text" id="letterText" maxlength="${CHAT_LEN}" placeholder="서신 내용 (${CHAT_LEN}자까지)" style="width:100%"></p>
    <div class="modalBtns"><button data-close>취소</button><button id="letterOk" class="main">보내기</button></div>`, box => {
    box.querySelector('#letterOk').onclick = async () => {
      const sel = box.querySelector('input[name=lto]:checked'), text = box.querySelector('#letterText').value.trim();
      if (!sel) { alert('받을 세력을 골라 주세요.'); return; }
      if (!text) { alert('서신 내용을 적어 주세요.'); return; }
      if (await call('letter', { to: sel.value, text })) { closeModal(); renderChatList(); }
    };
  });
}

function renderLog() {
  $('#log').innerHTML = `<h2>기록</h2><ul>${(me().log || []).map(l =>
    `<li class="${l.text.includes('\n') ? 'report' : ''}${l.all ? ' notice' : ''}"><span class="t">${fmtTime(l.t)}</span>${esc(l.text).replace(/\n/g, '<br>')}</li>`).join('')}</ul>`;
}

// map.js가 성 정보 창을 그릴 때 부르는 함수들
function homeCityId() { return S && MY_ID && me() ? me().city : null; }
function cityDetailRows(c) {
  if (!S) return '';
  const cs = S.cities[c.id];
  if (!cs) return '';
  const rows = [];
  const p = me();
  // 지키는 부대
  if (!c.faction) rows.push('<tr class="wide"><th>수비</th><td class="dim">없음 (공백지)</td></tr>');
  else {
    const defs = defendersOf(c);
    rows.push(`<tr class="wide"><th>수비</th><td>${defs.length ? defenseText(c, defs, '<br>') : '<span class="dim">방어하는 장수 없음</span>'}</td></tr>`);
  }
  // 다른 세력 성의 지금 수치는 ? (서버가 보내지 않는다). 첩보가 유효하면 농업·상업·방어·치안이 온다
  // 치안이 낮으면 색으로 경고: 50 미만 주황 (수입·징병 감소), 20 미만 빨강 (징병 불가)
  const peaceCls = v => (v < RULES.peaceLow ? 'bad' : v < RULES.peaceOk ? 'warn' : '');
  const val = k => (cs[k] === undefined ? '?' : k === 'peace' && peaceCls(cs[k]) ? `<b class="${peaceCls(cs[k])}">${cs[k]}</b>` : cs[k]);
  rows.push(...Object.keys(DOMESTIC).filter(cmdOn).map(k =>
    `<tr><th>${DOMESTIC[k].label}</th><td>${val(k)} <span class="dim">/ ${devMax(c.grade, k)}</span></td></tr>`));
  if (c.faction) rows.push(`<tr class="wide"><th>군량</th><td>${cs.food === undefined ? '?' : fmt(cs.food)} <span class="dim">/ ${fmt(foodMax(c.grade))}</span></td></tr>`);
  if (cs.spied) rows.push(`<tr class="wide"><td colspan="2" class="dim">첩보 정보 · ${dateText(cs.spied)} 전까지</td></tr>`);
  return `<tr class="gap"><td colspan="2"></td></tr>${rows.join('')}`;
}

// ===== 시작 =====
// map.js가 지도를 다 읽으면 부른다. 1. 들어와 있지 않으면 로그인 화면부터
async function onMapReady() {
  try { await serverInit(); } catch (e) { /* 서버가 안 되면 첫 화면에서 알려 준다 */ }
  // 로그인돼 있고 아이디도 정했으면 바로 게임으로, 아니면 첫 화면 (구글로 처음 왔으면 아이디 정하기)
  if (ME && ME.nickname) enterFlow(); else showTitle(sb ? '' : '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
}

// 2~5. 장수·세력이 있는지 보고 알맞은 화면으로 보낸다
async function enterFlow() {
  MY_ID = ME.id;
  try { localStorage.removeItem('sam2-save'); } catch (e) { /* 서버로 옮기기 전 브라우저 저장은 이제 안 쓴다 */ }
  const ok = await call('state');
  if (ok === null) return; // 시즌 준비 중: 이미 첫 화면으로 돌아갔다
  if (!ok) { showTitle('서버에서 세계를 받아 오지 못했어요. 잠시 뒤 다시 들어가 주세요.'); return; }
  renderLegend();
  // 2. 이번 시즌 내 장수가 없으면 → 7. 장수 생성
  if (!me()) { showCreate(); return; }
  // 2.5 특성을 아직 안 골랐으면 → 금낭 (2026-10-27)
  if (!me().trait) { showTrait(); return; }
  // 3. 소속 세력이 없으면 → 4. 세력 선택
  if (!me().faction) { showJoin(); return; }
  enterGame(); // 5. 메인 화면
}


$('#cStart').onclick = createGeneral;
$('#cRoll').onclick = () => { draft.base = rollStats(); renderCreateStats(); };
$('#tAge').onchange = $('#tAgree').onchange = updateGoogleBtn;
$('#tNickBox').onsubmit = e => { e.preventDefault(); submitNick(); };
$('#tNickCancel').onclick = logout;
// 제목줄 '땅' 낙관·'땅국지' 로고: 로그인한 채로 첫 화면으로 (2026-10-27)
const goMain = () => { if (ME && ME.nickname && $('#title').hidden) showTitle(); };
document.querySelectorAll('.toTitle').forEach(el => { el.onclick = goMain; });
$('#toMain').onclick = goMain; // 상단 바 [메인] 단추: 로고를 누르는 것과 같다
$('#tEnter').onclick = () => enterFlow();
$('#tLogout').onclick = logout;
$('#tWithdraw').onclick = withdraw;
$('#tRename').onclick = renameDialog;
$('#logout').onclick = logout;
$('#helpBtn').onclick = () => helpDialog(); // 클릭 정보가 쪽 번호로 들어가지 않게
// 제목줄 ☰ 메뉴 (2026-10-28, 휴대폰·PC): 누르면 순위·관리·메인·로그아웃이 아래로 펼쳐진다. 메뉴 안 단추를 누르거나 바깥을 누르면 닫힌다
$('#menuBtn').onclick = e => { e.stopPropagation(); $('#recordBtn').hidden = !(S && me()); document.querySelector('header').classList.toggle('menuOpen'); };
// ☰ 메뉴 맨 위 [📊 정보] (2026-10-28): 누르면 내 장수의 기록 창 (서버가 g.record에 센다). 장수가 없으면 단추를 숨긴다
// 장수 기록 표의 줄 (내 기록 창·관리자 장수 창이 같이 쓴다). medals = 훈장 개수
const recordRows = (g, medals) => {
  const r = g.record || {}, n = k => fmt(r[k] || 0);
  return [['내정', `${n('domestic')}회`], ['징병', `${n('drafted')}명`], ['전투', `${n('battles')}회`], ['승전', `${n('wins')}회`], ['패전', `${n('losses')}회`],
    ['계략', `${n('plotOk')} / ${n('plotTry')}회 성공`], ['세력 변경', `${Math.max(0, (g.joins || 1) - 1)}회`], ['훈장', `${medals}개`]]
    .map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('');
};
// 관리자: 장수 한 명의 정보와 제재 (2026-10-28). 관리자 보기 → 유저 목록에서 장수 이름을 누른다. back = 돌아갈 목록 (탭, 세력)
function playerDialog(id, backTab = 'users', backF = null) {
  const g = S.generals[id];
  if (!g) return;
  const until = map => ((map || {})[id] > Date.now() ? map[id] : 0);
  const mute = until(S.mutes), ban = until(S.bans), t = GENERAL_TRAITS[g.trait];
  const st = STATS.map(s => `${s.name} ${effStats(g)[s.key]}`).join(' · ');
  const queue = (g.queue || []).filter(Boolean).map(o => esc(orderLabel(o))).join(', ') || '<span class="dim">없음</span>';
  const act = async (action, body, msg) => { if (!confirm(msg)) return; if (await call(action, { id, ...body })) playerDialog(id, backTab, backF); };
  openModal(`<h2>🛠 ${esc(g.name)}${medalOf(g.id)} <span class="dim small">· 아이디 ${esc(ACCOUNTS[id] || '?')}</span></h2>
    <table class="stats">
      <tr><th>세력</th><td>${g.faction ? esc(factionById(g.faction).name) : '재야'} · ${g.city ? esc(cityById(g.city).name) : '-'}</td></tr>
      <tr><th>능력치</th><td>${st}</td></tr>
      <tr><th>특성</th><td>${t ? `${esc(t.name)} <span class="dim">(${t.tier})</span>` : '-'}</td></tr>
      <tr><th>병력</th><td>${g.unitType ? `${g.unitType} ` : ''}${fmt(g.troops)} · 금 ${fmt(g.gold || 0)} · 공적 ${fmt(g.merit)}</td></tr>
      <tr><th>예약</th><td>${queue}</td></tr>
      <tr><th>제재</th><td>${mute ? `🔇 채팅 금지 ${fmtTime(mute)}까지` : ''}${mute && ban ? '<br>' : ''}${ban ? `⛔ 계정 정지 ${ban - Date.now() > 5 * 365 * 24 * HOUR ? '영구' : fmtTime(ban) + '까지'}` : ''}${mute || ban ? '' : '<span class="dim">없음</span>'}</td></tr>
    </table>
    <p class="sub">기록</p>
    <table class="recTable">${recordRows(g, (S.medals || {})[id] || 0)}</table>
    <p class="sub">제재 <span class="dim">(받은 사람의 기록에도 남아요)</span></p>
    <p><button id="pWarn">⚠ 경고</button> <button id="pKick"${g.faction ? '' : ' disabled'}>강제 하야</button></p>
    <p>채팅 금지: <button data-mute="1">1시간</button> <button data-mute="24">하루</button> <button data-mute="168">7일</button>${mute ? ' <button data-mute="0">풀기</button>' : ''}</p>
    <p>계정 정지: <button data-ban="1" class="danger">하루</button> <button data-ban="7" class="danger">7일</button> <button data-ban="3650" class="danger">영구</button>${ban ? ' <button data-ban="0">풀기</button>' : ''}</p>
    <div class="modalBtns"><button id="pBack">◀ 목록</button><button data-close class="main">닫기</button></div>`, box => {
    $('#pBack').onclick = () => adminDialog(backTab, backF);
    $('#pWarn').onclick = async () => {
      const text = prompt(`${g.name}에게 보낼 경고 (100자까지, 그 장수의 기록에 남아요)`, '비매너 행위로 경고합니다.');
      if (text && text.trim() && await call('adminWarn', { id, text })) playerDialog(id, backTab, backF);
    };
    $('#pKick').onclick = () => act('adminKick', {}, `${g.name}을(를) 세력에서 쫓아낼까요?\n하야처럼 병력은 흩어지고, 그 세력에는 한동안 다시 못 들어가요.`);
    box.querySelectorAll('[data-mute]').forEach(b => { b.onclick = () => act('adminMute', { hours: +b.dataset.mute }, +b.dataset.mute ? `${g.name}의 채팅을 ${b.textContent} 동안 막을까요?` : '채팅 금지를 풀까요?'); });
    box.querySelectorAll('[data-ban]').forEach(b => { b.onclick = () => act('adminBan', { days: +b.dataset.ban }, +b.dataset.ban ? `${g.name}의 계정을 ${b.textContent} 정지할까요?\n정지되는 동안 아예 접속할 수 없어요.` : '계정 정지를 풀까요?'); });
  });
  $('#modalBox').classList.add('wideBox');
}

function recordDialog() {
  const g = S && me();
  if (!g) return;
  openModal(`<h2>📊 ${esc(g.name)}의 기록</h2>
    <table class="recTable">${recordRows(g, S.myMedals || 0)}</table>
    <div class="modalBtns"><button data-close class="main">닫기</button></div>`);
  $('#modalBox').classList.add('recBox');
}
$('#recordBtn').onclick = recordDialog;
document.addEventListener('click', () => document.querySelector('header').classList.remove('menuOpen'));
// 휴대폰에서 PC 버전으로 보기 ↔ 모바일 버전으로 돌아오기 (2026-10-28). 고른 것은 이 브라우저에 기억하고 새로 연다 (index.html 맨 위에서 화면 너비를 정한다)
const setPcMode = on => { try { if (on) localStorage.setItem('ddang-pc', '1'); else localStorage.removeItem('ddang-pc'); } catch (e) { /* 저장 못 하면 이번만 */ } location.reload(); };
$('#pcBtn').onclick = () => setPcMode(true);
$('#mobileBtn').onclick = () => setPcMode(false);
$('#adminBtn').onclick = adminToolsDialog;
$('#tAdmin').onclick = async () => { if (!S) await call('state'); if (IS_ADMIN) adminToolsDialog(); }; // 첫 화면의 관리 단추 (세계를 아직 안 받았으면 먼저 받는다)
$('#cResign').onclick = resignDialog;
$('#cDelete').onclick = deleteGeneralDialog;
$('#rankBtn').onclick = rankDialog;
$('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

// 1초마다: 남은 시간·시계 갱신. 턴이 넘어가고 1~6초 뒤(사람마다 무작위)이거나 1분이 지났으면 서버에서 새로 받아 온다
setInterval(() => {
  if (!S || $('#game').hidden) return;
  const turnPassed = nextTurn(lastFetch + S.timeOffset) <= now() - turnWait; // 서버가 턴을 처리할 1초 여유 + 흩어 묻기 0~5초
  if (!busy && !document.hidden && (turnPassed || Date.now() - lastFetch > 60 * 1000)) { refresh(); return; }
  updateTurn();
}, 1000);
