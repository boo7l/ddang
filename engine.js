'use strict';

// ===== 게임 계산 (엔진) =====
// 세계 상태 S와 지도 MAP만 보고 계산한다. 화면(document)은 건드리지 않는다.
// 나중에 서버에서도 이 파일을 그대로 돌려서 턴을 처리한다. 화면은 game.js에 있다.
// 장수는 여러 명: S.generals[계정id]. 명령 함수는 어느 장수가 하는지(g)를 받는다.

const SAVE_VERSION = 13; // 세계 모양이 바뀌면 올린다 (… 11: 1024 개편, 12: 능력치별 경험치, 13: 장수 여러 명)

let S = null; // 세계 상태 전체

const pad = n => String(n).padStart(2, '0');
const fmt = n => Math.floor(n).toLocaleString('ko-KR');
const now = () => Date.now() + S.timeOffset; // 빨리 감기한 만큼 앞당긴 게임 시각
const cityById = id => MAP.cities.find(c => c.id === id);
const factionById = id => MAP.factions.find(f => f.id === id);
const citiesOfFaction = fid => MAP.cities.filter(c => c.faction === fid);
const allGenerals = () => Object.values(S.generals);
// 군량 구매에 쓸 금: 1~goldMax (예약에 적힌 값, 없으면 첫 빠른 단추 값)
const buyFoodGold = o => Math.max(1, Math.min(RULES.foodBuy.goldMax, Math.floor(+(o && o.item)) || RULES.foodBuy.choices[0]));
// 이번 달 군량 시세 (금 1당 군량). 세계에 없으면 처음 값
const foodPrice = () => (S && S.foodPrice) || RULES.foodBuy.start;
// 세력 특성 (rules.js의 FACTION_TRAITS). 세력이 없거나 특성이 없으면 빈 것
const traitOf = fid => { const f = fid && factionById(fid); return (f && FACTION_TRAITS[f.name]) || {}; };
// 특성이 붙은 경험치: 조조는 모두 +10%, 유표는 지력 +15%
const traitExp = (g, key, amount) => { const t = traitOf(g.faction); return Math.round(amount * (1 + (t.exp || 0) + (key === 'int' ? t.expInt || 0 : 0))); };
// 시각은 언제나 한국 시간으로 적는다 (서버는 다른 나라 시간일 수 있다)
const kst = t => new Date(t + 9 * HOUR);
const fmtTime = t => { const d = kst(t); return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
const fmtClock = t => { const d = kst(t); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
// 숫자 뒤 을/를: 끝자리를 읽는 소리로 정한다 (2 이·4 사·5 오·9 구는 를, 나머지와 0으로 끝나면 을)
const numJosa = n => ([2, 4, 5, 9].includes(Math.floor(n) % 10) ? '를' : '을');
const josa = (word, pair) => { // josa('낙양', '을를') → '낙양을'
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const jong = code >= 0 && code <= 11171 ? code % 28 : 0;
  if (pair === '으로') return word + (jong === 0 || jong === 8 ? '로' : '으로');
  return word + (jong ? pair[0] : pair[1]);
};

// 세력의 시작 성: 가장 큰 성
const startCity = fid => citiesOfFaction(fid).sort((a, b) => b.grade - a.grade)[0];
const playable = () => MAP.factions.filter(f => !RULES.npcOnly.includes(f.name) && citiesOfFaction(f.id).length > 0);

// 세력에 소속된 장수(계정) 수
const memberCount = fid => allGenerals().filter(g => g.faction === fid).length;
// 수비대장이 지키는 성인지: 세력 성인데 소속원이 아무도 없을 때
const hasGuard = c => !!c.faction && memberCount(c.faction) === 0;

// 기록은 장수마다 따로. 여러 줄이어도 된다 (전투 보고서)
function addLog(g, text) {
  if (!g.log) g.log = [];
  g.log.unshift({ t: now(), text });
  if (g.log.length > RULES.logMax) g.log.length = RULES.logMax;
}
const logAll = text => allGenerals().forEach(g => addLog(g, text));

// ===== 세계 만들기 =====
function newWorld(season = 1) {
  const t = Date.now();
  S = {
    v: SAVE_VERSION,
    season,      // 몇 번째 시즌인지 (명예의 전당에 쓴다)
    timeOffset: 0,
    incomeAt: turnStart(t), // 마지막으로 처리한 턴 시각
    turn: 0,      // 지난 턴 수. 게임 속 날짜 = 190년 1월 + turn달
    foodPrice: RULES.foodBuy.start, // 군량 시세 (금 1당 군량)
    generals: {}, // 계정id → 장수
    cities: {},
    owners: {},
  };
  ensureCities();
  return S;
}

// 지도에 있는 모든 성에 상태를 만들어 둔다 (지도를 고쳐 새 성이 생겨도 채워 넣는다)
function ensureCities() {
  for (const c of MAP.cities) if (!S.cities[c.id]) S.cities[c.id] = newCityState(c.grade);
  // 최대치가 줄었으면 넘친 내정 수치를 깎는다
  for (const c of MAP.cities) for (const k of Object.keys(DOMESTIC)) S.cities[c.id][k] = Math.min(S.cities[c.id][k], devMax(c.grade, k));
}

// 성의 주인. 처음엔 지도 파일대로, 점령하면 S.owners에 기록해서 지도에 덮어쓴다
function applyOwners() {
  for (const c of MAP.cities) if (c.id in S.owners) c.faction = S.owners[c.id];
}
function setOwner(c, fid) {
  const before = c.faction;
  c.faction = fid;
  S.owners[c.id] = fid;
  if (before && citiesOfFaction(before).length === 0) logAll(`☆ ${factionById(before).name} 세력이 멸망했다.`);
  checkUnify(fid);
}

// 불러온 세계를 지금 지도·규칙에 맞춘다 (지도를 고쳤거나 예약표 칸 수를 바꿨을 때)
function fixWorld() {
  ensureCities();
  applyOwners();
  trimDefense();
  // 세력별 몸담은 턴 수를 세기 전부터 있던 장수는, 지금 세력에 지금까지의 턴을 모두 준다 (2026-10-26, 한 번만)
  if (!S.factionTurnsInit) {
    for (const g of allGenerals()) if (g.faction && !g.factionTurns) g.factionTurns = { [g.faction]: S.turn };
    S.factionTurnsInit = true;
  }
  for (const g of allGenerals()) {
    if (!g.log) g.log = []; // 기록을 gen_logs 표로 옮긴 뒤의 세계에는 기록이 없다 (예전 서버로 되돌려도 깨지지 않게)
    if (g.log && g.log.length > RULES.logMax) g.log.length = RULES.logMax; // 기록 줄 수를 줄였을 때
    g.queue = (g.queue || []).slice(0, RULES.queueSize).map(o => (o && COMMANDS[o.cmd] ? o : null)); // 없어진 명령은 비운다
    while (g.queue.length < RULES.queueSize) g.queue.push(null);
    // 지도를 고쳐서 내 세력이 사라졌으면 세력 없는 장수가 된다
    if (g.faction && !citiesOfFaction(g.faction).length) {
      g.faction = null;
      g.city = null;
      addLog(g, '소속 세력이 사라졌다. 새 세력을 찾아야 한다.');
    }
    // 지도를 고쳐서 내 성이 다른 세력 것이 됐으면 내 세력의 다른 성으로 옮긴다
    const city = g.faction && cityById(g.city);
    if (g.faction && (!city || city.faction !== g.faction)) {
      const home = startCity(g.faction);
      g.city = home.id;
      addLog(g, `지도가 바뀌어 ${josa(home.name, '으로')} 옮겼다.`);
    }
  }
}

// ===== 장수 만들기·세력 소속 (기획서 12장) =====
// 능력치는 주사위로 나올 수 있는 값(한 항목 30~70, 합 170)에 보너스를 더한 것만 받는다. 틀리면 이유를 돌려준다
function addGeneral(id, { name, face, stats }) {
  name = String(name || '').trim();
  if (!name || name.length > 8) return '장수 이름은 1~8자로 적어 주세요.';
  if (S.generals[id]) return '이미 장수가 있어요.';
  if (!FACES.some(f => f.id === face)) return '얼굴을 골라 주세요.';
  const vals = STATS.map(st => stats && stats[st.key]);
  const sum = vals.reduce((s, v) => s + v, 0);
  if (vals.some(v => !Number.isInteger(v) || v < ROLL.min || v > Math.min(ROLL.max + RULES.startBonus, RULES.statMax)) ||
      sum > ROLL.total + RULES.startBonus) return '능력치가 올바르지 않아요.';
  const g = S.generals[id] = {
    id, name, face, faction: null, city: null, // 세력은 다음 화면에서 고른다
    stats: Object.fromEntries(STATS.map(st => [st.key, stats[st.key]])),
    troops: 0, unitType: null, training: 0, defense: true, // 병종은 첫 징병 때 고른다
    gold: RULES.startGold, merit: 0, statExp: {}, siege: {}, gear: {}, intel: {},
    queue: Array(RULES.queueSize).fill(null), // 앞으로 queueSize턴의 예약 명령 (null = 대기)
    log: [],
  };
  addLog(g, `${name}, 천하에 뜻을 품고 길을 나서다.`);
  return '';
}

// 하야한 세력에 다시 들어가려면 남은 턴 수 (0이면 들어갈 수 있음)
const rejoinLeft = (g, fid) => (g.leftFaction && g.leftFaction.id === fid ? Math.max(0, g.leftFaction.until - S.turn) : 0);

function joinFaction(g, fid, cityId) {
  if (g.faction) return '이미 세력에 소속되어 있어요.';
  const f = factionById(fid);
  if (!f || !playable().includes(f)) return '고를 수 없는 세력이에요.';
  const wait = rejoinLeft(g, f.id);
  if (wait) return `${f.name} 세력은 떠난 지 얼마 안 돼서 ${wait}턴 뒤(${dateText(g.leftFaction.until)})부터 다시 들어갈 수 있어요.`;
  const picked = cityById(cityId);
  const home = picked && picked.faction === f.id ? picked : startCity(f.id);
  g.faction = f.id;
  g.city = home.id;
  capDefense(g);
  addLog(g, `${g.name}, ${f.name} 세력에 몸을 담다. ${home.name}에서 첫발을 내딛는다.`);
  return '';
}

// ===== 천하통일 (기획서 6장) =====
// 다른 세력이 모두 멸망하면 통일. 공백지는 따지지 않는다. 통일하면 시즌이 끝나 턴이 멈추고,
// 다음 시즌은 개발자가 직접 시작한다 (개발자 도구의 "새 시즌 시작")
function checkUnify(fid) {
  if (S.unified || !fid) return;
  if (MAP.factions.some(f => f.id !== fid && citiesOfFaction(f.id).length > 0)) return;
  S.unified = { faction: fid, turn: S.turn }; // 기록은 그 턴의 전투 보고서 뒤에 남긴다 (advance)
}

// 공적 순위: 모든 장수를 공적 순으로
const meritRanking = () => allGenerals()
  .map(g => ({ name: g.name, faction: g.faction, merit: g.merit })).sort((a, b) => b.merit - a.merit);

// 기능 스위치가 꺼진 명령인지
const FEATURE_OF = { tech: 'tech', siege: 'siege', spy: 'spy', drill: 'drill', explore: 'explore', shop: 'shop', buy: 'shop' };
const cmdOn = cmd => !FEATURE_OF[cmd] || RULES.features[FEATURE_OF[cmd]];

// fid 세력 성 가운데, fromId에서 그 세력 땅만 밟고 maxSteps칸 안에 갈 수 있는 성들 (이동 목적지)
// (fromId가 아직 내 성이 아니어도 된다: 예약표에서 출진 뒤 그 성에 있을 거라고 짐작할 때)
function linkedOwnCities(fromId, fid, maxSteps = Infinity) {
  const seen = new Set([fromId]);
  let ring = [cityById(fromId)];
  for (let step = 0; step < maxSteps && ring.length; step++) { // 한 칸씩 넓혀 간다
    const next = [];
    for (const c of ring) {
      for (const n of neighborsOf(MAP, c)) {
        if (n.faction === fid && !seen.has(n.id)) { seen.add(n.id); next.push(n); }
      }
    }
    ring = next;
  }
  seen.delete(fromId);
  return MAP.cities.filter(c => seen.has(c.id));
}

// ===== 턴 =====
// 매 턴(게임 속 1달, 모든 장수가 같은 정각)마다: 예약 명령 실행 → 금 수입(1·4·7·10월) → 군량 수확(4·10월) → 병사가 군량을 먹음.
// 아무도 접속하지 않아도 지난 턴들을 차례로 처리한다. 처리한 턴 수를 돌려준다
function advance() {
  const t = now();
  let turns = 0;
  const starved = new Set();
  if (S.unified || S.paused) return 0; // 시즌이 끝났거나 관리자가 멈췄으면 턴이 흐르지 않는다
  while (nextTurn(S.incomeAt) <= t) {
    const mark = nextTurn(S.incomeAt);
    if (turns >= 24 * 30) { S.incomeAt = turnStart(t); break; } // 오래 비워 둬도 최대 720턴치만
    S.turn++; // 게임 속 한 달이 흐른다
    runOrders(mark);
    trimDefense();
    // 세력마다 몸담은 턴 수 (명예의 전당 소속 = 가장 오래 있었던 세력)
    for (const g of allGenerals()) if (g.faction) { g.factionTurns = g.factionTurns || {}; g.factionTurns[g.faction] = (g.factionTurns[g.faction] || 0) + 1; }
    if (S.unified) { // 이번 턴에 통일했다
      logAll(`🏆 ${dateText(S.turn)}, ${factionById(S.unified.faction).name} 세력이 천하를 통일했다!`);
      S.incomeAt = mark; turns++; break;
    }
    const month = dateOf(S.turn).month;
    // 금: 장수마다 자기가 있는 성의 상업에 따라 자기 금으로
    if (RULES.goldMonths.includes(month)) {
      for (const g of allGenerals()) {
        if (!g.faction) continue;
        const cs = S.cities[g.city], got = earnGold(g, Math.floor(goldIncome(cs, g.merit) * (1 + (traitOf(g.faction).gold || 0))));
        addLog(g, `💰 ${dateText(S.turn)} 금 수입 +${fmt(got)} (${cityById(g.city).name} 상업 ${cs.comm}${g.merit * RULES.meritIncome >= 0.01 ? ` · 공적 +${Math.floor(g.merit * RULES.meritIncome * 100)}%` : ''}${peaceIncome(cs.peace) < 1 ? ` · 치안 ${cs.peace}으로 줄어듦` : ''})`);
      }
    }
    // 군량 시세: 매달 -1 / 0 / +1 (4~8)
    S.foodPrice = Math.min(RULES.foodBuy.max, Math.max(RULES.foodBuy.min, foodPrice() + randInt(-1, 1)));
    // 군량: 세력이 있는 성마다 그 성의 농업에 따라 (공백지는 수입 없음)
    if (RULES.harvestMonths.includes(month)) {
      for (const c of MAP.cities) if (c.faction) harvestFood(S.cities[c.id], c.grade);
      for (const g of allGenerals()) if (g.faction) addLog(g, `🌾 ${dateText(S.turn)} 수확: ${cityById(g.city).name} 군량 ${fmt(S.cities[g.city].food)}`);
    }
    // 병사는 머무는 성의 군량을 먹는다
    for (const g of allGenerals()) if (g.faction && g.troops > 0 && feedTroops(g, S.cities[g.city])) starved.add(g);
    S.incomeAt = mark;
    turns++;
  }
  for (const g of starved) addLog(g, `군량이 모자라 병사들이 흩어졌다! 병력 ${fmt(g.troops)}`);
  return turns;
}

// 모든 장수의 예약표 맨 앞 칸 명령을 예약한 순서대로 실행하고, 예약표를 한 칸씩 당긴다. 빈 칸이면 대기
function runOrders(mark) {
  const todo = [];
  for (const g of allGenerals()) {
    const order = g.queue.shift();
    g.queue.push(null);
    if (order && g.faction) todo.push({ g, order });
  }
  todo.sort((a, b) => (a.order.orderedAt || 0) - (b.order.orderedAt || 0));
  for (const { g, order } of todo) {
    if (S.unified || !g.faction) continue; // 통일됐거나, 이번 턴에 앞서 세력을 잃었다
    const fail = COMMANDS[order.cmd] && cmdOn(order.cmd) ? COMMANDS[order.cmd].run(g, order, mark) : '지금은 쓸 수 없는 명령';
    if (fail) addLog(g, `[${fmtClock(mark)}] ${orderLabel(order)} 실패: ${fail} → 대기`);
  }
}

// ===== 예약표 =====
// i번 칸에 명령을 넣는다 (null이면 비운다). 같은 턴에 같은 성을 친 장수들은 예약한 순서(orderedAt)대로 싸운다
function setOrder(g, i, order) {
  if (!Number.isInteger(i) || i < 0 || i >= RULES.queueSize) return '없는 칸이에요.';
  if (order && (!COMMANDS[order.cmd] || !cmdOn(order.cmd))) return '쓸 수 없는 명령이에요.';
  g.queue[i] = order ? { ...order, orderedAt: now() } : null;
  return '';
}
function clearOrders(g) { g.queue = Array(RULES.queueSize).fill(null); }
// 비어 있는 칸을 모두 같은 명령으로 채운다 (예: 12칸 모두 농업). 하야는 되풀이할 수 없다
function fillOrders(g, order) {
  if (!order) return '채울 수 없는 명령이에요.';
  for (let i = 0; i < RULES.queueSize; i++) {
    if (g.queue[i]) continue;
    const why = setOrder(g, i, order);
    if (why) return why;
  }
  return '';
}

// i번 칸이 실행될 때 장수가 있을 성 (앞 칸의 이동·출진이 모두 성공한다고 보고 짐작)
function cityAtSlot(g, i) {
  let id = g.city;
  for (let k = 0; k < i; k++) {
    const o = g.queue[k];
    if (o && (o.cmd === 'move' || o.cmd === 'attack')) id = o.to;
  }
  return cityById(id);
}

// ===== 명령 =====
// 명령은 예약표에 넣어 두었다가 턴이 오면 실행된다. 실행할 때 조건이 안 맞으면 실패하고 그 턴은 대기.
// run(g, order, mark)는 성공하면 빈 문자열, 실패하면 이유를 돌려준다.
const VERB = { agri: '논밭을 일구었다', comm: '시장을 넓혔다', tech: '기술을 연구했다', wall: '성벽을 쌓았다', peace: '순찰을 돌아 민심을 다독였다' };

// 비용을 낼 수 있는지 보고, 낼 수 있으면 낸다. 못 내면 이유
function pay(g, kind) {
  const mg = RULES.myGoldCost[kind] || 0;
  if (g.gold < mg) return `금 부족 (필요 ${mg}, 있음 ${fmt(g.gold)})`;
  g.gold -= mg;
  return '';
}

// 장수 지갑에 금을 넣는다 (상한까지). 실제로 넣은 양을 돌려준다
function earnGold(g, n) {
  const got = Math.max(0, Math.min(n, RULES.playerGoldMax - g.gold));
  g.gold += got;
  return got;
}

// 공적: 수련을 뺀 명령마다 쌓이는 점수. 순위를 매기는 데 쓴다
function addMerit(g, n) {
  g.merit += n;
}

// 능력치 경험치를 쌓는다. 다 차서 능력치가 오르면 기록에 남긴다
function gainStatExp(g, key, amount) {
  const st = STATS.find(s => s.key === key);
  const up = addStatExp(g, key, traitExp(g, key, amount));
  if (up) addLog(g, `★ ${josa(st.name, '이가')} 올랐다! (${g.stats[key]})`);
}

// ----- 내정 -----
function runDomestic(g, key) {
  const city = cityById(g.city), c = S.cities[g.city], d = DOMESTIC[key];
  const max = devMax(city.grade, key);
  if (c[key] >= max) return `${josa(d.label, '이가')} 이미 최대치`;
  const t = traitOf(g.faction), bonus = key === 'comm' ? t.comm || 0 : 0; // 도겸: 상업 내정 +5%
  const gain = Math.min(Math.round(domesticGain(key, effStats(g)[d.stat]) * (1 + bonus)), max - c[key]);
  c[key] += gain;
  addLog(g, `${city.name}: ${VERB[key]}. ${d.label} +${gain} (${c[key]}/${max})`);
  addMerit(g, RULES.merit.domestic);
  gainStatExp(g, d.stat, RULES.statExp.domestic);
  return '';
}

// ----- 징병 -----
function runDraft(g, o) {
  const city = cityById(g.city), type = o.unit;
  if (!UNIT_TYPES[type]) return '없는 병종';
  if (g.troops >= troopsMax(g) && g.unitType === type) return '병력이 이미 최대치';
  const peace = S.cities[g.city].peace, rate = peaceDraft(peace);
  if (!rate) return `${city.name}의 치안이 너무 낮음 (${peace}, ${RULES.peaceLow} 미만은 징병 불가)`;
  const why = pay(g, 'draft');
  if (why) return why;
  // 다른 병종을 모으면 있던 병력은 모두 흩어지고 새 부대가 된다
  let note = '';
  if (g.troops > 0 && g.unitType !== type) { note = ` · 있던 ${g.unitType} ${fmt(g.troops)}명은 흩어졌다`; g.troops = 0; }
  if (g.troops <= 0) g.training = 0; // 병사가 없을 때 모으면 새 부대
  const t = traitOf(g.faction);
  const gain = Math.min(Math.floor(draftGain(effStats(g).lea, g.merit) * rate * (1 + (t.draft || 0))), troopsMax(g) - g.troops); // 동탁: 더 모인다
  if (g.troops > 0) g.training = dilutedTraining(g.training, g.troops, gain);
  g.unitType = type;
  g.troops += gain;
  capDefense(g); // 병사가 처음 생겼는데 이 성 수비가 꽉 찼으면 방어 모드는 꺼진 채로
  const cs = S.cities[g.city], drop = Math.min(cs.peace, Math.round(gain / RULES.draftPeacePer * (1 + (t.draftPeace || 0)))); // 징병하면 민심이 흉흉해진다
  cs.peace -= drop;
  addLog(g, `${city.name}: ${type}을 모았다. 병력 +${fmt(gain)} (${fmt(g.troops)})${rate < 1 ? ` · 치안 ${peace}으로 덜 모임` : ''}${note} · 치안 -${drop} (${cs.peace})`);
  addMerit(g, RULES.merit.draft);
  gainStatExp(g, 'lea', RULES.statExp.draft);
  return '';
}

// ----- 훈련 -----
function runDrill(g) {
  const city = cityById(g.city);
  if (g.troops <= 0) return '훈련할 병사가 없음';
  if (g.training >= 100) return '훈련도가 이미 최대';
  const gain = Math.min(drillGain(effStats(g).lea), 100 - g.training);
  g.training += gain;
  addLog(g, `${city.name}: ${g.unitType}을 훈련했다. 훈련도 +${gain} (${g.training}/100)`);
  return '';
}

// ----- 방어 모드 (예약 없이 바로) -----
// 켜 두면 머무는 성이 공격받을 때 요격에 나선다. 병력이 없으면 켤 수 없다
function toggleDefense(g) {
  if (g.troops <= 0) return '병력이 없으면 켤 수 없어요.';
  if (!g.defense && defendingIn(g.city, g.faction, g).length >= RULES.defenseMax) return `이 성은 수비가 꽉 찼어요 (한 성에 최대 ${RULES.defenseMax}명).`;
  g.defense = !g.defense; // 기록에는 남기지 않는다 (장수 창에 켜짐·꺼짐이 보인다)
  return '';
}

// ----- 수비 인원: 한 성에 방어 모드는 최대 5명 (2026-10-25) -----
// fid 세력 장수 가운데 cityId 성에서 방어 모드를 켜고 병사가 있는 장수 (except는 빼고 센다)
const defendingIn = (cityId, fid, except) =>
  allGenerals().filter(x => x !== except && x.city === cityId && x.faction === fid && x.defense && x.troops > 0);
// 새로 들어왔거나 병사가 처음 생긴 장수: 그 성 수비가 꽉 찼으면 방어 모드를 끈다
function capDefense(g) {
  if (g.faction && g.defense && g.troops > 0 && defendingIn(g.city, g.faction, g).length >= RULES.defenseMax) g.defense = false;
}
// 수비 장수가 전멸한 만큼, 그 성에서 방어를 끈 장수 가운데 병력이 많은 순으로 자동으로 켠다 (다음 공격부터 막는다)
function refillDefense(c, fallen) {
  for (let k = 0; k < fallen; k++) {
    if (defendingIn(c.id, c.faction).length >= RULES.defenseMax) return;
    const next = allGenerals().filter(x => x.city === c.id && x.faction === c.faction && !x.defense && x.troops > 0)
      .sort((a, b) => b.troops - a.troops)[0];
    if (!next) return;
    next.defense = true;
    addLog(next, `🛡 ${c.name}의 수비 장수가 쓰러져 방어 모드가 자동으로 켜졌다.`);
  }
}
// 한 성에 5명이 넘게 켜져 있으면 병력이 많은 5명만 남기고 끈다 (규칙을 바꾼 뒤 처음, 징병·탐색으로 병사가 생겼을 때 등)
function trimDefense() {
  const by = {};
  for (const g of allGenerals()) {
    if (g.faction && g.city && g.defense && g.troops > 0) (by[g.city] = by[g.city] || []).push(g);
  }
  for (const list of Object.values(by)) {
    if (list.length > RULES.defenseMax) list.sort((a, b) => b.troops - a.troops).slice(RULES.defenseMax).forEach(g => { g.defense = false; });
  }
}

// ----- 출진 -----
// 장수의 부대 (전투 계산용). ref는 전투가 끝난 뒤 병력을 되돌려 적을 장수
const unitOf = g => ({ name: g.name, faction: g.faction, troops: g.troops, stats: effStats(g), type: g.unitType, training: g.training, siege: g.siege || {}, player: true, ref: g });

// 성을 지키는 부대들. 병력이 많은 순서로 나서서 요격한다.
//   - 수비대장: 유저가 없는 세력의 성
//   - 장수: 그 성에 머무는 같은 세력 장수 가운데 방어 모드를 켰고 병력이 있는 사람
function defendersOf(c) {
  const list = [];
  const cs = S.cities[c.id];
  if (hasGuard(c) && cs.guard > 0) {
    const st = RULES.guardStat;
    list.push({ name: '수비대장', troops: cs.guard, stats: { lea: st, war: st, int: st },
      type: RULES.guardUnit.type, training: RULES.guardUnit.training, guard: true, faction: c.faction });
  }
  for (const g of allGenerals()) {
    if (g.city === c.id && g.faction === c.faction && g.defense && g.troops > 0) list.push(unitOf(g));
  }
  return list.sort((a, b) => b.troops - a.troops);
}
// fromId 성에서 fid 세력이 칠 수 있는 이웃 성
const attackTargetsFrom = (fromId, fid) => neighborsOf(MAP, cityById(fromId)).filter(c => c.faction !== fid);

// 점령한 성의 군량은 일부만 남고 나머지는 흩어진다. 보고서 한 줄을 돌려준다
function seize(cs) {
  const k = RULES.captureKeep, keep = k.min + Math.random() * (k.max - k.min); // 이번에 남는 비율
  cs.food = Math.floor(cs.food * keep);
  return `성의 군량 ${fmt(cs.food)}${numJosa(cs.food)} 차지했다.`;
}

// 성이 떨어졌을 때, 그 성에 있던 옛 세력 장수들은 무작위 인접 아군 성으로 물러난다. 보고서 줄을 돌려준다
function retreatFrom(c, oldFaction) {
  const out = [];
  for (const g of allGenerals()) {
    if (g.city !== c.id || g.faction !== oldFaction) continue;
    const near = neighborsOf(MAP, c).filter(n => n.faction === oldFaction);
    const any = citiesOfFaction(oldFaction);
    const to = near.length ? near[randInt(0, near.length - 1)] : any.length ? any[randInt(0, any.length - 1)] : null;
    if (!to) { g.faction = null; g.city = null; out.push(`${josa(g.name, '은는')} 갈 곳을 잃었다…`); continue; }
    g.city = to.id;
    capDefense(g);
    out.push(`${josa(g.name, '은는')} ${josa(to.name, '으로')} 물러났다.`);
  }
  return out;
}

// 점령: 성 주인을 바꾸고, 군량 일부를 차지하고, 함락된 성의 수치가 깎인다. 방어는 성 크기만큼 다시 세운다.
// 공백지는 싸움 없이 들어가므로 농업·상업·치안·방어·군량이 모두 그대로다 (2026-10-25)
// 보고서 줄을 lines에 더한다
function capture(g, to, oldFaction, lines) {
  const cs = S.cities[to.id];
  setOwner(to, g.faction);
  cs.guard = 0; // 수비대장은 물러난다
  if (!oldFaction) { // 공백지: 군량도 모두 그대로 차지한다
    lines.push(`성의 군량 ${fmt(cs.food)}${numJosa(cs.food)} 차지했다.`);
    g.city = to.id;
    return;
  }
  lines.push(seize(cs));
  const cut = captureDamage(cs);
  cs.wall = RULES.captureWall[to.grade];
  lines.push(`함락의 혼란으로 ${Object.keys(cut).map(k => `${DOMESTIC[k].label} -${cut[k]}`).join(' · ')} · 무너진 성벽을 방어 ${cs.wall}까지 다시 세웠다`);
  lines.push(...retreatFrom(to, oldFaction));
  g.city = to.id;
}

// 턴이 오면 출진해서 바로 싸운다 (기획서 7장).
//  1. 공백지: 주인이 없어 그냥 들어간다 (금 없음)
//  2. 수비 부대가 있으면 최대 5합. 병력 많은 순서로 하나씩 상대하고, 합이 남으면 다음 부대와 이어서 싸운다
//  3. 수비 부대가 없거나 모두 쓰러뜨렸으면 같은 턴에 성벽 공격: 남은 병력의 3~5%만큼 방어를 깎고, 그 3배의 병력을 잃는다
//  4. 방어가 0이 되면 점령 (금 500). 방어가 남으면 돌아오고, 깎인 방어는 그대로 남는다
// 보고서는 공격한 장수와 그 성에 있던 장수들이 받고, 그 세력의 다른 장수들에게는 알림이 간다
function runAttack(g, o, mark) {
  const from = cityById(g.city), to = cityById(o.to);
  if (!to) return '없는 성';
  const cs = S.cities[to.id], home = S.cities[from.id];
  if (g.troops <= 0) return '병력이 없음';
  if (!neighborsOf(MAP, from).includes(to)) return `${josa(to.name, '은는')} ${from.name}의 이웃 성이 아님`;
  if (to.faction === g.faction) return `${josa(to.name, '은는')} 이미 아군 성`;
  const food = marchFood(g.troops);
  if (home.food < food) return `${from.name} 군량 부족 (필요 ${fmt(food)}, 있음 ${fmt(home.food)})`;
  home.food -= food; // 출진 군량은 바로 쓰여 사라진다 (이기든 지든 돌아오지 않음)

  const oldFaction = to.faction, owner = factionById(oldFaction), myF = factionById(g.faction);
  const lines = [];
  const statKey = UNIT_TYPES[g.unitType].stat; // 병종에 맞는 능력치 경험치

  // 1. 공백지
  if (!oldFaction) {
    lines.push(`⚔ ${to.name} (${fmtClock(mark)}): 주인 없는 땅이라 ${josa(to.name, '을를')} 손쉽게 차지했다.`);
    capture(g, to, oldFaction, lines);
    lines.push(`공적 +${RULES.merit.win}`);
    addMerit(g, RULES.merit.win);
    addLog(g, lines.join('\n'));
    gainStatExp(g, statKey, RULES.statExp.battle);
    gainStatExp(g, 'lea', RULES.statExp.capture); // 성 점령은 통솔 경험치
    return '';
  }

  const defs = defendersOf(to);
  // 공격받은 성에 있던 옛 세력 장수들은 보고서를 받는다 (물러나기 전에 적어 둔다). 나머지 세력 장수들은 알림만
  const victims = allGenerals().filter(x => x.city === to.id && x.faction === oldFaction);
  const others = allGenerals().filter(x => x.faction === oldFaction && !victims.includes(x));

  // 2. 수비 부대와 싸움
  const att = unitOf(g);
  let left = RULES.roundsMax, atkLost = 0, defLost = 0;
  lines.push(`⚔ ${to.name} 공방전 (${fmtClock(mark)}): ${g.name}(${att.type} ${fmt(att.troops)}) 출진! (${owner.name} 세력의 성)`);
  for (const d of defs) {
    if (left <= 0 || att.troops <= 0) break;
    const edge = matchupOf(att, d) > 1 ? ` · ${att.type}이 ${d.type}에 강하다!` : matchupOf(d, att) > 1 ? ` · ${d.type}이 ${att.type}에 강하다…` : '';
    lines.push(`▶ ${d.name}(${d.type} ${fmt(d.troops)})과 맞붙었다${edge}`);
    const r = fightRounds(att, d, cs.wall, left);
    left -= r.used;
    atkLost += r.atkLost;
    defLost += r.defLost;
    lines.push(...r.lines);
    if (d.guard) cs.guard = d.troops;
    if (d.ref) { // 수비 장수의 병력을 되돌려 적는다
      d.ref.troops = d.troops;
      if (d.duelWins) gainStatExp(d.ref, 'war', RULES.duel.exp * d.duelWins);
    }
    if (d.troops <= 0) lines.push(`${d.name} 부대 전멸!`);
  }
  g.troops = att.troops;
  const standing = defs.filter(x => x.troops > 0);

  // 3. 성벽 공격 → 4. 점령 또는 돌아옴
  let captured = false;
  if (g.troops <= 0) {
    lines.push(`${g.name}의 부대가 전멸했다… ${josa(from.name, '으로')} 홀로 돌아왔다.`);
  } else if (standing.length) {
    lines.push(`${RULES.roundsMax}합이 끝났지만 승부가 나지 않아 ${josa(from.name, '으로')} 돌아왔다.`);
  } else {
    lines.push(defs.length ? '수비 부대를 모두 물리치고 성벽으로 달려들었다!' : '막는 부대가 없어 곧장 성벽으로 달려들었다!');
    const sr = RULES.siegeRate, rate = sr.min + Math.random() * (sr.max - sr.min);
    const base = Math.max(1, Math.floor(g.troops * rate));
    const boost = 1 + (traitOf(g.faction).siege || 0) + (g.siege && g.siege.충차 ? SIEGE_EFFECT.ramWall : 0); // 엄백호·충차: 같은 손실로 더 깎는다
    const dmg = Math.min(cs.wall, Math.floor(base * boost));
    const loss = Math.min(g.troops, Math.round(dmg / boost) * RULES.siegeLoss); // 성벽에서 쏟아지는 화살·돌: 깎은 방어의 3배(siegeLoss)만큼 잃는다
    cs.wall -= dmg;
    g.troops -= loss;
    atkLost += loss;
    lines.push(`🏯 성벽 공격${g.siege && g.siege.충차 ? ' (충차)' : ''}: 방어 -${fmt(dmg)} (남은 방어 ${fmt(cs.wall)}) · 병력 -${fmt(loss)}`);
    if (cs.wall <= 0) {
      captured = true;
      lines.push(`${g.name}의 승리! 성벽이 무너져 ${josa(to.name, '을를')} 점령했다. (${owner.name} 세력에게서 빼앗음)`);
      capture(g, to, oldFaction, lines);
    } else {
      lines.push(`성벽을 다 무너뜨리지 못하고 ${josa(from.name, '으로')} 돌아왔다.`);
    }
  }
  // 전투에서 전멸한 부대의 병기는 50% 확률로 부서진다 (공격한 장수와 수비 장수 모두)
  for (const x of [g, ...defs.filter(d => d.ref).map(d => d.ref)]) {
    const t = x.troops <= 0 && x.siege && Object.keys(x.siege).find(k => x.siege[k]);
    if (t && Math.random() < SIEGE_EFFECT.breakChance) { x.siege = {}; lines.push(`${x.name}의 ${josa(t, '이가')} 부서졌다…`); }
  }
  lines.push(`공격 측 손실 ${fmt(atkLost)} · 수비 측 손실 ${fmt(defLost)} · ${g.name}의 남은 병력 ${fmt(g.troops)}`);
  if (captured) { const got = earnGold(g, RULES.battleReward); lines.push(`${g.name} 보상: 금 +${got} · 공적 +${RULES.merit.win}`); addMerit(g, RULES.merit.win); }
  else { lines.push(`${g.name} 공적 +${RULES.merit.lose}`); addMerit(g, RULES.merit.lose); }
  const text = lines.join('\n');
  addLog(g, text);
  victims.forEach(v => addLog(v, text));
  if (!captured) refillDefense(to, defs.filter(d => d.ref && d.troops <= 0).length); // 쓰러진 수비 장수 자리를 채운다
  others.forEach(x => addLog(x, captured
    ? `⚠ ${josa(to.name, '을를')} ${myF.name} 세력 ${g.name}에게 빼앗겼다!`
    : `⚠ ${josa(to.name, '이가')} ${myF.name} 세력 ${g.name}의 공격을 받았다. (남은 방어 ${fmt(cs.wall)})`));
  gainStatExp(g, statKey, RULES.statExp.battle);
  if (captured) gainStatExp(g, 'lea', RULES.statExp.capture); // 성 점령은 통솔 경험치
  if (att.duelWins) gainStatExp(g, 'war', RULES.duel.exp * att.duelWins); // 일기토에서 이기면 무력 경험치
  return '';
}


// ----- 이동 -----
function runMove(g, o) {
  const from = cityById(g.city), to = cityById(o.to);
  if (!to) return '없는 성';
  if (to.id === from.id) return `이미 ${to.name}에 있음`;
  if (to.faction !== g.faction) return `${josa(to.name, '은는')} 아군 성이 아님`;
  if (!linkedOwnCities(from.id, g.faction, RULES.moveRange).includes(to)) return `${from.name}에서 ${to.name}까지 아군 땅으로 ${RULES.moveRange}칸 안에 이어져 있지 않음`;
  g.city = to.id;
  capDefense(g);
  addLog(g, `${from.name}에서 ${josa(to.name, '으로')} 옮겨 갔다. (병력 ${fmt(g.troops)})`);
  addMerit(g, RULES.merit.move);
  return '';
}

// ----- 탐색 -----
function runExplore(g) {
  const city = cityById(g.city), cs = S.cities[g.city];
  const why = pay(g, 'explore');
  if (why) return why;
  const e = rollExplore();
  let text;
  switch (e.key) {
    case 'gold': {
      const f = foundAmount(e);
      const n = Math.min(f.amount, RULES.playerGoldMax - g.gold);
      g.gold += n;
      text = n <= 0 ? '금을 찾았지만 더 지닐 수 없어 두고 왔다.'
        : f.jackpot ? `★ 대박! 옛 호족이 숨겨 둔 금궤를 찾았다! 금 +${fmt(n)}`
        : `근처 폐허에서 묻혀 있던 금을 찾았다! 금 +${fmt(n)}`;
      break;
    }
    case 'food': {
      const f = foundAmount(e);
      const n = Math.max(0, Math.min(f.amount, foodMax(city.grade) - cs.food));
      cs.food += n;
      text = n <= 0 ? '곡식을 찾았지만 창고가 가득 차 가져올 수 없었다.'
        : f.jackpot ? `★ 대박! 주인 잃은 거대한 곡창을 찾았다! 군량 +${fmt(n)}`
        : `버려진 곡식 창고에서 군량을 거두었다! 군량 +${fmt(n)}`;
      break;
    }
    case 'troops': {
      const n = Math.min(randInt(e.min, e.max), troopsMax(g) - g.troops);
      if (!g.unitType) g.unitType = '보병'; // 병사가 없던 장수에게 온 의병은 보병
      g.training = dilutedTraining(g.training, g.troops, n);
      g.troops += n;
      text = n > 0 ? `소문을 들은 의병 ${fmt(n)}명이 찾아와 합류했다!` : '의병들이 찾아왔지만 더 거느릴 수 없어 돌려보냈다.';
      break;
    }
    case 'item': {
      const it = ITEMS[randInt(0, ITEMS.length - 1)];
      const st = STATS.find(s => s.key === it.stat);
      if (g.stats[it.stat] < RULES.statMax) {
        g.stats[it.stat]++;
        text = `★ 「${it.name}」${josa(it.name, '을를').slice(-1)} 손에 넣었다! ${st.name} +1 (${g.stats[it.stat]})`;
      } else {
        text = `「${it.name}」${josa(it.name, '을를').slice(-1)} 손에 넣었지만, 이미 ${josa(st.name, '이가')} 최고라 도움이 되지 않았다.`;
      }
      break;
    }
    case 'bandit': {
      if (g.troops > 0) {
        const n = Math.max(1, Math.floor(g.troops * (e.minRate + Math.random() * (e.maxRate - e.minRate))));
        g.troops -= n;
        text = `도적 떼와 마주쳐 싸우다 병사 ${fmt(n)}명을 잃었다.`;
      } else {
        const n = Math.floor(g.gold * (e.goldMinRate + Math.random() * (e.goldMaxRate - e.goldMinRate))); // 가진 금의 15~20%
        g.gold -= n;
        text = n > 0 ? `도적에게 금을 빼앗겼다. 금 -${fmt(n)}` : '도적과 마주쳤지만 빼앗길 것도 없어 무사히 돌아왔다.';
      }
      break;
    }
    default:
      text = '주변을 살폈으나 별다른 일은 없었다.';
  }
  addLog(g, `${city.name} 탐색: ${text}`);
  addMerit(g, RULES.merit.explore); // 수련을 뺀 모든 명령에는 공적이 붙는다
  return '';
}

// ----- 첩보 -----
// 다른 세력 성의 속사정은 첩보로 엿봐야 보인다. 엿본 정보는 잠시(RULES.spyValid) 유효하다 (장수마다 따로)
const spyTargetsFrom = (fromId, fid) => neighborsOf(MAP, cityById(fromId)).filter(c => c.faction && c.faction !== fid);
const intelOf = (g, c) => { const i = (g.intel || {})[c.id]; return i && now() - i.at < RULES.spyValid ? i : null; };
// 이 성의 속사정을 볼 수 있는지: 내 세력 성, 공백지, 첩보가 유효한 성
const canSee = (g, c) => !RULES.features.spy || !c.faction || c.faction === g.faction || !!intelOf(g, c);

function runSpy(g, o, mark) {
  const c = cityById(o.to);
  if (!c) return '없는 성';
  const cs = S.cities[c.id];
  if (!c.faction || c.faction === g.faction) return `${josa(c.name, '은는')} 이제 ${c.faction ? '아군 성' : '빈 땅'}`;
  if (!neighborsOf(MAP, cityById(g.city)).includes(c)) return `${josa(c.name, '은는')} 이웃 성이 아님`;
  const why = pay(g, 'spy');
  if (why) return why;
  g.intel = g.intel || {};
  g.intel[c.id] = { at: mark };
  const defs = defendersOf(c);
  const defText = defs.length ? defs.map(d => `${d.name} ${d.type} ${fmt(d.troops)}`).join(', ') : '지키는 병사 없음';
  addLog(g, `첩보: ${c.name}의 속사정을 알아냈다.\n수비 ${defText} · 방어 ${cs.wall} · 군량 ${fmt(cs.food)}\n(${fmtClock(mark + RULES.spyValid)}까지 성 정보에서 볼 수 있다)`);
  return '';
}

// ----- 계략 (지력) -----
// 이웃한 다른 세력 성에 쓴다. 지력이 높을수록 잘 되고, 대성공이면 효과 2배. 성공하면 지력 경험치와 공적
const PLOT_NAME = { destroy: '파괴', rumor: '유언' };
function runPlot(g, kind, o) {
  const c = cityById(o.to);
  if (!c) return '없는 성';
  const cs = S.cities[c.id], name = PLOT_NAME[kind];
  if (!c.faction || c.faction === g.faction) return `${josa(c.name, '은는')} 이제 ${c.faction ? '아군 성' : '빈 땅'}`;
  if (!neighborsOf(MAP, cityById(g.city)).includes(c)) return `${josa(c.name, '은는')} 이웃 성이 아님`;
  const int = effStats(g).int, r = rollPlot(int);
  if (r === 'fail') {
    addLog(g, `${name} → ${c.name}: 실패… 들킬 뻔해 서둘러 물러났다.`);
    return '';
  }
  const x = r === 'crit' ? 2 : 1, head = r === 'crit' ? `★ ${name} 대성공!` : `${name} 성공!`;
  // 남은 수치는 방어만 적는다 (다른 세력 성의 농업·상업·치안은 비공개)
  const cut = (k, n) => { const v = Math.min(cs[k], Math.floor(n * x)); cs[k] -= v; return `${DOMESTIC[k].label} -${v}${k === 'wall' ? ` (${cs[k]})` : ''}`; };
  const what = kind === 'destroy'
    ? [cut('wall', int * PLOT.destroy.wallPerInt)]
    : [cut('peace', int * PLOT.rumor.peacePerInt), cut('agri', int * PLOT.rumor.devPerInt), cut('comm', int * PLOT.rumor.devPerInt)];
  addLog(g, `${head} ${c.name}: ${kind === 'destroy' ? '성벽 곳곳을 무너뜨렸다' : '흉흉한 소문을 퍼뜨렸다'}. ${what.join(' · ')}`);
  addMerit(g, RULES.merit.plot);
  gainStatExp(g, 'int', r === 'crit' ? PLOT.critExp : PLOT.exp);
  return '';
}

// ----- 수련 -----
// 고른 능력치의 경험치를 집중해서 쌓는다. 공적은 붙지 않는다
function runTrain(g, o) {
  const st = STATS.find(s => s.key === o.stat);
  if (!st) return '없는 능력치';
  if (g.stats[o.stat] >= RULES.statMax) return `${josa(st.name, '이가')} 이미 최대`;
  const free = traitOf(g.faction).freeTrain; // 왕랑: 수련에 금이 들지 않는다
  const why = free ? '' : pay(g, 'train');
  if (why) return why;
  const gain = traitExp(g, o.stat, randInt(RULES.statExp.train.min, RULES.statExp.train.max));
  const up = addStatExp(g, o.stat, gain);
  addLog(g, `${st.name} 수련: 경험 +${gain}` + (free ? '' : ` · 내 금 -${RULES.myGoldCost.train}`) +
    (up ? ` · ★ ${josa(st.name, '이가')} 올랐다! (${g.stats[o.stat]})` : ` (${g.statExp[o.stat]}/${expNeed(g.stats[o.stat])})`));
  return '';
}

// ----- 병기 생산 (내 금) -----
function runSiege(g, o) {
  const city = cityById(g.city), cs = S.cities[g.city], w = SIEGE[o.type];
  if (!w) return '없는 병기';
  g.siege = g.siege || {};
  if (g.siege[o.type]) return `${josa(o.type, '은는')} 이미 가지고 있음`;
  if (g.gold < w.price) return `내 금 부족 (필요 ${w.price}, 있음 ${fmt(g.gold)})`;
  g.gold -= w.price;
  // 부대마다 병기는 하나만. 다른 병기를 가지고 있었으면 버린다
  const old = Object.keys(g.siege).find(t => g.siege[t]);
  g.siege = { [o.type]: true };
  addMerit(g, RULES.merit.siege);
  addLog(g, `${city.name}: ${josa(o.type, '을를')} 만들어 부대에 갖췄다! (${w.desc}) 내 금 -${fmt(w.price)}` + (old ? ` · 가지고 있던 ${josa(old, '은는')} 버렸다` : ''));
  return '';
}

// ----- 상점 (내 금, 예약 없이 바로) -----
// 명마·명검·서적은 여러 번 살 수 있다. 살 때마다 그 물건 값이 오른다 (shopPrice).
// 명령이 아니라서 턴을 쓰지 않고 공적도 없다. 틀리면 이유를 돌려준다
function buyItem(g, item) {
  const o = { item }, it = SHOP[o.item];
  if (!it) return '없는 물건';
  const st = STATS.find(s => s.key === it.stat);
  if (effStats(g)[it.stat] >= RULES.statMax) return `${josa(st.name, '이가')} 이미 최고 (${RULES.statMax})`;
  const price = shopPrice(g, o.item);
  if (g.gold < price) return `내 금 부족 (필요 ${fmt(price)}, 있음 ${fmt(g.gold)})`;
  g.gold -= price;
  g.gear = g.gear || {};
  g.gear[o.item] = gearCount(g, o.item) + 1;
  addLog(g, `상점에서 ${josa(o.item, '을를')} 샀다! ${st.name} +${it.bonus} (지금 ${effStats(g)[it.stat]}, ${o.item} ${g.gear[o.item]}개) · 내 금 -${fmt(price)}`);
  return '';
}

// ----- 군량 구매 (내 금) -----
// 금을 내고 지금 있는 성에 군량을 들인다. 예약할 때 얼마어치(금) 살지 고른다 (order.item = 금액).
// 창고(군량 최대치)에 다 안 들어가면 들어가는 만큼만 사고, 금도 그만큼만 낸다
function runBuyFood(g, o) {
  const city = cityById(g.city), cs = S.cities[g.city], max = foodMax(city.grade);
  if (cs.food >= max) return `${city.name}의 군량 창고가 가득 참 (${fmt(max)})`;
  const perGold = foodPrice();
  const want = buyFoodGold(o);
  const got = Math.min(want * perGold, max - cs.food);
  const pay = Math.ceil(got / perGold);
  if (g.gold < pay) return `내 금 부족 (필요 ${fmt(pay)}, 있음 ${fmt(g.gold)})`;
  g.gold -= pay;
  cs.food += got;
  addLog(g, `${city.name}: 상인에게서 군량을 사들였다. 군량 +${fmt(got)} (${fmt(cs.food)}) · 내 금 -${fmt(pay)} · 시세 1:${perGold}`);
  addMerit(g, RULES.merit.buy);
  return '';
}

// ----- 군량 수송 (2026-10-25) -----
// 내가 있는 성과 우리 땅으로 2칸 안의 다른 우리 성 사이에서 군량을 옮긴다. dir: send(내 성 → 그 성) / fetch(그 성 → 내 성).
// 양은 1~5,000 중 플레이어가 정하고, 보내는 성에 있는 만큼만, 받는 성 최대치까지만 옮긴다. 가다가 줄지 않는다
const transportAmount = o => Math.max(1, Math.min(RULES.transportMax, Math.floor(+(o && o.amount)) || 1));
function runTransport(g, o) {
  const here = cityById(g.city), other = cityById(o.to);
  if (!other) return '없는 성';
  if (other.id === here.id) return '같은 성끼리는 옮길 수 없음';
  if (other.faction !== g.faction) return `${josa(other.name, '은는')} 아군 성이 아님`;
  if (!linkedOwnCities(here.id, g.faction, RULES.moveRange).includes(other)) return `${here.name}에서 ${other.name}까지 아군 땅으로 ${RULES.moveRange}칸 안에 이어져 있지 않음`;
  const pull = o.dir === 'fetch', from = pull ? other : here, to = pull ? here : other;
  const src = S.cities[from.id], dst = S.cities[to.id], room = foodMax(to.grade) - dst.food;
  if (src.food <= 0) return `${from.name}에 보낼 군량이 없음`;
  if (room <= 0) return `${to.name}의 군량 창고가 가득 참 (${fmt(foodMax(to.grade))})`;
  const want = transportAmount(o), n = Math.min(want, src.food, room);
  src.food -= n;
  dst.food += n;
  const short = n < want ? (src.food <= 0 ? ` (${from.name}에 있는 만큼만)` : ` (${to.name} 창고에 들어가는 만큼만)`) : '';
  addLog(g, `🚚 군량 수송: ${from.name} → ${to.name} ${fmt(n)}${short} · ${from.name} ${fmt(src.food)} · ${to.name} ${fmt(dst.food)}`);
  addMerit(g, RULES.merit.transport);
  return '';
}



// ----- 하야 (예약 없이 바로) -----
// 세력을 떠나 재야가 된다. 병사는 세력의 것이라 흩어지고, 공적·금·능력치는 그대로 (멸망했을 때와 같다).
// 남은 예약은 모두 지워지고, 다음에 들어오면 세력 선택부터 다시 한다. 떠난 세력에는 RULES.rejoinWait턴 동안 못 들어간다
function runResign(g) {
  if (!g.faction) return '세력에 소속되어 있지 않아요.';
  const f = factionById(g.faction), city = cityById(g.city);
  const left = g.troops > 0 ? ` 거느리던 ${g.unitType} ${fmt(g.troops)}명은 흩어졌다.` : '';
  Object.assign(g, { faction: null, city: null, troops: 0, unitType: null, training: 0 });
  g.leftFaction = { id: f.id, until: S.turn + RULES.rejoinWait }; // 떠난 세력에는 한동안 다시 못 들어간다
  clearOrders(g);
  addLog(g, `${g.name}, ${city.name}에서 ${f.name} 세력을 떠나 재야로 돌아갔다.${left}`);
  return '';
}

// 명령 목록: 이름(label)과 실행(run)
const cityName = id => (cityById(id) || { name: '?' }).name;
const COMMANDS = {
  agri: { label: () => '농업', run: g => runDomestic(g, 'agri') },
  comm: { label: () => '상업', run: g => runDomestic(g, 'comm') },
  tech: { label: () => '기술', run: g => runDomestic(g, 'tech') },
  wall: { label: () => '축성', run: g => runDomestic(g, 'wall') },
  peace: { label: () => '치안', run: g => runDomestic(g, 'peace') },
  draft: { label: o => `징병 (${o.unit})`, run: runDraft },
  drill: { label: () => '훈련', run: runDrill },
  attack: { label: o => `출진 → ${cityName(o.to)}`, run: runAttack },
  move: { label: o => `이동 → ${cityName(o.to)}`, run: runMove },
  destroy: { label: o => `파괴 → ${cityName(o.to)}`, run: (g, o) => runPlot(g, 'destroy', o) },
  rumor: { label: o => `유언 → ${cityName(o.to)}`, run: (g, o) => runPlot(g, 'rumor', o) },
  explore: { label: () => '탐색', run: runExplore },
  spy: { label: o => `첩보 → ${cityName(o.to)}`, run: runSpy },
  train: { label: o => `수련 (${(STATS.find(s => s.key === o.stat) || { name: '?' }).name})`, run: runTrain },
  siege: { label: o => `병기 제작 (${o.type})`, run: runSiege },
  buyFood: { label: o => `군량 구매 (금 ${fmt(buyFoodGold(o))})`, run: runBuyFood },
  transport: { label: o => `수송 ${o.dir === 'fetch' ? '←' : '→'} ${cityName(o.to)} (${fmt(transportAmount(o))})`, run: runTransport },
};
const orderLabel = o => (COMMANDS[o.cmd] ? COMMANDS[o.cmd].label(o) : '없어진 명령');
