'use strict';

// ===== 게임 규칙과 숫자 =====
// 나중에 서버로 옮길 부분이다. 화면 그리는 코드는 여기 넣지 않는다.
// "임시"라고 적힌 숫자는 기획서에 아직 [미정]인 것을 가장 단순하게 정해 둔 값이다.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const RULES = {
  // 기능 스위치 (기획서 2장 "1024 개편"): false면 버튼과 효과가 꺼진다. 코드는 남겨 두어 나중에 다시 켤 수 있다
  features: {
    tech: false,      // 기술 내정
    siege: false,     // 병기 (기술이 있어야 만들 수 있음)
    spy: false,       // 첩보 (끄면 적 성 정보가 처음부터 보임)
    drill: false,     // 훈련 (끄면 훈련도에 따른 전투력 차이도 없음)
    explore: true,    // 탐색 (2026-10-25 다시 켬)
    shop: true,       // 상점: 명검·서적·명마를 여러 번 살 수 있고, 살 때마다 비싸진다
  },
  // 턴 (기획서 6장): 모든 장수가 같은 정각에 예약한 명령 하나씩을 실행한다
  // 한 턴의 길이 (2026-10-25): 낮 5분, 밤(한국 시간 1~7시) 15분. 두 값 모두 60분을 나눠떨어지게 한다 (정각에 맞물리도록)
  turnLength: 5 * MIN,
  night: { from: 1, to: 7, turnLength: 15 * MIN },
  queueSize: 24,            // 몇 턴 앞까지 예약할 수 있는지 (밤 1시에 채우면 아침 7시까지)
  logMax: 40,               // 장수마다 남기는 기록 줄 수 (2026-10-25 80에서 줄임: 세계가 작을수록 서버가 빠르다)
  moveRange: 2,             // 이동 한 번에 갈 수 있는 거리: 우리 땅만 밟고 2칸까지 (2026-10-25, 끝에서 끝 순간이동 막기)

  // 능력치 (기획서 7장 확정값)
  statMax: 120,
  startBonus: 10,           // 만들 때만 받는 보너스 포인트
  // 성장 (기획서 7장): 능력치마다 경험치가 쌓이고, 다 차면 그 능력치 +1 (임시값)
  // 내정 1회 · 징병 1회(통솔) · 출진 1회(병종 능력치, 승패 상관없이) · 성 점령(통솔) · 수련 1회(무작위)
  statExp: { domestic: 25, draft: 10, battle: 30, capture: 30, train: { min: 40, max: 60 } },
  expNeedBase: 50,          // 능력치 1을 올리는 데 필요한 경험치 = 50 + 지금 능력치 (50이면 100, 100이면 150)

  // 금은 장수 개인 것 하나뿐이다. 국고는 없다 (기획서 9장). 내정은 턴만 쓴다
  myGoldCost: { draft: 200, train: 30, explore: 20, spy: 30 }, // 임시: 내 금에서 나가는 금
  shopPrice: { base: 100, step: 100 }, // 임시: 상점 가격 = 100 + 100 × 그 물건을 이미 산 수 (100, 200, 300 …, 장수마다 따로)
  // 군량 사기: 시세 = 금 1당 군량 몇. 매달 -1/0/+1 중 하나로 바뀌고 4~8 사이를 오간다. 예약할 때 얼마어치(금) 살지 고른다
  foodBuy: { start: 6, min: 4, max: 8, choices: [100, 200, 500, 1000] },
  battleReward: 500,        // 임시: 전투에 이기면 들어오는 금 (명령으로 금을 더 얻는 길. 기획서 [미정])
  // 공적: 수련을 뺀 모든 명령에 붙는다. 순위를 매기는 점수 (임시값)
  merit: { domestic: 10, draft: 10, buy: 10, explore: 10, move: 5, plot: 10, win: 50, lose: 10 },
  // 첩보: 엿본 정보가 유효한 시간 (임시값)
  spyValid: 3 * HOUR,
  startGold: 500,           // 임시: 장수를 만들 때 가진 금
  playerGoldMax: 10000,     // 임시: 장수 한 명이 가질 수 있는 금
  // 내정 최대치: 성 규모(1 소성, 2 중성, 3 대도시)마다 다르다. 기술은 꺼져 있어 옛 값(규모 × 300) 그대로
  devMax: {
    agri: { 1: 400, 2: 600, 3: 800 }, // 2026-10-25 300/500/700에서 올림
    comm: { 1: 400, 2: 600, 3: 800 },
    tech: { 1: 300, 2: 600, 3: 900 },
    wall: { 1: 500, 2: 700, 3: 1000 }, // 2026-10-25 500/700/900에서 바꿈 (대도시만 올림)
    peace: { 1: 100, 2: 100, 3: 100 },
  },
  // 내정 1회로 오르는 양 = 쓰는 능력치 × 무작위 비율 (농업·상업·축성 0.2~0.4, 치안 0.15~0.2)
  domesticRate: { agri: [0.3, 0.4], comm: [0.3, 0.4], tech: [0.2, 0.4], wall: [0.3, 0.4], peace: [0.15, 0.2] },
  peaceStart: 80,           // 치안 처음 값 (모든 성)
  // 치안 구간 (기획서 9장): 50 이상은 그대로, 20~49는 수입·징병 10% 줄고, 20 미만은 수입 75%에 징병 불가
  peaceOk: 50, peaceLow: 20,
  draftPerLea: { min: 15, max: 25 }, // 징병 1회 = 통솔 × 15~25명 (무작위. 2026-10-25 15~20에서 올림)
  draftPerMerit: 0.1,       // 징병에 공적 × 0.1명이 더 모인다 (2026-10-25)
  draftPeacePer: 250,       // 징병하면 그 성의 치안이 모은 병사 250명당 1 떨어진다 (2026-10-25 200에서 바꿈)
  troopsPerLea: 100,        // 장수 한 명의 최대 병력 = 통솔 × 100

  // 군량은 성마다 따로 쌓인다. 상한은 성 규모(1 소성, 2 중성, 3 대도시)마다 다르다 (임시값)
  foodMax: { 1: 10000, 2: 15000, 3: 25000 }, // 성 크기별 군량 최대치 (2026-10-25 5000/15000/30000에서 바꿈)

  // 달력: 1턴 = 게임 속 1달 (기획서 6장)
  startYear: 190, startMonth: 1,
  goldMonths: [1, 4, 7, 10], // 금 수입이 들어오는 달
  harvestMonths: [4, 10],   // 군량 수확이 들어오는 달 (먹는 것은 매달)
  // 수입 (임시값)
  goldPerComm: 1,           // 임시: 금 수입 = 장수가 있는 성의 상업 × 1 × (1 + 공적 × meritIncome) (× 치안 보정)
  meritIncome: 0.0002,      // 공적 보너스: 공적 100마다 수입 2% 더 (1,000이면 20%. 2026-10-25 0.0001에서 올림)
  foodPerAgri: 3.5,         // 임시: 수확 군량 = 그 성의 농업 × 3.5 (× 치안 보정, 2026-10-25 3에서 올림)
  foodPerTroops: 0.02,      // 매달 병사 100명이 군량 2를 먹는다 (장수가 머무는 성의 군량. 2026-10-25 1에서 2배로)
  starveLoss: 0.05,         // 임시: 군량이 모자라면 그달 병력 5%가 흩어진다

  // 전쟁 (임시값)
  marchFoodRate: 0.05,      // 출진하면 병력 × 0.05만큼 떠나는 성의 군량을 바로 쓴다 (전투 결과와 상관없이 사라짐)
  captureKeep: { min: 0.5, max: 0.7 }, // 성을 점령하면 그 성 군량의 50~70%(무작위)만 남는다 (나머지는 흩어짐)
  guardPerGrade: 1000,      // 수비대장 병력 = 성 규모 × 1,000
  guardStat: 50,            // 수비대장 능력치
  // 5합 전투 (기획서 8장): 출진 1회에 최대 5합. 한 합에 양쪽이 동시에 상대 병력을 "내 전투력 × 20%"만큼 줄인다
  roundsMax: 5,
  roundRate: 0.2,           // 임시: 비슷하면 5합 뒤에도 양쪽이 남고, 2~3배 차이면 2~3합에 끝난다
  // 병력 곡선: 병력이 많을수록 전투력이 덜 늘어난다. 실효 병력 = 5,000 × (병력 ÷ 5,000)^exp (exp 1이면 정비례)
  troopCurve: { ref: 5000, exp: 0.75 },
  battleRandom: 0.05,       // 합마다 전투력에 ±5% 무작위
  wallDivisor: 10000 / 3,   // 수비 보정 = 1 + 방어 × 0.0003 (방어 100마다 +3%, 방어 900이면 1.27배). 예전엔 100마다 +5%였다
  captureCut: 0.2,          // 임시: 함락된 성의 농업·상업·치안이 20% 깎인다 (방어는 아래 captureWall로 다시 세운다)
  // 성벽 공격 (기획서 7장): 지키는 부대가 없거나 모두 쓰러뜨리면, 남은 병력의 3~5%만큼 성의 방어를 깎고, 깎은 양의 3배(siegeLoss)만큼 병력을 잃는다.
  // 방어가 0이 되어야 점령. 점령하면 방어를 성 크기만큼 다시 세운다
  siegeRate: { min: 0.03, max: 0.05 },
  siegeLoss: 3,             // 성벽 공격에서 잃는 병력 = 깎은 방어 × 3
  captureWall: { 1: 100, 2: 200, 3: 300 },
  // 일기토 (무력): 양쪽 무력이 70 이상이면 합마다 낮은 확률로 벌어진다 (임시값)
  duel: { minWar: 70, chance: 0.1, loserLoss: 0.3, exp: 40 },

  // 병종과 훈련 (기획서 8장)
  matchup: 0.2,             // 상성: 이기는 병종 +20% (지는 병종 감점은 없음)
  trainingFloor: 0.7,       // 임시: 훈련도 0이면 전투력 70%, 100이면 100%
  guardUnit: { type: '보병', training: 50 },  // 임시: 수비대장의 병종과 훈련도

  npcOnly: [],              // 플레이어가 고를 수 없는 세력 이름 (지금은 없음. 동탁 NPC는 보류)
  rejoinWait: 10,           // 하야한 세력에 다시 들어가려면 기다려야 하는 턴 수
};

// 능력치 3종. 표기 순서는 통/무/지
const STATS = [
  { key: 'lea', name: '통솔' },
  { key: 'war', name: '무력' },
  { key: 'int', name: '지력' },
];

// 장수 생성: 170포인트를 주사위로 통/무/지에 나눈다. 한 항목은 30~70 (기획서 7장)
const ROLL = { total: 170, min: 30, max: 70 };
function rollStats() {
  for (;;) {
    const lea = randInt(ROLL.min, ROLL.max), war = randInt(ROLL.min, ROLL.max);
    const int = ROLL.total - lea - war;
    if (int >= ROLL.min && int <= ROLL.max) return { lea, war, int };
  }
}

// 내정 4종과 쓰는 능력치 (기획서 9장 확정값)
// name: 명령 이름, label: 성의 수치 이름 (축성 명령으로 올리는 수치는 '방어')
const DOMESTIC = {
  agri: { name: '농업', label: '농업', stat: 'int' },
  comm: { name: '상업', label: '상업', stat: 'int' },
  tech: { name: '기술', label: '기술', stat: 'int' },
  wall: { name: '축성', label: '방어', stat: 'war' },
  peace: { name: '치안', label: '치안', stat: 'lea' },
};

// ===== 계산 =====

// 성의 처음 상태 (임시값: 규모에 비례). guard는 수비대장의 병력
function newCityState(grade) {
  return {
    agri: 100 * grade, comm: 100 * grade, tech: 50 * grade, wall: 100 * grade + 100, // 방어만 100 더 높게 시작
    peace: RULES.peaceStart,
    food: 1000 * grade,
    guard: RULES.guardPerGrade * grade,
  };
}

const devMax = (grade, key) => RULES.devMax[key][grade];
const foodMax = grade => RULES.foodMax[grade];

// 치안 보정: 금·군량 수입에 곱한다
const peaceIncome = v => (v >= RULES.peaceOk ? 1 : v >= RULES.peaceLow ? 0.9 : 0.75);
// 치안 보정: 징병으로 모이는 병력에 곱한다. 0이면 징병할 수 없다
const peaceDraft = v => (v >= RULES.peaceOk ? 1 : v >= RULES.peaceLow ? 0.85 : 0); // 치안 불안이면 15% 덜 모인다

// 내정 1회로 오르는 양: 쓰는 능력치 × 무작위 비율 (RULES.domesticRate)
const domesticGain = (key, stat) => {
  const [lo, hi] = RULES.domesticRate[key] || RULES.domesticRate.agri;
  return Math.max(1, Math.floor(stat * (lo + Math.random() * (hi - lo))));
};
// 징병 1회로 늘어나는 병력: 통솔 × 10~20 (무작위)
// 징병 1회 = 통솔 × 15~25 (무작위) + 공적 × 0.1
const draftGain = (lea, merit = 0) => lea * randInt(RULES.draftPerLea.min, RULES.draftPerLea.max) + Math.floor(merit * RULES.draftPerMerit);
// 출진에 필요한 군량
const marchFood = troops => Math.ceil(troops * RULES.marchFoodRate);
// 장수 한 명이 거느릴 수 있는 최대 병력 (통솔)
const troopsMax = g => effStats(g).lea * RULES.troopsPerLea;
// 함락된 성은 농업·상업·치안이 조금 깎인다. 깎인 양을 돌려준다 (방어는 성벽 공격으로 이미 0)
function captureDamage(cs) {
  const out = {};
  for (const k of ['agri', 'comm', 'peace']) {
    out[k] = Math.floor(cs[k] * RULES.captureCut);
    cs[k] -= out[k];
  }
  return out;
}

// 다음 턴 시각 (모든 장수의 예약 명령이 이때 실행된다)
// 시각 t에 쓰는 턴 길이: 한국 시간 밤(0~6시)이면 밤 턴, 아니면 낮 턴
function turnLengthAt(t) {
  const h = new Date(t + 9 * HOUR).getUTCHours();
  return h >= RULES.night.from && h < RULES.night.to ? RULES.night.turnLength : RULES.turnLength;
}
// 길이가 60분을 나눠떨어지므로 낮↔밤이 바뀌는 정각을 건너뛰지 않는다
const turnStart = t => Math.floor(t / turnLengthAt(t)) * turnLengthAt(t); // t가 속한 턴이 시작한 시각
const nextTurn = t => turnStart(t) + turnLengthAt(t);
// 지금부터 i+1번째 턴 시각 (i = 0이면 다음 턴)
function turnAfter(t, i) {
  let x = nextTurn(t);
  while (i-- > 0) x = nextTurn(x);
  return x;
}

// 금 수입(1·4·7·10월): 장수가 있는 성의 상업에 따라 정해진다
// 장수의 금 수입: 있는 성의 상업에 공적 보너스와 치안 보정을 곱한다
const goldIncome = (cs, merit = 0) => Math.floor(cs.comm * RULES.goldPerComm * (1 + merit * RULES.meritIncome) * peaceIncome(cs.peace));
// 수확(4·10월): 그 성의 농업에 따라 군량이 들어온다 (상한까지만)
function harvestFood(cs, grade) {
  cs.food = Math.min(foodMax(grade), cs.food + Math.floor(cs.agri * RULES.foodPerAgri * peaceIncome(cs.peace)));
}
// 게임 속 날짜: n번째 턴이 몇 년 몇 월인지
function dateOf(turn) {
  const m = RULES.startMonth - 1 + turn;
  return { year: RULES.startYear + Math.floor(m / 12), month: (m % 12) + 1 };
}
const dateText = turn => { const d = dateOf(turn); return `${d.year}년 ${d.month}월`; };

// 매달 장수의 병사가 군량을 먹는다. 모자라면 병력이 흩어진다. 굶었으면 true
function feedTroops(g, cs) {
  const need = Math.ceil(g.troops * RULES.foodPerTroops * (1 + (traitOf(g.faction).food || 0))); // 장로: 덜 먹는다
  if (cs.food >= need) { cs.food -= need; return false; }
  cs.food = 0;
  g.troops = Math.floor(g.troops * (1 - RULES.starveLoss));
  return true;
}

// ===== 병종 =====
// 기병 → 보병 → 궁병 → 기병 순으로 이긴다. 병종마다 전투력에 쓰는 능력치가 다르다
const UNIT_TYPES = {
  보병: { stat: 'lea', beats: '궁병' },
  기병: { stat: 'war', beats: '보병' },
  궁병: { stat: 'int', beats: '기병' },
};

// ===== 세력 특성 (기획서 "세력 특성"): 역사에 근거한 작은 패시브. 세력 이름으로 찾는다 =====
// 숫자는 비율 (0.05 = 5%). 효과가 붙는 곳은 engine.js·아래 전투 공식에서 traitOf(세력id)로 읽는다
const FACTION_TRAITS = {
  마등: { name: '서량기병', desc: '기병 전투력 +5%', cavalry: 0.05 },
  공손찬: { name: '백마의종', desc: '기병으로 수비할 때 전투력 +10%', cavalryDefense: 0.10 },
  조조: { name: '유재시거', desc: '모든 능력치 경험치 +10%', exp: 0.10 },
  원소: { name: '사세삼공', desc: '금 수입 +5%', gold: 0.05 },
  유비: { name: '인덕', desc: '징병으로 떨어지는 치안 -30%', draftPeace: -0.30 },
  손견: { name: '강동의 호랑이', desc: '출진 공격 전투력 +5%', attack: 0.05 },
  동탁: { name: '서량 대군', desc: '징병 +5% 더 모임', draft: 0.05 },
  원술: { name: '옥새', desc: '상점 값 -10%', shop: -0.10 },
  유표: { name: '형주 학풍', desc: '지력 경험치 +15%', expInt: 0.15 },
  유언: { name: '익주 천험', desc: '수비 전투력 +5%', defense: 0.05 },
  도겸: { name: '서주의 풍요', desc: '상업 내정 +5%', comm: 0.05 },
  장로: { name: '오두미도', desc: '병사 군량 소비 -15%', food: -0.15 },
  엄백호: { name: '강동 호족', desc: '성벽 공격으로 깎는 방어 +15%', siege: 0.15 },
  왕랑: { name: '경학대가', desc: '수련에 금이 들지 않음', freeTrain: true },
};

// ===== 전투 =====
// 부대 하나: { name, troops, stats, type(병종), training(훈련도 0~100) }
// 부대 전투력 = 병력 × (0.4 + 병종 능력치 ÷ 100) × 훈련 보정 (2026-10-25 0.5에서 낮춤: 주고받는 피해를 조금 줄임)
function unitPower(u) {
  const stat = u.stats[UNIT_TYPES[u.type].stat];
  const drill = !RULES.features.drill ? 1 : RULES.trainingFloor + (1 - RULES.trainingFloor) * (u.training || 0) / 100;
  const c = RULES.troopCurve, eff = u.troops > 0 ? c.ref * Math.pow(u.troops / c.ref, c.exp) : 0; // 병력 곡선
  return eff * (0.4 + stat / 100) * drill;
}
// 상성 보정: a가 b에게 강하면 1.2. 약할 때 깎는 것은 없다 (너무 세서 뺐다)
function matchupOf(a, b) {
  if (UNIT_TYPES[a.type].beats === b.type) return 1 + RULES.matchup;
  return 1;
}
// 공격력: 정란이 있으면 더 세다
// 세력 특성: 기병(마등), 출진 공격(손견)
const attackPower = (a, d) => {
  const t = traitOf(a.faction);
  return unitPower(a) * (d ? matchupOf(a, d) : 1) * (a.siege && a.siege.정란 ? 1 + SIEGE_EFFECT.towerAttack : 1)
    * (1 + (t.attack || 0)) * (a.type === '기병' ? 1 + (t.cavalry || 0) : 1);
};
// 수비력: 성 방어 보정을 받는다. 공격자가 충차를 가졌으면 그 보정을 덜 받는다
// 세력 특성: 기병(마등·공손찬 수비), 수비 전투력(유언)
const defensePower = (d, wall, a) => {
  const t = traitOf(d.faction), w = a && a.siege && a.siege.충차 ? wall * SIEGE_EFFECT.ramWall : wall;
  return unitPower(d) * (a ? matchupOf(d, a) : 1) * (1 + w / RULES.wallDivisor) * (1 + (t.defense || 0))
    * (d.type === '기병' ? (1 + (t.cavalry || 0)) * (1 + (t.cavalryDefense || 0)) : 1);
};

// 훈련: 한 번에 오르는 훈련도 (임시: 통솔 10마다 1씩 더)
const drillGain = lea => 5 + Math.floor(lea / 10);
// 징병으로 새 병사(훈련도 0)가 섞이면 훈련도 평균이 내려간다
const dilutedTraining = (training, oldTroops, added) => (oldTroops + added ? Math.floor(training * oldTroops / (oldTroops + added)) : 0);

// 일기토: 무력 높은 쪽이 이길 확률이 높다 (50% + 무력 차이 × 1%, 10~90%)
const duelWinRate = (myWar, theirWar) => Math.min(0.9, Math.max(0.1, 0.5 + (myWar - theirWar) / 100));

// 공격 부대 하나와 수비 부대 하나가 남은 합 수(left)만큼 맞붙는다. 한쪽이 전멸하면 멈춘다.
// 병력을 직접 줄이고 { used(쓴 합 수), lines(합마다 한 줄), atkLost, defLost }를 돌려준다
function fightRounds(att, def, wall, left) {
  const luck = () => 1 + (Math.random() * 2 - 1) * RULES.battleRandom;
  const a0 = att.troops, d0 = def.troops, lines = [];
  let used = 0;
  while (used < left && att.troops > 0 && def.troops > 0) {
    used++;
    // 일기토: 양쪽 무력이 기준 이상이면 낮은 확률로. 이긴 쪽은 피해 없이, 진 쪽 부대만 크게 다친다
    const D = RULES.duel;
    if (att.stats.war >= D.minWar && def.stats.war >= D.minWar && Math.random() < D.chance) {
      const aWin = Math.random() < duelWinRate(att.stats.war, def.stats.war);
      const w = aWin ? att : def, l = aWin ? def : att;
      const loss = Math.ceil(l.troops * D.loserLoss);
      l.troops -= loss;
      w.duelWins = (w.duelWins || 0) + 1;
      lines.push(`${used}합: ⚡ 일기토! ${w.name}(무력 ${w.stats.war}) 대 ${l.name}(무력 ${l.stats.war}) → ${w.name} 승리! ${l.name} 부대 -${loss.toLocaleString('ko-KR')}`);
      continue;
    }
    // 보통 합: 양쪽이 동시에 상대 병력을 줄인다
    const hitDef = Math.ceil(attackPower(att, def) * RULES.roundRate * luck());
    const hitAtt = Math.ceil(defensePower(def, wall, att) * RULES.roundRate * luck());
    const dLoss = Math.min(def.troops, hitDef), aLoss = Math.min(att.troops, hitAtt);
    def.troops -= dLoss;
    att.troops -= aLoss;
    lines.push(`${used}합: ${att.name} -${aLoss.toLocaleString('ko-KR')} · ${def.name} -${dLoss.toLocaleString('ko-KR')}`);
  }
  return { used, lines, atkLost: a0 - att.troops, defLost: d0 - def.troops };
}

// ===== 계략 (지력) =====
// 이웃한 다른 세력 성에 쓴다. 지력이 높을수록 잘 되고, 성공하면 낮은 확률로 대성공(효과 2배) (임시값)
const PLOT = {
  successRate: int => Math.min(0.85, int / 150),
  critRate: int => int / 400,          // 성공했을 때 그중 대성공 확률
  destroy: { wallPerInt: 1 },          // 파괴: 방어 -(지력 × 1)
  rumor: { peacePerInt: 0.25, devPerInt: 0.25 }, // 유언: 치안·농업·상업 각각 -(지력 × 0.25) (2026-10-25 0.2에서 올림)
  exp: 30, critExp: 50,                // 성공하면 지력 경험치 (대성공이면 50)
};
// 'fail' | 'ok' | 'crit'
function rollPlot(int) {
  if (Math.random() >= PLOT.successRate(int)) return 'fail';
  return Math.random() < PLOT.critRate(int) ? 'crit' : 'ok';
}

// ===== 탐색 (임시값) =====
// weight: 일어날 확률(%) — 합계 100
// 탐색 사건 (확률 = weight%, 합 100). 2026-10-25 기획자 수치
const EXPLORE = [
  { key: 'none', weight: 15 },
  // jackpot: 발견했을 때 그중 이 확률로 대박
  { key: 'gold', weight: 30, min: 100, max: 250, jackpot: { rate: 0.2, min: 500, max: 700 } },
  { key: 'food', weight: 20, min: 500, max: 700, jackpot: { rate: 0.2, min: 1000, max: 1500 } },
  { key: 'troops', weight: 15, min: 500, max: 1500 }, // 의병 합류 (지금 병종으로, 병사가 없으면 보병)
  { key: 'item', weight: 10 },                         // 능력치 하나 +1
  { key: 'bandit', weight: 10, minRate: 0.05, maxRate: 0.10, goldMinRate: 0.15, goldMaxRate: 0.20 }, // 병력 5~10% 또는 금 15~20%
];

// 아이템: 발견하면 해당 능력치 +1
const ITEMS = [
  { name: '병법서', stat: 'lea' },
  { name: '보검', stat: 'war' }, // 상점의 명검과 헷갈리지 않게
  { name: '고서', stat: 'int' },
];

const randInt = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

// 탐색 사건 하나를 뽑는다
function rollExplore() {
  let r = Math.random() * EXPLORE.reduce((s, e) => s + e.weight, 0);
  for (const e of EXPLORE) { r -= e.weight; if (r < 0) return e; }
  return EXPLORE[0];
}

// 금·군량 발견량. 낮은 확률로 대박. { amount, jackpot }
function foundAmount(e) {
  if (e.jackpot && Math.random() < e.jackpot.rate) return { amount: randInt(e.jackpot.min, e.jackpot.max), jackpot: true };
  return { amount: randInt(e.min, e.max), jackpot: false };
}

// 능력치 1을 올리는 데 필요한 경험치: 능력치가 높을수록 조금씩 더 필요하다
const expNeed = stat => RULES.expNeedBase + stat;

// 능력치 경험치를 쌓는다. 다 차면 그 능력치 +1 (최대치까지). 오른 양을 돌려준다
function addStatExp(g, key, gain) {
  g.statExp = g.statExp || {};
  let exp = (g.statExp[key] || 0) + gain, up = 0;
  while (g.stats[key] < RULES.statMax && exp >= expNeed(g.stats[key])) {
    exp -= expNeed(g.stats[key]);
    g.stats[key]++;
    up++;
  }
  g.statExp[key] = g.stats[key] >= RULES.statMax ? 0 : exp;
  return up;
}

// ===== 병기 (기획서 9장) =====
// 내 장수가 있는 성의 기술이 기준을 넘으면 생산할 수 있다. 내 금을 쓴다. 종류마다 하나씩만 가질 수 있다
const SIEGE = {
  충차: { tech: 300, price: 300, desc: '공격할 때 성 방어의 영향을 덜 받음' },
  정란: { tech: 500, price: 500, desc: '공격력 상승' },
  벽력거: { tech: 800, price: 800, desc: '공격으로 없앤 적의 일부만큼, 그 성에서 싸우지 않은 모든 부대에 피해' },
};
// 병기 효과 (임시값)
const SIEGE_EFFECT = {
  ramWall: 0.5,     // 충차: 성 방어 보정을 절반만 받는다
  towerAttack: 0.2, // 정란: 공격력 +20%
  splash: 0.1,      // 벽력거: 없앤 적 병력의 10%만큼 그 성의 다른 부대마다 피해 (5,000을 없애면 각각 500)
};

// ===== 상점 (기획서 9장) =====
// 내 금으로 산다. 하나씩만 가질 수 있고, 가지고 있는 동안 능력치가 오른다 (임시값)
// 상점 물건: 하나 살 때마다 그 능력치 +bonus (여러 번 살 수 있다). gear[이름] = 산 수
const SHOP = {
  명마: { stat: 'lea', bonus: 1 },
  명검: { stat: 'war', bonus: 1 },
  서적: { stat: 'int', bonus: 1 },
};
const gearCount = (g, name) => Number((g.gear || {})[name]) || 0; // 예전 저장의 true는 1개
const shopPrice = (g, name) => Math.round((RULES.shopPrice.base + RULES.shopPrice.step * gearCount(g, name)) * (1 + (traitOf(g.faction).shop || 0))); // 원술 할인

// 장수의 실제 능력치: 기본 능력치 + 가진 상점 물건 (최대치 120을 넘지 않는다)
function effStats(g) {
  const s = { ...g.stats };
  for (const [name, it] of Object.entries(SHOP)) s[it.stat] = Math.min(RULES.statMax, s[it.stat] + it.bonus * gearCount(g, name));
  return s;
}
