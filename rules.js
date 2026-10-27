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
    siege: true,      // 병기: 충차·정란·벽력거를 금으로 만든다 (2026-10-26 다시 켬, 기술 조건 없음)
    spy: true,        // 첩보: 다른 세력 성의 농업·상업·방어·치안을 엿본다 (2026-10-26 다시 켬, 계략)
    drill: false,     // 훈련 (끄면 훈련도에 따른 전투력 차이도 없음)
    explore: true,    // 탐색 (2026-10-25 다시 켬)
    shop: true,       // 상점: 명검·서적·명마를 여러 번 살 수 있고, 살 때마다 비싸진다
  },
  // 턴 (기획서 6장): 모든 장수가 같은 정각에 예약한 명령 하나씩을 실행한다
  // 한 턴의 길이 (2026-10-25): 낮 5분, 밤(한국 시간 1~7시) 15분. 두 값 모두 60분을 나눠떨어지게 한다 (정각에 맞물리도록)
  turnLength: 5 * MIN,
  night: { from: 1, to: 7, turnLength: 15 * MIN },
  queueSize: 24,            // 몇 턴 앞까지 예약할 수 있는지 (밤 1시에 채우면 아침 7시까지)
  logMax: 30,               // 장수마다 남기는 기록 줄 수 (gen_logs 표에 따로 둔다. 2026-10-25 80 → 40 → 20, 2026-10-26 기록을 떼어 낸 뒤 30)
  moveRange: 2,             // 이동 한 번에 갈 수 있는 거리: 우리 땅만 밟고 2칸까지 (2026-10-25, 끝에서 끝 순간이동 막기)
  defenseMax: 5,            // 한 성에서 방어 모드를 켤 수 있는 장수 수. 수비 장수가 전멸하면 방어를 끈 장수 중 병력 많은 장수가 자동으로 켜진다 (2026-10-25)
  recreateWait: 10,         // 장수를 지운 뒤 새 장수를 만들 수 있을 때까지 기다리는 턴 수 (2026-10-26 6, 2026-10-27 금낭 특성 다시 뽑기 남용을 막으려고 10)

  // 능력치 (기획서 7장 확정값)
  statMax: 120,
  startBonus: 10,           // 만들 때만 받는 보너스 포인트
  // 성장 (기획서 7장): 능력치마다 경험치가 쌓이고, 다 차면 그 능력치 +1 (임시값)
  // 내정 1회 · 징병 1회(통솔) · 출진 1회(병종 능력치, 승패 상관없이) · 성 점령(통솔) · 수련 1회(무작위)
  statExp: { domestic: 20, draft: 10, battle: 30, capture: 50, train: { min: 40, max: 60 } }, // 2026-10-27 내정 25 → 20, 점령 30 → 50
  expNeedBase: 40, expNeedPer: 1.2, // 능력치 1을 올리는 데 필요한 경험치 = 40 + 지금 능력치 × 1.2 (2026-10-27 50 + 능력치에서: 50에선 같고 높을수록 조금 더)

  // 금은 장수 개인 것 하나뿐이다. 국고는 없다 (기획서 9장). 내정은 턴만 쓴다
  myGoldCost: { draft: 200, train: 30, explore: 20, plot: 50, attack: 50 }, // 임시: 내 금에서 나가는 금 (plot = 계략 파괴·유언·첩보, 2026-10-26)
  shopPrice: { base: 100, step: 100 }, // 임시: 상점 가격 = 100 + 100 × 그 물건을 이미 산 수 (100, 200, 300 …, 장수마다 따로)
  // 군량 구매: 시세 = 금 1당 군량 몇. 매달 -1/0/+1 중 하나로 바뀌고 4~8 사이를 오간다. 예약할 때 얼마어치(금) 살지 고른다
  foodBuy: { start: 6, min: 4, max: 8, choices: [100, 200, 500, 1000], goldMax: 4000 }, // choices는 빠른 단추, 실제로는 금 1~goldMax 중 직접 입력 (2026-10-25)
  transportMax: 5000,       // 군량 수송 한 번에 옮길 수 있는 최대량 (플레이어가 1~5,000 사이에서 정한다)
  battleReward: 500,        // 임시: 전투에 이기면 들어오는 금 (명령으로 금을 더 얻는 길. 기획서 [미정])
  // 공적: 수련을 뺀 모든 명령에 붙는다. 순위를 매기는 점수 (임시값)
  merit: { domestic: 10, draft: 10, buy: 10, transport: 10, siege: 10, explore: 10, move: 5, plot: 10, win: 50, lose: 10 },
  meritPerKill: 200,        // 피해 공적: 전투에서 없앤 적 병력 200명당 공적 1 (공격·수비 모두, 2026-10-26)
  meritPerWall: 30,         // 성벽 공적: 성벽 공격으로 깎은 방어 30당 공적 1 (2026-10-26)
  isolatedLoss: 0.5,        // 고립된 성(이웃에 우리 성 없음)이 함락되면 그 성 장수는 가장 가까운 우리 성으로 가되 병력 50%를 잃는다 (2026-10-26)
  // 첩보: 엿본 정보가 유효한 시간 (임시값)
  spyTurns: 6, spyBase: 0.05, spyMax: 0.9, // 첩보: 성공하면 6턴 동안 보임, 성공 확률 = 지력 ÷ 100 + 5% (최대 90%)
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
  draftPeacePer: 300,       // 징병하면 그 성의 치안이 모은 병사 300명당 1 떨어진다 (2026-10-25 200 → 250, 2026-10-26 "치안이 너무 잘 깎인다" 의견으로 300)
  troopsPerLea: 100,        // 장수 한 명의 최대 병력 = 통솔 × 100

  // 군량은 성마다 따로 쌓인다. 상한은 성 규모(1 소성, 2 중성, 3 대도시)마다 다르다 (임시값)
  foodMax: { 1: 15000, 2: 20000, 3: 30000 }, // 성 크기별 군량 최대치 (2026-10-25 5000/15000/30000 → 10000/15000/25000, 2026-10-26 15000/20000/30000)
  foodStart: { 1: 1500, 2: 2000, 3: 3000 },  // 시즌을 시작할 때 성마다 있는 군량 (2026-10-26, 다음 시즌부터)

  // 달력: 1턴 = 게임 속 1달 (기획서 6장)
  scenario: '관도대전', // 지도 파일에 scenario가 없을 때만 쓰는 시나리오 이름. 보통은 지도 편집기의 "시나리오" 칸에서 정한다 (2026-10-27)
  startYear: 200, startMonth: 1, // 지도 파일에 year가 없을 때만 쓰는 시작 해. 보통은 지도 편집기의 "시나리오" 칸에서 정한다. 새 시즌을 열 때 세계에 S.startYear로 남긴다
  goldMonths: [1, 4, 7, 10], // 금 수입이 들어오는 달
  harvestMonths: [4, 10],   // 군량 수확이 들어오는 달 (먹는 것은 매달)
  // 수입 (임시값)
  goldPerComm: 1,           // 임시: 금 수입 = 장수가 있는 성의 상업 × 1 × (1 + 공적 × meritIncome) (× 치안 보정)
  meritIncome: 0.0002,      // 공적 보너스: 공적 100마다 수입 2% 더 (1,000이면 20%. 2026-10-25 0.0001에서 올림)
  foodPerAgri: 3.3,         // 임시: 수확 군량 = 그 성의 농업 × 3.3 (× 치안 보정. 2026-10-25 3 → 3.5, 2026-10-26 기본 500을 더한 만큼 3.3으로)
  foodBase: 500,            // 수확마다 성마다 기본으로 더 들어오는 군량: 수확 = (농업 × 3.3 + 500) × 치안 보정 (2026-10-25, 농업 낮은 성 보완)
  foodPerTroops: 0.02,      // 매달 병사 100명이 군량 2를 먹는다 (장수가 머무는 성의 군량. 2026-10-25 1에서 2배로)
  starveLoss: 0.05,         // 임시: 군량이 모자라면 그달 병력 5%가 흩어진다

  // 전쟁 (임시값)
  marchFoodRate: 0.08,      // 출진하면 병력 × 0.08만큼 떠나는 성의 군량을 바로 쓴다 (전투 결과와 상관없이 사라짐. 2026-10-26 수확이 늘어 0.05 → 0.07, 2026-10-27 0.08)
  captureKeep: { min: 0.5, max: 0.7 }, // 성을 점령하면 그 성 군량의 50~70%(무작위)만 남는다 (나머지는 흩어짐)
  guardTroops: { 1: 2000, 2: 3000, 3: 5000 }, // 수비대장 병력 (최대치, 시즌 시작 값). 2026-10-26 성 규모 × 1,000에서 올림 (초반 너무 빠른 확장 막기)
  guardRegen: 200,          // 수비대장이 매달 회복하는 병력 (최대치까지)
  guardStat: 60,            // 수비대장 능력치 (통솔·무력·지력 모두, 2026-10-26 50에서 올림)
  // 5합 전투 (기획서 8장): 출진 1회에 최대 5합. 한 합에 양쪽이 동시에 상대 병력을 "내 전투력 × 20%"만큼 줄인다
  roundsMax: 5,
  roundRate: 0.2,           // 임시: 비슷하면 5합 뒤에도 양쪽이 남고, 2~3배 차이면 2~3합에 끝난다
  // 병력 곡선: 병력이 많을수록 전투력이 덜 늘어난다. 실효 병력 = 5,000 × (병력 ÷ 5,000)^exp (exp 1이면 정비례)
  troopCurve: { ref: 5000, exp: 0.72 }, // 병력 곡선 지수 (2026-10-26 0.75 → 0.72: 큰 부대 우위를 조금 더 누름)
  battleRandom: 0.05,       // 합마다 전투력에 ±5% 무작위
  wallDivisor: 2500,        // 수비 보정 = 1 + 방어 × 0.0004 (방어 100마다 +4%, 방어 1,000이면 1.4배. 2026-10-26 병기가 생겨 3% → 5% → 4%)
  captureCut: 0.10,         // 함락된 성의 농업·상업·치안이 지금 값에서 10% 깎인다 (2026-10-26 20% → 15%, 2026-10-27 격전지가 너무 처참하다는 의견으로 10%. 방어는 아래 captureWall로 다시 세운다)
  // 성벽 공격 (기획서 7장): 지키는 부대가 없거나 모두 쓰러뜨리면, 남은 병력의 3~5%만큼 성의 방어를 깎고, 깎은 양의 3배(siegeLoss)만큼 병력을 잃는다.
  // 방어가 0이 되어야 점령. 점령하면 방어를 성 크기만큼 다시 세운다
  siegeRate: { min: 0.03, max: 0.05 },
  siegeLoss: 3,             // 성벽 공격에서 잃는 병력 = 깎은 방어 × 3
  captureWall: { 1: 100, 2: 200, 3: 300 },
  // 일기토 (무력): 양쪽 무력이 70 이상이면 합마다 낮은 확률로 벌어진다 (임시값)
  duel: { minWar: 70, chance: 0.08, loserLoss: 0.3, exp: 50 }, // 일기토: 양쪽 무력 70 이상이면 합마다 8%, 출진 한 번(5합)에 최대 1번 (2026-10-26 10%·제한 없음에서 바꿈) 이기면 무력 경험치 50 (2026-10-27 40에서)
  // 전투 중 책략 (2026-10-26): 지력 70 이상이고 상대보다 높으면, 합마다 (지력 ÷ 15)% 확률로 일방 공격 (처음 ÷ 10에서 낮춤). 피해 = (50~100) × 10 × (지력 차이 ÷ 10)^0.7
  scheme: { minInt: 70, chancePerInt: 1 / 1500, base: [50, 100], ref: 10, exp: 0.7, kinds: ['🔥 화공', '🪨 낙석', '🏹 복병'], statExp: 40 }, // 책략 한 번에 지력 경험치 40 (2026-10-27 30에서). 출진 한 번(5합)에 최대 1번

  // 병종과 훈련 (기획서 8장)
  matchup: 0.2,             // 상성: 이기는 병종 +20% (지는 병종 감점은 없음)
  warAttackPer20: 0.01,     // 병종과 상관없이 무력 20마다 전투력 +1%, 공격·수비 모두 (무력 100이면 +5%, 2026-10-26)
  trainingFloor: 0.7,       // 임시: 훈련도 0이면 전투력 70%, 100이면 100%
  guardUnit: { type: '보병', training: 50 },  // 임시: 수비대장의 병종과 훈련도

  npcOnly: [],              // 플레이어가 고를 수 없는 세력 이름 (지금은 없음. 동탁 NPC는 보류)
  rejoinWait: 10,           // 하야한 세력에 다시 들어가려면 기다려야 하는 턴 수
  medalBonus: 1,            // 개국공신 훈장 하나마다 다음 시즌들에 장수를 만들 때 통솔·무력·지력 +1 (누적, 2026-10-27)
  heroCount: 5,             // 개국공신: 통일 세력에 한 번만 들어가 끝까지 남은 장수 중 공적 상위 몇 명에게 훈장 🎖 (2026-10-27, 시즌 3부터)
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
    food: RULES.foodStart[grade],
    guard: RULES.guardTroops[grade],
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
  cs.food = Math.min(foodMax(grade), cs.food + Math.floor((cs.agri * RULES.foodPerAgri + RULES.foodBase) * peaceIncome(cs.peace)));
}
// 게임 속 날짜: n번째 턴이 몇 년 몇 월인지
function dateOf(turn, year = (typeof S !== "undefined" && S && S.startYear) || RULES.startYear) { // 해는 그 세계가 시작한 해 (명예의 전당은 그 시즌의 해를 준다)
  const m = RULES.startMonth - 1 + turn;
  return { year: year + Math.floor(m / 12), month: (m % 12) + 1 };
}
const dateText = (turn, year) => { const d = dateOf(turn, year); return `${d.year}년 ${d.month}월`; };

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
// ===== 장수 특성 (2026-10-27, 금낭: 장수를 만든 뒤 비단 주머니에서 3장을 뽑아 하나를 영구로 고른다. 다시 뽑기 1번) =====
// [미정] 목록은 기획자가 정한다. 지금은 임시 목록이고, 효과는 아직 게임에 붙이지 않았다 (보여 주기만)
const GENERAL_TRAITS = {
  brave: { name: '용맹', desc: '출진 공격 전투력 +3%' },
  wall: { name: '철벽', desc: '수비 전투력 +3%' },
  rider: { name: '기마술', desc: '기병일 때 전투력 +3%' },
  spear: { name: '창술', desc: '보병일 때 전투력 +3%' },
  archer: { name: '궁술', desc: '궁병일 때 전투력 +3%' },
  farm: { name: '둔전', desc: '농업 내정 +10%' },
  trade: { name: '상재', desc: '상업 내정 +10%' },
  build: { name: '축성가', desc: '축성 내정 +10%' },
  charisma: { name: '인망', desc: '징병 +5% 더 모임' },
  thrift: { name: '절약', desc: '병사 군량 소비 -10%' },
  schemer: { name: '책사', desc: '계략 성공률 +5%p' },
  scholar: { name: '학구열', desc: '수련 경험치 +10%' },
};
const TRAIT_DRAW = 3;     // 주머니에서 나오는 종이 수
const TRAIT_REROLLS = 1;  // 다시 뽑기 횟수

const FACTION_TRAITS = {
  마등: { name: '서량기병', desc: '기병 전투력 +5%', cavalry: 0.05 },
  공손찬: { name: '백마의종', desc: '기병으로 수비할 때 전투력 +10%', cavalryDefense: 0.10 },
  조조: { name: '유재시거', desc: '모든 능력치 경험치 +10%', exp: 0.10 },
  원소: { name: '사세삼공', desc: '징병 +5% 더 모임', draft: 0.05 }, // 2026-10-27 금 수입 +5%에서 바꿈 (명문가라 사람이 모임)
  유비: { name: '인덕', desc: '징병으로 떨어지는 치안 -50%', draftPeace: -0.50 }, // 2026-10-27 -30%에서 (체감이 거의 없어서)
  손견: { name: '강동의 호랑이', desc: '출진 공격 전투력 +5%', attack: 0.05 },
  손책: { name: '소패왕', desc: '출진 공격 전투력 +5%', attack: 0.05 }, // 200년 지도 (손견과 같은 효과)
  동탁: { name: '미오성', desc: '금 수입 +5%', gold: 0.05 }, // 2026-10-27 징병 +5%에서 바꿈 (원소와 겹치지 않게)
  원술: { name: '옥새', desc: '상점 값 -10%', shop: -0.10 },
  유표: { name: '형주 학풍', desc: '지력 경험치 +25%', expInt: 0.25 }, // 2026-10-27 15%에서 올림
  유언: { name: '익주 천험', desc: '수비 전투력 +5%', defense: 0.05 },
  유장: { name: '익주 천험', desc: '수비 전투력 +5%', defense: 0.05 }, // 200년 지도 (유언과 똑같이)
  도겸: { name: '서주의 풍요', desc: '상업 내정 +5%', comm: 0.05 },
  장로: { name: '오두미도', desc: '병사 군량 소비 -15%', food: -0.15 },
  엄백호: { name: '강동 호족', desc: '성벽 공격으로 깎는 방어 +15%', siege: 0.15 },
  왕랑: { name: '경학대가', desc: '수련에 금이 들지 않고 수련 경험치 +20%', freeTrain: true, trainExp: 0.20 }, // 2026-10-27 수련 경험치 +20% 더함
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
// 무력 보너스: 병종과 상관없이 무력 20마다 전투력 +1%, 공격·수비 모두 (2026-10-26, 무력의 가치를 올리려고)
const warBonus = u => 1 + Math.floor((u.stats.war || 0) / 20) * RULES.warAttackPer20;
const attackPower = (a, d) => {
  const t = traitOf(a.faction);
  return unitPower(a) * (d ? matchupOf(a, d) : 1) * (a.siege && a.siege.정란 ? 1 + SIEGE_EFFECT.towerAttack : 1)
    * warBonus(a)
    * (1 + (t.attack || 0)) * (a.type === '기병' ? 1 + (t.cavalry || 0) : 1);
};
// 수비력: 성 방어 보정을 받는다
// 세력 특성: 기병(마등·공손찬 수비), 수비 전투력(유언)
const defensePower = (d, wall, a) => {
  const t = traitOf(d.faction);
  return unitPower(d) * (a ? matchupOf(d, a) : 1) * (1 + wall / RULES.wallDivisor) * (1 + (t.defense || 0)) * warBonus(d)
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
  // 벽력거: 이번 출진에서 처음 맞붙는 수비 부대에게, 합을 시작하기 전에 선제 사격 (반격 없음, 합 수에 들지 않음)
  if (att.siege && att.siege.벽력거 && !att.struck && def.troops > 0) {
    att.struck = true;
    const dLoss = Math.min(def.troops, Math.ceil(attackPower(att, def) * RULES.roundRate * SIEGE_EFFECT.firstStrike * luck()));
    def.troops -= dLoss;
    lines.push(`💥 벽력거 선제 사격! ${def.name} -${dLoss.toLocaleString('ko-KR')} (반격 없음)`);
  }
  while (used < left && att.troops > 0 && def.troops > 0) {
    used++;
    // 일기토: 양쪽 무력이 기준 이상이면 낮은 확률로. 이긴 쪽은 피해 없이, 진 쪽 부대만 크게 다친다
    const D = RULES.duel;
    if (!att.dueled && att.stats.war >= D.minWar && def.stats.war >= D.minWar && Math.random() < D.chance) {
      att.dueled = true; // 이번 출진에서는 더 일어나지 않는다
      const aWin = Math.random() < duelWinRate(att.stats.war, def.stats.war);
      const w = aWin ? att : def, l = aWin ? def : att;
      const loss = Math.ceil(l.troops * D.loserLoss);
      l.troops -= loss;
      w.duelWins = (w.duelWins || 0) + 1;
      lines.push(`${used}합: ⚡ 일기토! ${w.name}(무력 ${w.stats.war}) 대 ${l.name}(무력 ${l.stats.war}) → ${w.name} 승리! ${l.name} 부대 -${loss.toLocaleString('ko-KR')}`);
      continue;
    }
    // 책략 (2026-10-26): 지력이 기준 이상이고 상대보다 높은 쪽이, 합마다 (지력 ÷ 15)% 확률로 보통 교전 대신 일방적으로 친다.
    // 피해 = (50~100) × 10 × (지력 차이 ÷ 10)^0.7. 병종·공수·수비대장 가리지 않음, 병력 상한 없음
    const C = RULES.scheme, ai = att.stats.int || 0, di = def.stats.int || 0;
    const sch = ai >= C.minInt && ai > di ? [att, def, ai - di] : di >= C.minInt && di > ai ? [def, att, di - ai] : null;
    if (sch && !att.schemed && Math.random() < sch[0].stats.int * C.chancePerInt) {
      att.schemed = true; // 책략도 출진 한 번(5합)에 최대 1번 (어느 쪽이 쓰든)
      const [me, foe, gap] = sch;
      const loss = Math.min(foe.troops, Math.round((C.base[0] + Math.random() * (C.base[1] - C.base[0])) * C.ref * Math.pow(gap / C.ref, C.exp)));
      foe.troops -= loss;
      me.schemes = (me.schemes || 0) + 1;
      const kind = C.kinds[Math.floor(Math.random() * C.kinds.length)];
      lines.push(`${used}합: ${kind}! ${me.name}(지력 ${me.stats.int})의 계책에 ${foe.name} 부대 -${loss.toLocaleString('ko-KR')}`);
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
  successRate: int => Math.min(0.9, int / 150 + 0.05), // 2026-10-26 전체 +5%p (최대 85% → 90%)
  critRate: int => int / 400,          // 성공했을 때 그중 대성공 확률
  critMul: 1.5,                        // 대성공 효과 배수 (2026-10-26 2배 → 1.5배)
  destroy: { wallPerInt: 1 },          // 파괴: 방어 -(지력 × 1)
  rumor: { peacePerInt: 0.2, devPerInt: 0.2 }, // 유언: 치안·농업·상업 각각 -(지력 × 0.2) (2026-10-25 0.2 → 0.25, 2026-10-26 다시 0.2)
  exp: 40, critExp: 60,                // 성공하면 지력 경험치 (대성공이면 60, 2026-10-27 30·50에서)
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
const expNeed = stat => Math.round(RULES.expNeedBase + stat * RULES.expNeedPer);

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
// 예약 명령으로 내 금을 내고 만든다 (2026-10-26, 기술 조건 없음). 장수마다 하나만: 다른 병기를 만들면 있던 것은 사라진다.
// 공격할 때만 효과가 있다. 부대가 전투에서 전멸하면 50% 확률로 부서진다
const SIEGE = {
  충차: { price: 1000, desc: '성벽 공격에서 깎는 방어 +40% (잃는 병력은 그대로)' },
  정란: { price: 2000, desc: '수비 부대와 싸울 때 공격력 +15%' },
  벽력거: { price: 4000, desc: '수비 부대와 싸우기 전에 선제 사격 (보통 한 합 피해의 50%, 반격 없음)' },
};
// 병기 효과 (임시값)
const SIEGE_EFFECT = {
  ramWall: 0.4,     // 충차: 성벽 공격으로 깎는 방어 +40% (같은 손실로 더 깎는다)
  towerAttack: 0.15, // 정란: 수비 부대와 싸울 때 공격력 +15%
  breakChance: 0.5, // 부대가 전멸하면 병기가 부서질 확률
  firstStrike: 0.5, // 벽력거: 합 전에 쏘는 선제 사격의 피해 = 보통 한 합 피해의 50% (2026-10-26 시즌 2 뒤 "너무 세다"는 의견: 첫 합 무피해 100% → 선제 사격 50% + 5합 그대로)
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
