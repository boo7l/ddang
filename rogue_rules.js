'use strict';
// 연전 미니게임 「맹장집결」(가제) 로컬 연구용 규칙 (2026-11-16). 웹에 안 올라감 (lab 폴더).
// 싸움 자체는 무술대회 규칙(../duel_rules.js)을 그대로 쓰고, 강화(f.m)가 붙는 곳만 여기서 다시 만든다.
// 숫자는 모두 이 파일 맨 위에서 고친다. rogue.html(플레이·시뮬)과 node 시뮬(rogue_sim.js)이 같이 쓴다.
if (typeof module !== 'undefined' && typeof TYPES === 'undefined') Object.assign(globalThis, require('./duel_rules.js'));

// ===== 시작 =====
const START = { war: 85, hp: 100, shuffle: 2 };
const WIN_WAR = 1; // 한 판 이길 때마다 무력 +1 (2026-11-17 기획자)
const REGEN = 40; // 이기면 체력 40 회복 (최대 체력은 넘지 않음). 2026-11-17 기획자: 최대 체력의 50% → 고정 30 → 40

// ===== 상대 (단계 순서) =====
// spr: 전용 그림 (lab/img/<spr>0~4.png, 없으면 기본 빨간 장수). m: 상대 강화 (아래 강화와 같은 이름). 예: hpMax 체력 최대치, typeDmg 종류별 피해 +, dodgeP 회피 뽑힐 확률 +%p
const STAGES = [ // 2026-11-17 기획자: 체력 장합부터 110·110·120·125·130, 특징 바꿈
  { name: '무안국', war: 78, m: {}, note: '' },
  { name: '엄안', war: 83, m: { typeDmg: { def: 3 } }, note: '역습 피해 +3' }, // 2026-11-17 기획자
  { name: '능통', war: 87, m: { typeDmg: { tec: 5 } }, note: '강타 피해 +5' }, // 2026-11-17 기획자: +3 → +5
  { name: '장합', war: 90, m: { hpMax: 110, killDmg: 5 }, note: '필살 피해 +5' },
  { name: '황충', war: 93, m: { hpMax: 110, dodgeP: 4 }, note: '회피를 잘 뽑음' },
  { name: '장료', war: 96, m: { hpMax: 120, typeDmg: { atk: 2, tec: 2, def: 2 } }, note: '일반 피해 +2' },
  { name: '관우', war: 99, m: { hpMax: 125, killDmg: 10 }, note: '필살 피해 +10', spr: 'guanyu' },
  { name: '여포', war: 102, m: { hpMax: 130, killP: 4, hand: 1 } /* 필살 +4%p는 설명에서 숨김 (2026-11-17 기획자) */, note: '손패 +1', boss: true, spr: 'lubu' },
];

// ===== 강화 =====
// tier: N(흰) R(파랑) SR(금) SSR(보라). once: 한 번만 고를 수 있음. type: 'any'면 보여 줄 때 속공·강타·역습 중 하나를 정한다
const TIER_P = { N: 50, R: 32, SR: 13, SSR: 5 }; // 한 칸마다 등급 확률 (%). 2026-11-17 기획자 엑셀 2차 (그 전 45·35·15·5, 처음 55·30·12·3)
const SURE_SR = [3, 6]; // 이 단계를 이기면 세 칸 중 한 칸은 SR 이상
const TIER_ORDER = ['N', 'R', 'SR', 'SSR'];
// 2026-11-17 기획자 엑셀 수정본(docs/맹장집결_강화목록.xlsx) 반영. 회복력은 +5 (기획자 확정), 큰 카드는 효과 글 3%p로 읽음 (두 칸이 달라서)
const BOONS = [
  { id: 'war3', tier: 'N', name: '무력 상승(소)', desc: '무력 +2', fx: m => { m.war += 2; } }, // 2026-11-17 기획자: 하·중·상 2·4·6
  { id: 'hp10', tier: 'N', name: '최대 체력 증가', desc: '최대 체력 +10', fx: (m, f) => { m.hpMax += 10; f.hp += 10; } },
  { id: 'breath', tier: 'N', name: '숨 고르기', desc: '💨회피를 내면 체력 +5', fx: m => { m.dodgeHeal += 5; } }, // 2026-11-17 기획자 추가: 상대 카드와 관계없이 내가 회피를 내면
  { id: 'heal30', tier: 'N', name: '응급 처치', desc: '체력 추가 회복 +25 (최대 체력은 넘지 않음)', fx: (m, f) => { f.hp = Math.min(m.hpMax, f.hp + 25); } }, // 2026-11-17 엑셀: 30 → 25
  { id: 'early', tier: 'N', name: '기선 제압', desc: '1~3합에 이기면 피해 +5', once: true, fx: m => { m.earlyDmg += 5; } }, // 2026-11-17 기획자 추가, 중복 불가
  { id: 'atk2', tier: 'N', name: '속공 단련', desc: '⚡속공으로 이기면 피해 +3', fx: m => { m.typeDmg.atk += 3; } },
  { id: 'tec2', tier: 'N', name: '강타 단련', desc: '💪강타로 이기면 피해 +3', fx: m => { m.typeDmg.tec += 3; } },
  { id: 'def2', tier: 'N', name: '역습 단련', desc: '🔄역습으로 이기면 피해 +3', fx: m => { m.typeDmg.def += 3; } },
  { id: 'war6', tier: 'R', name: '무력 상승(중)', desc: '무력 +4', fx: m => { m.war += 4; } },
  { id: 'kill6', tier: 'R', name: '약점 포착', desc: '💥필살 피해 +5', fx: m => { m.killDmg += 5; } },
  { id: 'regen', tier: 'R', name: '회복력', desc: '판 사이 회복 +5', fx: m => { m.regen += 5; } }, // 2026-11-17 기획자: 5로 확정 (10 했다가 되돌림)
  { id: 'armor', tier: 'R', name: '철갑', desc: '받는 피해 -2', fx: m => { m.armor += 2; } },
  { id: 'big', tier: 'R', name: '큰 카드', desc: '대 카드 뽑힐 확률 +3%p', fx: m => { m.bigP += 3; } },
  { id: 'drain', tier: 'R', name: '흡혈', desc: '합에서 이길 때마다 체력 +3', fx: m => { m.drain += 3; } },
  { id: 'master', tier: 'SR', name: '달인', desc: '일반 카드로 이기면 피해 +3', fx: m => { m.typeDmg.atk += 3; m.typeDmg.tec += 3; m.typeDmg.def += 3; } },
  { id: 'shuf', tier: 'SR', name: '쉬는 게 아니라', desc: '재정비 +1회 (판마다)', fx: m => { m.shuffle += 1; } },
  { id: 'killP', tier: 'SR', name: '필살 단련', desc: '💥필살 뽑힐 확률 +2.5%p', fx: m => { m.killP += 2.5; } },
  { id: 'dodgeP', tier: 'R', name: '회피 단련', desc: '💨회피 뽑힐 확률 +2.5%p', fx: m => { m.dodgeP += 2.5; } },
  { id: 'full', tier: 'SR', name: '완전 회복', desc: '즉시 체력 가득', fx: (m, f) => { f.hp = m.hpMax; } },
  { id: 'war7', tier: 'SR', name: '무력 상승(대)', desc: '무력 +6', fx: m => { m.war += 6; } },
  { id: 'magic', tier: 'SSR', name: '요술', short: '전용 카드 🔮요술을 얻어요 (상대 -15 · 내 체력 +15)', desc: '전용 카드 🔮요술이 손패에 들어와요 (5%). 일반 카드를 모두 이기고 상대 체력 -15 · 내 체력 +15. 필살엔 비기고 회피엔 막혀요', once: true, fx: m => { m.magic = 1; } }, // 2026-11-17 기획자
  { id: 'hand', tier: 'SSR', name: '큰 손', desc: '손패 +1장', fx: m => { m.hand += 1; } },
  { id: 'revive', tier: 'SSR', name: '기사회생', desc: '판마다 한 번, 쓰러질 때 체력 20으로 버팀', once: true, fx: m => { m.revive = 20; } },
  { id: 'killx', tier: 'SSR', name: '일격필살', desc: '💥필살 피해 ×1.3', once: true, fx: m => { m.killMul *= 1.3; } },
];
const boonById = id => BOONS.find(b => b.id === id);
const boonName = o => o.t ? `${T[o.t].name} ${boonById(o.id).name}` : boonById(o.id).name;
// short: 강화 고르기 종이·내 강화 상자에 쓰는 짧은 설명 (표에는 desc 전체, 2026-11-17 기획자)
const boonDesc = o => o.t ? `${T[o.t].ic}${T[o.t].name}으로 이기면 ${boonById(o.id).desc}` : (boonById(o.id).short || boonById(o.id).desc);

// 강화 묶음 (m). 상대도 같은 모양
function newMods(base = {}) {
  const m = { war: base.war ?? START.war, hpMax: base.hpMax ?? START.hp, shuffle: base.shuffle ?? START.shuffle, hand: 0, typeDmg: { atk: 0, tec: 0, def: 0 }, killDmg: 0, killMul: 1, killP: 0, dodgeP: 0, bigP: 0, armor: 0, drain: 0, dodgeHeal: 0, earlyDmg: 0, magic: 0, revive: 0, regen: REGEN };
  for (const [k, v] of Object.entries(base)) if (k === 'typeDmg') Object.assign(m.typeDmg, v); else if (k !== 'war' && k !== 'hpMax' && k !== 'shuffle') m[k] = v;
  return m;
}
function enemyMods(s) { return newMods({ war: s.war, hpMax: s.m.hpMax ?? 100, shuffle: 2, ...s.m }); }

// ===== 전용 카드 요술 (2026-11-17 기획자, SSR 강화 '요술'을 고른 사람만 뽑는다) =====
// 일반 카드를 모두 이기고 상대 체력 -20 · 내 체력 +20 (항상 고정, 최대 체력은 넘지 않음). 필살과는 비기고, 회피에는 막힌다
const MAGIC_P = 5, MAGIC_DMG = 15, MAGIC_HEAL = 15; // 2026-11-17 기획자: 피해·회복 20 → 15
T.magic = { name: '요술', ic: '🔮' };
if (!SPECIAL.includes('magic')) SPECIAL.push('magic'); // 흰(특수) 카드로 다룬다: 손패 칸 차지, 특수 카드 제한(3장·같은 종류 2장)에 들어감
if (typeof ORDER !== 'undefined' && !ORDER.includes('magic')) ORDER.push('magic');
const actTextR = a => a.k === 'card' ? actText(a) : `${T[a.k].ic}${T[a.k].name}`; // 기록창 글 (요술 포함) // 손패 정렬: 맨 끝 (브라우저에서만 보임)

// ===== 싸움 (duel_rules.js를 강화 반영으로 다시) =====
const handMaxR = f => handMax(f.war) + (f.m.hand || 0);
function drawCardR(f, block = []) {
  const m = f.m, pool = [];
  // 큰 카드 (2026-11-17 기획자): 대는 종류마다 정확히 +bigP%p, 늘어난 만큼 소·중에서 반씩 뺀다 (필살·회피는 그대로). 한쪽이 0이 되면 나머지에서
  const sz = [...SIZE_P];
  if (m.bigP) { let take = Math.min(m.bigP, sz[0] + sz[1]); sz[2] += take; const half = take / 2, a = Math.min(sz[0], half), b = Math.min(sz[1], take - a); sz[0] -= a; sz[1] -= b; if (a + b < take) sz[0] -= Math.min(sz[0], take - a - b); }
  // 필살 단련·회피 단련 (2026-11-17 기획자): 그 카드는 정확히 +%p, 늘어난 만큼 일반 카드 9종에서 똑같이 나눠 뺀다 (0 밑으로는 안 감)
  // 요술 (2026-11-17 기획자: 가장 위 판정이라) 5%는 다른 카드 11종(일반 9 + 필살 + 회피)에서 똑같이 뺀다
  const mCut = m.magic ? MAGIC_P / 11 : 0;
  const spAdd = (m.killP || 0) + (m.dodgeP || 0), cut = spAdd / 9 + mCut;
  for (const t of TYPES) sz.forEach((p, s) => pool.push([{ t, s }, Math.max(0, p - cut)]));
  if (!block.includes('kill')) pool.push([{ t: 'kill' }, Math.max(0, KILL_P + m.killP - mCut)]);
  if (!block.includes('dodge')) pool.push([{ t: 'dodge' }, Math.max(0, DODGE_P + m.dodgeP - mCut)]);
  if (m.magic && !block.includes('magic')) pool.push([{ t: 'magic' }, MAGIC_P]);
  let r = Math.random() * pool.reduce((a, x) => a + x[1], 0);
  for (const [c, p] of pool) { r -= p; if (r < 0) return { ...c }; }
  return { ...pool[0][0] };
}
function refillR(f) { while (f.hand.length < handMaxR(f)) f.hand.push(drawCardR(f, blocked(f))); sortHand(f); }
// hp: 이어온 체력 (없으면 가득)
function newFighterR(m, hp) { const f = { m, war: m.war, hp: hp ?? m.hpMax, hpMax: m.hpMax, hand: [], used: {}, shuffleLeft: m.shuffle, shuffledRound: 0, revived: false }; refillR(f); return f; }
function doShuffleR(f, round) { f.shuffleLeft--; f.shuffledRound = round; f.used.shuffle = f.shuffleLeft <= 0; f.hand = []; refillR(f); }
function useActR(f, a) { if (a.i != null && f.hand[a.i]) { f.hand.splice(a.i, 1); refillR(f); } }
// 피해: (기본 + 종류 보너스) × 무력 배율, 필살은 (25 + 필살 보너스) × 필살 배율 × 무력 배율. 그 뒤 받는 쪽 철갑만큼 빼고 최소 1
// round: 몇 번째 합인지 (기선 제압: 1~3합에 이기면 +earlyDmg, 필살도 포함 — 2026-11-17 기획자)
function dmgOf(f, o, how, t, s, round = 99) {
  const early = round <= 3 ? (f.m.earlyDmg || 0) : 0;
  const base = (how === 'kill' ? (KILL_DMG + f.m.killDmg) * f.m.killMul : DMG[s] + f.m.typeDmg[t]) + early;
  return Math.max(1, Math.round(base * mult(f.war, o.war)) - o.m.armor);
}
function judgeR(a, b, fa, fb, round) {
  if (a.k === 'magic' || b.k === 'magic') { // 요술
    if (a.k === 'magic' && b.k === 'magic') return { win: null, dmg: 0, how: 'tie' };
    const mi = a.k === 'magic' ? 0 : 1, other = mi === 0 ? b : a;
    if (other.k === 'dodge') return { win: null, dmg: 0, how: 'dodged', dodger: 1 - mi }; // 회피에 막힘
    if (other.k === 'kill') return { win: null, dmg: 0, how: 'tie' }; // 필살과 비김
    return { win: mi, dmg: MAGIC_DMG, how: 'magic' }; // 일반 카드는 모두 이김
  }
  const j = judge(a, b, fa, fb); // 승패·방식은 원래 규칙 그대로, 피해만 다시 계산
  if (j.win === null) return j;
  const f = j.win === 0 ? fa : fb, o = j.win === 0 ? fb : fa, act = j.win === 0 ? a : b;
  j.dmg = j.how === 'kill' ? dmgOf(f, o, 'kill', null, null, round) : dmgOf(f, o, 'card', act.c.t, act.c.s, round);
  return j;
}
// 판정 뒤 체력 반영 (숨 고르기·흡혈·기사회생). acts: 두 쪽이 낸 수. 돌려줌: { breath: [나, 상대], drain, revived }
function applyHit(F, j, acts = []) {
  const out = {};
  acts.forEach((a, i) => { if (a && a.k === 'dodge') { const d = F[i], g = Math.min(d.m.dodgeHeal || 0, d.hpMax - d.hp); if (g > 0) { (out.breath = out.breath || [0, 0])[i] = g; d.hp += g; } } }); // 숨 고르기: 회피를 내면 (상대 카드 상관없이)
  if (j.win === null) return out;
  const w = F[j.win], l = F[1 - j.win];
  l.hp -= j.dmg;
  if (j.how === 'magic') { const g = Math.min(MAGIC_HEAL, w.hpMax - w.hp); if (g > 0) { w.hp += g; out.magicHeal = g; } } // 요술: 내 체력 +MAGIC_HEAL (15)
  if (w.m.drain) { const g = Math.min(w.m.drain, w.hpMax - w.hp); if (g > 0) { w.hp += g; out.drain = g; } }
  if (l.hp <= 0 && l.m.revive && !l.revived) { l.revived = true; l.hp = l.m.revive; out.revived = 1 - j.win; }
  return out;
}

// ===== 강화 고르기 =====
function rollTier(minTier) {
  const tiers = TIER_ORDER.slice(TIER_ORDER.indexOf(minTier || 'N'));
  let r = Math.random() * tiers.reduce((a, t) => a + TIER_P[t], 0);
  for (const t of tiers) { r -= TIER_P[t]; if (r < 0) return t; }
  return tiers[0];
}
// 세 칸 뽑기. taken: 이미 고른 강화 id 목록 (once 강화는 다시 안 나옴). sure: 한 칸은 SR 이상
function offerBoons(taken, sure) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    for (let tries = 0; tries < 50; tries++) {
      const tier = rollTier(sure && k === 0 ? 'SR' : 'N');
      const list = BOONS.filter(b => b.tier === tier && !(b.once && taken.includes(b.id)) && !out.some(o => o.id === b.id));
      if (!list.length) continue;
      const b = list[rnd(list.length)];
      out.push({ id: b.id, tier: b.tier, t: b.type === 'any' ? TYPES[rnd(3)] : undefined });
      break;
    }
  }
  return out.sort((x, y) => TIER_ORDER.indexOf(y.tier) - TIER_ORDER.indexOf(x.tier));
}
function takeBoon(run, o) { boonById(o.id).fx(run.m, run, o.t); run.taken.push(o.id); run.hp = Math.min(run.hp, run.m.hpMax); }

// ===== 한 판 (컴퓨터끼리, 시뮬용) =====
// 사람 흉내 (2026-11-16): 상대 손패 색(종류)을 보고, 상대가 낼 법한 종류를 이기는 카드 중 가장 큰 것을 낸다.
// 필살·회피는 컴퓨터와 같은 방식. 상대 손패 일반 카드 종류 수로 상대가 낼 종류를 어림한다
function readAct(me, op) {
  const im = me.hand.findIndex(c => c.t === 'magic');
  if (im >= 0 && op.hand.filter(isSp).length <= 1 && Math.random() < 0.7) return { k: 'magic', i: im };
  const ik = me.hand.findIndex(c => c.t === 'kill'), id = me.hand.findIndex(c => c.t === 'dodge');
  if (ik >= 0 && (Math.random() < 0.35 || op.hp <= (KILL_DMG + me.m.killDmg) * me.m.killMul * mult(me.war, op.war))) return { k: 'kill', i: ik };
  if (id >= 0 && (Math.random() < 0.25 || me.hp <= 30)) return { k: 'dodge', i: id };
  const n = me.hand.map((c, i) => [c, i]).filter(([c]) => !isSp(c));
  if (!n.length) return actOf(me, ik >= 0 ? ik : id);
  const cnt = { atk: 0, tec: 0, def: 0 }; op.hand.forEach(c => { if (!isSp(c)) cnt[c.t]++; });
  const tot = cnt.atk + cnt.tec + cnt.def || 1;
  // 내 카드마다 기대 점수: 이길 확률 × 피해 - 질 확률 × 상대 평균 피해
  let best = null, bs = -1e9;
  for (const [c, i] of n) {
    const pw = cnt[BEATS[c.t]] / tot, pl = cnt[Object.keys(BEATS).find(k => BEATS[k] === c.t)] / tot;
    const sc = pw * (DMG[c.s] + me.m.typeDmg[c.t]) - pl * 15 + Math.random() * 2;
    if (sc > bs) { bs = sc; best = { k: 'card', i, c }; }
  }
  return best;
}
let PLAYER_AI = 'read'; // read 사람 흉내 · plain 컴퓨터와 같음
function simFight(pm, php, em) {
  const F = [newFighterR(pm, php), newFighterR(em)];
  for (let r = 1; r <= MAX_ROUND; r++) {
    F.forEach(x => { if (aiShuffle(x, r)) doShuffleR(x, r); });
    const a = PLAYER_AI === 'read' ? readAct(F[0], F[1]) : aiAct(F[0], F[1]), b = aiAct(F[1], F[0]);
    const j = judgeR(a, b, F[0], F[1], r);
    useActR(F[0], a); useActR(F[1], b);
    applyHit(F, j, [a, b]);
    if (F[0].hp <= 0) return { win: false, hp: 0, rounds: r };
    if (F[1].hp <= 0) return { win: true, hp: F[0].hp, rounds: r };
  }
  const win = F[0].hp > F[1].hp || (F[0].hp === F[1].hp && F[0].war < F[1].war); // 같으면 무력 낮은 쪽 (대회와 같게)
  return { win, hp: win ? F[0].hp : 0, rounds: MAX_ROUND };
}
// 고르는 법: random 아무거나 · tier 높은 등급 먼저 (같은 등급이면 무작위)
const PICKERS = {
  random: offer => offer[rnd(offer.length)],
  tier: offer => offer[0],
};
// 한 번 도전. 돌려줌: 몇 단계까지 이겼는지 (8이면 여포까지 클리어)
function simRun(pick = 'random') {
  const run = { m: newMods(), hp: START.hp, taken: [] };
  takeBoon(run, PICKERS[pick](offerBoons(run.taken, false))); // 첫 판 전 시작 강화 (2026-11-16 기획자)
  for (let i = 0; i < STAGES.length; i++) {
    const r = simFight(run.m, run.hp, enemyMods(STAGES[i]));
    if (!r.win) return i;
    run.hp = Math.min(run.m.hpMax, r.hp + run.m.regen); run.m.war += WIN_WAR;
    if (i < STAGES.length - 1) takeBoon(run, PICKERS[pick](offerBoons(run.taken, SURE_SR.includes(i + 1))));
  }
  return STAGES.length;
}
// n번 돌려서 단계별 도달·승률
function simReport(n = 5000, pick = 'random') {
  const reach = Array(STAGES.length + 1).fill(0);
  for (let k = 0; k < n; k++) { const s = simRun(pick); for (let i = 0; i <= s; i++) reach[i]++; }
  return STAGES.map((s, i) => ({ stage: i + 1, name: s.name, reach: reach[i] / n, win: reach[i] ? reach[i + 1] / reach[i] : 0 })).concat([{ clear: reach[STAGES.length] / n }]);
}

if (typeof module !== 'undefined') module.exports = { setPlayerAI: v => { PLAYER_AI = v; }, drawCardR, judgeR, applyHit, START, REGEN, WIN_WAR, STAGES, TIER_P, SURE_SR, BOONS, newMods, enemyMods, newFighterR, simFight, simRun, simReport, offerBoons, takeBoon };
