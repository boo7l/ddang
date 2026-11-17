'use strict';
// 통무지 밸런스 시뮬레이터: rules.js의 실제 fightRounds를 그대로 불러와 돌린다 (게임 코드는 수정하지 않음)
// 사용법 (저장소 루트에서):
//   node tools/balance-sim/sim.js                 → 모든 빌드 묶음 × 모든 안
//   node tools/balance-sim/sim.js late_exp V0,V1  → 특정 묶음(early | late | late_exp)과 특정 안만
// 설명·결과: docs/balance/stat-rework.md
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'rules.js'), 'utf8');
const [ONLY_STAGE, ONLY_VARIANTS] = [process.argv[2], process.argv[3] && process.argv[3].split(',')];

// 받는 피해 감소(β)는 피해를 병력에서 빼기 직전에만 끼워 넣는다 (보통 합 · 야전 공통)
const OLD = 'const dLoss = Math.min(def.troops, hitDef), aLoss = Math.min(att.troops, hitAtt);';
if (!SRC.includes(OLD)) throw new Error('fightRounds 패치 지점을 못 찾음');
const PATCHED = SRC.replace(OLD, 'const dLoss = Math.min(def.troops, Math.ceil(hitDef / leaDR(def))), aLoss = Math.min(att.troops, Math.ceil(hitAtt / leaDR(att)));');

const ctx = { console, Math, Date, Object, Array, Number, JSON, String, Infinity, NaN, isFinite, parseInt };
vm.createContext(ctx);
vm.runInContext(`var S = { season: 8 }; var traitOf = () => ({}); var BETA = 0; var leaDR = u => 1 + BETA * (u.stats.lea || 0);\n${PATCHED}\n;this.fightRounds = fightRounds; this.RULES = RULES; this.setBeta = b => { BETA = b; };`, ctx);
const { fightRounds, setBeta } = ctx;

const VARIANTS = {
  V0: { name: '현행 (상한 통솔×100, 징병 통솔×22~27)', cap: s => s.lea * 100, draft: s => s.lea * ri(22, 27), beta: 0 },
  V1a: { name: '평균 상한 + 평균 징병 (평균×22~27), β=0', cap: s => avg(s) * 100, draft: s => avg(s) * ri(22, 27), beta: 0 },
  V1: { name: '평균 상한 + 새 징병 ((평균+통솔)×12~14), β=0', cap: s => avg(s) * 100, draft: s => (avg(s) + s.lea) * ri(12, 14), beta: 0 },
  V2: { name: 'V1 + 받는 피해 감소 β=0.0015', cap: s => avg(s) * 100, draft: s => (avg(s) + s.lea) * ri(12, 14), beta: 0.0015 },
  V3: { name: 'V1 + 받는 피해 감소 β=0.0020', cap: s => avg(s) * 100, draft: s => (avg(s) + s.lea) * ri(12, 14), beta: 0.002 },
};
const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const avg = s => (s.lea + s.war + s.int) / 3;

const BUILDS = {
  early: { label: '초기 (총합 170)', b: { 통무: [70, 70, 30], 통지: [70, 30, 70], 무지: [30, 70, 70], 올라: [57, 57, 56] } },
  late: { label: '후반 (총합 300 동일)', b: { 통무: [120, 120, 60], 통지: [120, 60, 120], 무지: [60, 120, 120], 올라: [100, 100, 100] } },
  // 초기 빌드에 같은 총 경험치 18,000을 줬을 때: 특화형은 주력 둘에 몰아주고 올라운더는 셋에 고르게 (expNeed = 35 + 능력치 × 1.45, 시즌 8)
  late_exp: { label: '후반 (같은 경험치 18,000)', b: { 통무: [120, 120, 30], 통지: [120, 30, 120], 무지: [30, 120, 120], 올라: [97, 97, 97] } },
};
const UNIT_STAT = { 보병: 'lea', 기병: 'war', 궁병: 'int' };
// 각 빌드가 쓸 만한 병종: 가장 높은 능력치의 병종들 (동점이면 모두 후보, 상대 조합은 고르게 평균)
const unitsOf = s => { const m = Math.max(s.lea, s.war, s.int); return Object.keys(UNIT_STAT).filter(u => s[UNIT_STAT[u]] === m); };
const statsOf = a => ({ lea: a[0], war: a[1], int: a[2] });
const mk = (name, s, type, troops) => ({ name, stats: s, type, troops, faction: null, trait: null, siege: {} });

// 1) 한 번의 야전 (둘 다 상한 가득): 손실교환비 = 상대 손실 / 내 손실
function oneBattle(V, A, B, n) {
  let aLost = 0, bLost = 0, aWin = 0;
  for (const ua of unitsOf(A)) for (const ub of unitsOf(B)) for (let i = 0; i < n; i++) {
    const a = mk('A', A, ua, Math.round(V.cap(A))), b = mk('B', B, ub, Math.round(V.cap(B)));
    const r = fightRounds(a, b, 0, 5, true);
    aLost += r.atkLost; bLost += r.defLost;
    if (a.troops / V.cap(A) > b.troops / V.cap(B)) aWin++;
  }
  return { ratio: bLost / Math.max(1, aLost) };
}

// 2) 소모전 T턴: 매 턴 병력이 상한의 80% 이상이면 출진, 아니면 징병.
//    둘 다 출진 → 야전. 한쪽만 출진 → 상대 성 공격(방어도 0, 상대는 남은 병력으로 수비). 처치 수 합계를 비교
function attrition(V, A, B, T, n) {
  let aKill = 0, bKill = 0;
  for (const ua of unitsOf(A)) for (const ub of unitsOf(B)) for (let i = 0; i < n; i++) {
    let at = 0, bt = 0;
    const capA = Math.round(V.cap(A)), capB = Math.round(V.cap(B));
    for (let t = 0; t < T; t++) {
      const aGo = at >= capA * 0.8, bGo = bt >= capB * 0.8;
      if (!aGo) at = Math.min(capA, at + Math.floor(V.draft(A)));
      if (!bGo) bt = Math.min(capB, bt + Math.floor(V.draft(B)));
      if (aGo || bGo) {
        let atk, def, field = false;
        if (aGo && bGo) { atk = mk('A', A, ua, at); def = mk('B', B, ub, bt); field = true; }
        else if (aGo) { atk = mk('A', A, ua, at); def = mk('B', B, ub, bt); }
        else { atk = mk('B', B, ub, bt); def = mk('A', A, ua, at); }
        if (def.troops <= 0) continue;
        const r = fightRounds(atk, def, 0, 5, field);
        if (atk.name === 'A') { at = atk.troops; bt = def.troops; aKill += r.defLost; bKill += r.atkLost; }
        else { bt = atk.troops; at = def.troops; bKill += r.defLost; aKill += r.atkLost; }
      }
    }
  }
  return { ratio: aKill / Math.max(1, bKill) };
}

const fmt = x => x.toFixed(2);
const N1 = 3000, N2 = 300, T = 40; // 야전 반복 수 · 소모전 반복 수 · 소모전 턴 수
for (const [stage, { label, b: builds }] of Object.entries(BUILDS)) {
  if (ONLY_STAGE && ONLY_STAGE !== stage) continue;
  console.log(`\n==================== ${label} ====================`);
  const names = Object.keys(builds);
  for (const [vk, V] of Object.entries(VARIANTS)) {
    if (ONLY_VARIANTS && !ONLY_VARIANTS.includes(vk)) continue;
    setBeta(V.beta);
    console.log(`\n[${vk}] ${V.name}`);
    console.log('  빌드   상한   징병1회  채우는턴 | 야전 교환비 vs ' + names.join('/') + ' | 소모전 처치비 vs ' + names.join('/') + ' | 평균(야전/소모)');
    for (const a of names) {
      const A = statsOf(builds[a]);
      const cap = V.cap(A), dr = (() => { let s = 0; for (let i = 0; i < 2000; i++) s += V.draft(A); return s / 2000; })();
      const ob = [], at = [];
      for (const b of names) { const B = statsOf(builds[b]); ob.push(oneBattle(V, A, B, N1).ratio); at.push(attrition(V, A, B, T, N2).ratio); }
      const others = names.map((b, i) => i).filter(i => names[i] !== a);
      const g = arr => Math.exp(others.reduce((s, i) => s + Math.log(arr[i]), 0) / others.length);
      console.log(`  ${a}  ${String(Math.round(cap)).padStart(6)}  ${String(Math.round(dr)).padStart(6)}  ${(cap / dr).toFixed(1).padStart(5)} | ${ob.map(fmt).join(' ')} | ${at.map(fmt).join(' ')} | ${fmt(g(ob))} / ${fmt(g(at))}`);
    }
  }
}
