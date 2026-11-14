'use strict';
// 무술대회 카드 대결 규칙 (2026-11-14). 연습 화면(lab/martial.html), 연습 서버(lab/duel_server.js), 실제 서버(supabase/build.sh가 duel.js로 묶음)가 같이 쓴다.
// 숫자를 바꾸면 둘 다 바뀐다. 기획 내용은 martial.html 맨 위 설명 참고
const T = { atk: { name: '속공', ic: '⚡' }, tec: { name: '강타', ic: '💪' }, def: { name: '역습', ic: '🔄' }, kill: { name: '필살', ic: '💥' }, dodge: { name: '회피', ic: '💨' } }; // 2026-11-14 기획자: 공격·기술·방어 → 속공·강타·역습. 필살·회피는 흰 특수 카드
const TYPES = ['atk', 'tec', 'def'];
const SPECIAL = ['kill', 'dodge'];
const isSp = c => SPECIAL.includes(c.t);
const BEATS = { atk: 'tec', tec: 'def', def: 'atk' }; // 속공 > 강타 > 역습 > 속공
const SIZE_NAME = ['소', '중', '대'], DMG = [10, 15, 20]; // 2026-11-14 기획자 시험: 10·15·20 · 필살 25 (그 전 10·16·22 · 필살 30)
// 카드 한 장 뽑을 때 확률 (%) (2026-11-14 기획자): 유형마다 소 12 · 중 9 · 대 7 (유형 합 28 × 3 = 84) + 필살 6 · 회피 10 (특수 16). 손에 쥐는 장수 제한 없음
const SIZE_P = [12, 10, 7], KILL_P = 6, DODGE_P = 7; // 2026-11-14 기획자: 12·10·7 / 필살 6 · 회피 7 (그 전 12·9·7 / 6·10)
const KILL_DMG = 25, HP = 100, MAX_ROUND = 15, TIME = 10;
const SHUFFLE_N = 2; // 재정비: 경기마다 2번, 같은 합에 두 번은 안 됨 (2026-11-14 기획자)
const handMax = w => w < 90 ? 4 : w < 100 ? 5 : w < 110 ? 6 : 7; // 2026-11-14 기획자: 최소 4장 (그 전엔 80 미만 3장). 특수 카드도 이 칸을 차지한다
// 피해 배율 (2026-11-14 기획자): 무력 '차이' 기준. 1점당 0.8%씩 높은 쪽은 오르고 낮은 쪽은 내린다 (10점 차이 = +8% · -8%).
// 같은 무력끼리는 몇이든 1배라 경기 길이가 고르다. 그 전: 무력 100 기준 1점당 1.5% (120끼리는 빨리, 80끼리는 오래 끝났음)
const MULT_PER = 0.01; // 2026-11-14 기획자: 0.8% → 1% (10점 차이 = 1.10배 · 0.90배)
const mult = (w, ow) => Math.max(0.3, 1 + (w - ow) * MULT_PER);
const rnd = n => Math.floor(Math.random() * n);
// 카드 한 장 뽑기. block: 지금 손에 더 쥘 수 없는 특수 카드 종류 (그 종류는 뽑기 후보에서 아예 빠진다, 2026-11-14)
function drawCard(block = []) {
  const pool = [];
  for (const t of TYPES) SIZE_P.forEach((p, s) => pool.push([{ t, s }, p]));
  if (!block.includes('kill')) pool.push([{ t: 'kill' }, KILL_P]);
  if (!block.includes('dodge')) pool.push([{ t: 'dodge' }, DODGE_P]);
  let r = Math.random() * pool.reduce((a, x) => a + x[1], 0);
  for (const [c, p] of pool) { r -= p; if (r < 0) return { ...c }; }
  return { ...pool[0][0] };
}
function newFighter(war) { const f = { war, hp: HP, hand: [], used: {}, shuffleLeft: SHUFFLE_N, shuffledRound: 0 }; refill(f); return f; }
// 손패 정렬: 속공 소·중·대 → 강타 소·중·대 → 역습 소·중·대 → 필살 → 회피 (2026-11-14 기획자)
const ORDER = [...TYPES, ...SPECIAL];
const sortHand = f => f.hand.sort((x, y) => ORDER.indexOf(x.t) - ORDER.indexOf(y.t) || (x.s || 0) - (y.s || 0));
// 손에 쥘 수 있는 특수 카드 (2026-11-14 기획자): 모두 합쳐 최대 3장, 같은 종류는 최대 2장 (필회회 OK, 회회회·필필필 안 됨).
// 막힌 종류는 뽑기 후보에서 빼고 뽑는다 (다시 뽑지 않음)
const SP_MAX = 3, SP_SAME_MAX = 2;
function blocked(f) {
  const sp = f.hand.filter(isSp);
  if (sp.length >= SP_MAX) return [...SPECIAL];
  return SPECIAL.filter(t => sp.filter(x => x.t === t).length >= SP_SAME_MAX);
}
function refill(f) { while (f.hand.length < handMax(f.war)) f.hand.push(drawCard(blocked(f))); sortHand(f); }
// 재정비: 손패를 모두 새로 받는다 (특수 카드도 같은 확률로). 경기마다 SHUFFLE_N번, 같은 합에 한 번만
const canShuffle = (f, round) => f.shuffleLeft > 0 && f.shuffledRound !== round;
function doShuffle(f, round) { f.shuffleLeft--; f.shuffledRound = round; f.used.shuffle = f.shuffleLeft <= 0; f.hand = []; refill(f); }
const cardText = c => isSp(c) ? `${T[c.t].ic}${T[c.t].name}` : `${T[c.t].ic}${T[c.t].name}(${SIZE_NAME[c.s]})`;
const actText = a => a.k === 'kill' ? '💥필살' : a.k === 'dodge' ? '💨회피' : `${T[a.c.t].ic}${T[a.c.t].name}(${SIZE_NAME[a.c.s]})`; // 기록창용: 💪강타(대) (2026-11-14 기획자 형식)
// 손패 i번째 카드를 내는 수: 일반 카드 { k: 'card', i, c } · 필살 { k: 'kill', i } · 회피 { k: 'dodge', i }
const actOf = (f, i) => { const c = f.hand[i]; return isSp(c) ? { k: c.t, i } : { k: 'card', i, c }; };

// 한 합 판정. a, b = { k: 'card', c } | { k: 'kill' } | { k: 'dodge' }
// 돌려줌: { win: 0 | 1 | null, dmg, how } (how: card, kill, dodged, tie, idle)
function judge(a, b, fa, fb) {
  const isAtk = x => x.k === 'kill' || x.k === 'card'; // 회피는 모든 카드와 필살을 피한다 (2026-11-14 기획자). 둘 다 회피면 헛수
  if (a.k === 'dodge' || b.k === 'dodge') {
    const other = a.k === 'dodge' ? b : a;
    return { win: null, dmg: 0, how: isAtk(other) && !(a.k === 'dodge' && b.k === 'dodge') ? 'dodged' : 'idle', dodger: a.k === 'dodge' ? (b.k === 'dodge' ? null : 0) : 1 };
  }
  if (a.k === 'kill' && b.k === 'kill') return { win: null, dmg: 0, how: 'tie' };
  if (a.k === 'kill') return { win: 0, dmg: Math.round(KILL_DMG * mult(fa.war, fb.war)), how: 'kill' };
  if (b.k === 'kill') return { win: 1, dmg: Math.round(KILL_DMG * mult(fb.war, fa.war)), how: 'kill' };
  const ca = a.c, cb = b.c;
  let win = null;
  if (ca.t === cb.t) win = ca.s > cb.s ? 0 : cb.s > ca.s ? 1 : null;
  else win = BEATS[ca.t] === cb.t ? 0 : 1;
  if (win === null) return { win: null, dmg: 0, how: 'tie' };
  const c = win === 0 ? ca : cb, f = win === 0 ? fa : fb, o = win === 0 ? fb : fa;
  return { win, dmg: Math.round(DMG[c.s] * mult(f.war, o.war)), how: 'card' };
}

// 컴퓨터: 단순한 수 (손에 필살·회피가 있으면 가끔 쓰고, 아니면 큰 카드를 조금 더 냄)
function aiShuffle(f, round) {
  if (!canShuffle(f, round)) return false;
  const n = f.hand.filter(c => !isSp(c)); if (!n.length) return false;
  const avg = n.reduce((a, c) => a + c.s, 0) / n.length; return avg < 0.6 && Math.random() < 0.5;
}
function aiAct(me, op) {
  const ik = me.hand.findIndex(c => c.t === 'kill'), id = me.hand.findIndex(c => c.t === 'dodge');
  if (ik >= 0 && (Math.random() < 0.35 || op.hp <= KILL_DMG * mult(me.war, op.war))) return { k: 'kill', i: ik };
  if (id >= 0 && (Math.random() < 0.25 || me.hp <= 30)) return { k: 'dodge', i: id };
  const n = me.hand.map((c, i) => [c, i]).filter(([c]) => !isSp(c));
  if (!n.length) return actOf(me, ik >= 0 ? ik : id); // 특수 카드만 남았으면 그걸 낸다
  let tot = n.reduce((a, [c]) => a + 1 + c.s, 0), r = Math.random() * tot;
  for (const [c, i] of n) { r -= 1 + c.s; if (r < 0) return { k: 'card', i, c }; }
  return { k: 'card', i: n[0][1], c: n[0][0] };
}
// 시간이 다 됐을 때: 일반 카드 중 무작위 (없으면 아무 카드)
function randomAct(f) { const n = f.hand.map((c, i) => i).filter(i => !isSp(f.hand[i])); const i = n.length ? n[rnd(n.length)] : rnd(f.hand.length); return actOf(f, i); }
function useAct(f, a) { // 낸 카드는 손에서 빼고 다시 받는다 (특수 카드도 같음)
  if (a.i != null && f.hand[a.i]) { f.hand.splice(a.i, 1); refill(f); }
}
// 컴퓨터끼리 한 경기: 0 / 1 / null(무승부)
function simMatch(w0, w1) {
  const f = [newFighter(w0), newFighter(w1)];
  for (let r = 1; r <= MAX_ROUND; r++) {
    f.forEach(x => { if (aiShuffle(x, r)) doShuffle(x, r); });
    const a = aiAct(f[0], f[1]), b = aiAct(f[1], f[0]);
    const j = judge(a, b, f[0], f[1]);
    useAct(f[0], a); useAct(f[1], b);
    if (j.win !== null) { f[1 - j.win].hp -= j.dmg; if (f[1 - j.win].hp <= 0) return j.win; }
  }
  return f[0].hp > f[1].hp ? 0 : f[1].hp > f[0].hp ? 1 : null;
}

if (typeof module !== 'undefined') module.exports = { T, TYPES, SPECIAL, isSp, BEATS, SIZE_NAME, SIZE_P, KILL_P, DODGE_P, DMG, KILL_DMG, HP, MAX_ROUND, TIME, SHUFFLE_N, handMax, SP_MAX, SP_SAME_MAX, blocked, MULT_PER, mult, rnd, drawCard, newFighter, sortHand, refill, canShuffle, doShuffle, cardText, actText, actOf, judge, aiShuffle, aiAct, randomAct, useAct, simMatch };
