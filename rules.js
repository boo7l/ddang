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
    explore: true,    // 탐색 (2026-10-25 다시 켬)
    shop: true,       // 상점: 명검·서적·명마를 여러 번 살 수 있고, 살 때마다 비싸진다
  },
  // 턴 (기획서 6장): 모든 장수가 같은 정각에 예약한 명령 하나씩을 실행한다
  // 한 턴의 길이 (2026-10-25): 낮 5분, 밤(한국 시간 1~7시) 15분. 두 값 모두 60분을 나눠떨어지게 한다 (정각에 맞물리도록)
  turnLength: 5 * MIN,      // 낮 1턴 = 5분 (2026-11-11 시즌 7: 10분 → 5분, 밤 20분 → 15분. 시즌 6이 통일로 끝나 턴이 멈춘 뒤 바꿈). 그 전: 10분 (2026-11-07 시즌 6 시험: 5분 → 10분, 밤 15분 → 20분. 최적 턴 간격 찾는 중. 그 전: 시즌 3만 1분이었다: 2026-10-30 5분 → 1분, 2026-10-31 다시 5분. 밤 15분은 그대로)
  night: { from: 1, to: 7, turnLength: 15 * MIN }, // 시즌 7: 20분 → 15분 (2026-11-11) // 밤 1~7시 (한국 시간). 60분을 나눠떨어지는 길이만 쓴다
  queueSize: 50,            // 몇 턴 앞까지 예약할 수 있는지 (2026-11-11 시즌 7: 30 → 50, 낮 5분 턴이면 4시간 10분치. 2026-11-07 30 → 40 → 같은 날 다시 30 (턴 간격 10분이라 30칸이면 5시간치), 2026-10-30 24 → 30: 낮 5분 턴이면 2시간 반치, 밤 15분 턴이면 7시간 반치)
  logMax: 50,               // 장수마다 남기는 기록 줄 수 (gen_logs 표에 따로 둔다. 2026-10-25 80 → 40 → 20, 2026-10-26 기록을 떼어 낸 뒤 30, 2026-10-28 50)
  moveRange: 2,             // 이동 한 번에 갈 수 있는 거리: 우리 땅만 밟고 2칸까지 (2026-10-25, 끝에서 끝 순간이동 막기)
  // 먼 길 (2026-11-03, 211년 지도 교지): 이 길로는 이동·수송이 한 번에 그 길 하나만 된다 (앞뒤로 다른 칸을 이어 가지 못함). "성 이름-성 이름"
  farRoads: ['건녕-교지', '회계-교지'],
  attackCooldown: 2,        // 출진 쿨타임: 1턴에 출진하면 3턴부터 다시 출진할 수 있다 (2026-10-31, 소규모 게릴라 대응. 공백지 출진 포함, 이미 우리 성으로 들어가는 건 제외)
  defenseMax: 5,            // 한 성에서 방어 모드를 켤 수 있는 장수 수. 수비 장수가 전멸하면 방어를 끈 장수 중 병력 많은 장수가 자동으로 켜진다 (2026-10-25)
  recreateWait: 60 * MIN,   // 장수를 지운 뒤 새 장수를 만들 수 있을 때까지 기다리는 실제 시간: 1시간 (2026-11-11 기획자: 턴 대신 시간으로. 턴이 5분이 되며 10턴 = 50분으로 줄어서). 그 전: 턴 수 (2026-10-26 6턴, 2026-10-27 금낭 특성 다시 뽑기 남용을 막으려고 10턴)

  // 능력치 (기획서 7장 확정값)
  statMax: 120,
  startBonus: 10,           // 만들 때만 받는 보너스 포인트
  // 성장 (기획서 7장): 능력치마다 경험치가 쌓이고, 다 차면 그 능력치 +1 (임시값)
  // 내정 1회 · 징병 1회(통솔) · 출진 1회(병종 능력치, 승패 상관없이) · 성 점령(통솔) · 수련 1회(무작위)
  statExp: { get domestic() { return seasonNow() >= 7 ? 25 : 20; }, get draft() { return seasonNow() >= 7 ? 15 : 10; }, battle: 20, // 시즌 7부터 내정 20 → 25, 징병 10 → 15 (2026-11-11 기획자, 내정 유저 능력치 성장 건의. 시즌 7 패치노트)
    win: 20, capture: 30, train: { min: 40, max: 60 } }, // 2026-11-08 시즌 6: 승전 win 20 새로 (상대 장수마다: 전멸시킨 수비 장수 1명당 · 막아낸 수비 장수), 점령 40 → 30. // 2026-11-03 시즌 5 수련 40~60 → 30~60 했다가 같은 날 40~60으로 되돌림 (대신 첩보·책략·돌격·일기토 경험치를 내림). 2026-10-27 내정 25 → 20, 점령 30 → 50. 2026-10-31 출진 30 → 20, 점령 50 → 40
  expNeedBase: 50, expNeedPer: 1.27, // 능력치 1을 올리는 데 필요한 경험치 = 50 + 지금 능력치 × 1.27 (2026-11-04 시즌 5: 40 + × 1.35에서, 저점만 살짝 올림 · 120 근처는 그대로. 2026-11-03 시즌 5 × 1.3에서. 2026-10-27 50 + 능력치 → × 1.2, 2026-10-31 × 1.3)

  // 금은 장수 개인 것 하나뿐이다. 국고는 없다 (기획서 9장). 내정은 턴만 쓴다
  attackGold: { per1000: 20, min: 20 }, // 출진 금 (2026-11-03 시즌 5, 그 전엔 50): 병력 1,000당 20 (천 단위 버림), 최소 20. attackGoldOf
  defenseOffLoss: { min: 0.10, max: 0.20 }, // 성이 떨어질 때 방어를 끈 장수가 물러나며 잃는 병력 비율 (2026-11-03 시즌 5, 그 전엔 0). 고립되면 isolatedLoss만
  myGoldCost: { draft: 200, train: 30, explore: 30, plot: 50 }, // 임시: 내 금에서 나가는 금 (plot = 계략 파괴·유언·첩보, 2026-10-26)
  shopPrice: { base: 150, step: 150 }, // 상점 가격 = 150 + 150 × 그 물건을 이미 산 수 (150, 300, 450 …, 장수마다 따로). 2026-11-13 시즌 7: 증가폭 100 → 150, 2026-11-14 시작값 100 → 150
  // 군량 구매: 시세 = 금 1당 군량 몇. 매달 steps 확률로 바뀌고 4~8 사이를 오간다 (2026-11-10 -1/0/+1 같은 확률 → -2 15%·-1 20%·0 30%·+1 20%·+2 15%). 예약할 때 얼마어치(금) 살지 고른다
  foodBuy: { start: 6, min: 4, max: 8, steps: { '-2': 15, '-1': 20, 0: 30, 1: 20, 2: 15 }, choices: [500, 1000, 2000, 4000], goldMax: 4000 }, // choices는 빠른 단추 (2026-10-31 100·200·500·1000에서), 실제로는 금 1~goldMax 중 직접 입력 (2026-10-25)
  transportMax: 10000,      // 군량 수송 한 번에 옮길 수 있는 최대량 (플레이어가 1~10,000 사이에서 정한다. 2026-10-28 5,000에서)
  battleReward: 500,        // 임시: 전투에 이기면 들어오는 금 (명령으로 금을 더 얻는 길. 기획서 [미정])
  // 공적: 수련을 뺀 모든 명령에 붙는다. 순위를 매기는 점수 (임시값)
  expand: { ready: 0.9, cost: { 1: 3000, 2: 6000 }, merit: { 1: 100, 2: 150 }, exp: { 1: 50, 2: 100 } }, // 2026-11-14 대도시 공적 200 → 150 (기획자). 2026-11-11 시즌 7 (시즌 6 종료 뒤 바로): 대도시 금 5,000 → 6,000, 소성→중성 경험치 60 → 50. 증축 (2026-11-08): exp = 통솔·무력·지력 경험치 각각 (같은 날 공적 150/300 → 100/200으로 낮추고 넣음, 40/60 → 50/80 → 60/100). 내정(농업·상업·방어·치안)이 모두 최대치의 90% 이상인 소성·중성을 한 단계 올린다. 금은 한 명이 전액, 공적은 한 턴 최대(100)를 넘어도 그대로. 성을 빼앗겨도 등급은 그대로
  meritBuyGold: 100, // 군량 구매 공적: 실제로 낸 금 100당 1 (최소 1, 2026-11-02)
  merit: { domestic: 10, draft: 10, transport: 10, siege: 10, explore: 10, move: 5, plot: 10, plotOk: 10, lose: 10,
    // 시즌 7부터 (2026-11-12 기획자): 함락 30 → 20, 공백지 30 → 20, 일기토 승리·책략·돌격 20 → 15
    get win() { return seasonNow() >= 7 ? 20 : 30; }, get blank() { return seasonNow() >= 7 ? 20 : 30; },
    get duel() { return seasonNow() >= 7 ? 15 : 20; }, get scheme() { return seasonNow() >= 7 ? 15 : 20; }, get charge() { return seasonNow() >= 7 ? 15 : 20; } }, // 2026-10-28 계략은 시도 10 + 성공 20. 2026-10-31 공백지 차지 50 → 30, 일기토 승리·책략 성공 25 → 20
  destroyMerit: { member: 30, commander: 50 }, // 적 세력을 멸망시킨 세력 장수 모두 / 대도독 (2026-11-13, 시즌 7부터, engine destroyReward)
  meritTurnMax: 100,        // 한 장수가 한 턴에 얻는 공적의 최대치 (2026-10-28: 함락·일기토·책략·피해·성벽 공적이 겹쳐도 100까지)
  meritPerKill: 300,        // 피해 공적: 전투에서 없앤 적 병력 300명당 공적 1 (공격·수비 모두, 2026-10-26. 2026-10-31 200명에서)
  meritPerWall: 30,         // 성벽 공적: 성벽 공격으로 깎은 방어 30당 공적 1 (2026-10-26)
  fallenMeritLoss: 0.05, // 2026-11-14 기획자: 멸망 -5% 다시 (같은 날 0%로 했다가 되돌림, 자진 하야 -15%보다 가볍게). 세력이 멸망하면 그 세력 장수의 공적이 5% 줄어든다 (2026-10-31, 같은 날 10%에서)
  isolatedLoss: 0.5,      // 고립된 성(이웃에 우리 성 없음)이 함락되면 그 성 장수는 가장 가까운 우리 성으로 가되 병력 50%를 잃는다 (2026-10-26)
  // 첩보: 엿본 정보가 유효한 시간 (임시값)
  spyTurns: 5, spyDiv: 110, spyBase: 0, spyMax: 0.9, // 첩보: 성공하면 5턴 동안 보임 (2026-10-30 6에서), 성공 확률 = 지력 ÷ 110 (최대 90%. 2026-11-01 ÷ 100에서, 2026-11-03 기본 +5% 뺌)
  startGold: 500,           // 임시: 장수를 만들 때 가진 금
  playerGoldMax: 15000,     // 장수 한 명이 가질 수 있는 금 (2026-11-13 시즌 7: 10,000 → 15,000)
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
  // 치안 구간 (기획서 9장): 50 이상은 그대로, 20~49는 수입·징병 15% 줄고, 20 미만은 수입 75%에 징병 불가
  peaceOk: 50, peaceLow: 20,
  get draftPerLea() { return seasonNow() >= 7 ? { min: 22, max: 27 } : { min: 20, max: 25 }; }, // 2026-11-13 시즌 7부터 22~27 (기획자, 11-10 잠정 → 확정). 징병 1회 = 통솔 × 20~25명 (무작위. 2026-11-04 시즌 5 15~25에서 최솟값 올림. 2026-10-25 15~20에서 올림)
  draftPerMerit: 0.1,       // 징병에 공적 × 0.1명이 더 모인다 (2026-10-25)
  draftPeacePer: 350,       // 징병하면 그 성의 치안이 모은 병사 350명당 1 떨어진다 (2026-10-25 200 → 250, 2026-10-26 "치안이 너무 잘 깎인다" 의견으로 300, 2026-11-11 시즌 6 도중 350: 기획자가 공지)
  draftPeacePerS7: 350,     // 시즌 7부터 350명당 1 (2026-11-09 기획자, 징병 치안 감소 완화. 시즌 7 패치노트에 넣음). draftPeaceOf()
  troopsPerLea: 100,        // 장수 한 명의 최대 병력 = 통솔 × 100

  // 군량은 성마다 따로 쌓인다. 상한은 성 규모(1 소성, 2 중성, 3 대도시)마다 다르다 (임시값)
  foodMax: { 1: 15000, 2: 20000, 3: 30000 }, // 성 크기별 군량 최대치 (2026-10-25 5000/15000/30000 → 10000/15000/25000, 2026-10-26 15000/20000/30000)
  foodStart: { 1: 1500, 2: 2000, 3: 3000 },  // 시즌을 시작할 때 성마다 있는 군량 (2026-10-26, 다음 시즌부터)

  // 달력: 1턴 = 게임 속 1달 (기획서 6장)
  scenario: '관도대전', // 지도 파일에 scenario가 없을 때만 쓰는 시나리오 이름. 보통은 지도 편집기의 "시나리오" 칸에서 정한다 (2026-10-27)
  startYear: 200, startMonth: 1, // 지도 파일에 year가 없을 때만 쓰는 시작 해. 보통은 지도 편집기의 "시나리오" 칸에서 정한다. 새 시즌을 열 때 세계에 S.startYear로 남긴다
  goldMonths: [1, 4, 7, 10], // 금 수입이 들어오는 달
  harvestMonths: [4, 10],   // 군량 수확이 들어오는 달 (먹는 것은 매달)
  // 지역 이벤트 (2026-11-04, 시즌 5부터): 매 턴 이벤트마다 따로 확률을 굴려 터지면 구역(mapcore.js regionOf) 하나를 똑같은 확률로 뽑는다.
  // 한 턴에 한 구역에는 이벤트 하나만. 처리 순서: 예약 명령 → 이벤트 → 금 수입 → 군량 수확.
  // months: 일어날 수 있는 달 (없으면 매달), chance: 턴당 확률
  // food: 그 턴 수확량 변화, troops: 그 구역 장수·수비대장 병력 변화, agri·comm: 지금 값에 곱하는 변화(영구, 상한까지), peace: 치안 더하기, gold: 그 구역 장수 금
  regionEvents: [
    { key: 'harvest', name: '풍작', icon: '🌾', months: [4, 10], chance: 0.05, food: 0.3 },
    { key: 'drought', name: '가뭄', icon: '☀️', months: [4, 10], chance: 0.05, food: -0.3 },
    { key: 'revolt', name: '민란', icon: '🔥', chance: 0.03, troops: -0.1, peace: -20 }, // 2026-11-06 병력 -5% → -10%
    { key: 'plague', name: '역병', icon: '☠️', chance: 0.02, troops: -0.15, peace: -10 }, // 2026-11-06 병력 -10% → -15%, 치안 -10 추가
    { key: 'flood', name: '폭우', icon: '🌧️', months: [6, 7, 8], chance: 0.03, agri: [-60, -40], comm: [-60, -40], peace: -10 }, // 2026-11-06 농업·상업 -10% → -40~60 (따로 굴림)
    { key: 'cold', name: '한파', icon: '❄️', months: [12, 1, 2], chance: 0.03, agri: [-60, -40], comm: [-60, -40], peace: -10 }, // 2026-11-06 농업·상업 -10% → -40~60 (따로 굴림), 치안 -10 추가
    { key: 'boom', name: '교역 호황', icon: '💰', months: [1, 4, 7, 10], chance: 0.03, comm: [40, 60], gold: 500 }, // 2026-11-06 상업 +15% → +40~60
  ],
  regionEventRest: 6, // 숨은 규칙 (화면·도움말에 적지 않는다): 이벤트가 터진 구역은 이 턴 수(반년) 동안 이벤트가 안 일어난다
  // 수입 (임시값)
  goldBase: 100, goldPerComm: 0.8, // 금 수입 = (100 + 장수가 있는 성의 상업 × 0.8) × (1 + 공적 × meritIncome) × 치안 보정 (2026-10-31, 그 전엔 상업 × 1. 저점을 올리고 고점을 낮춤)
  crowdCap: { 1: 10, 2: 15, 3: 20 }, crowdPow: { 1: 0.75, 2: 1, 3: 1.5 }, // crowdPow: (정원 ÷ 인원)의 지수, 성 크기별 (2026-11-13 기획자: 2 → 1.5 → 소성 0.75 · 중성 1 · 대도시 1.5) // 성 정원 (2026-11-12 시즌 7부터, 시범 도입이라 널널하게): 넘으면 그 성 장수 모두 금 수입의 상업 몫 × (정원 ÷ 인원)². 기본 100은 그대로. 농성 짱박기 대책
  crowdFromSeason: 7,
  // 대도독 (2026-11-13, 시즌 7부터, 기획서 "대도독 · 동맹"): 세력마다 한 명. 자격이 되는 장수가 직접 수락해야 오른다
  commander: { fromSeason: 7, minMerit: 500, minMembers: 5, offline: 12 * 60 * 60 * 1000, handWait: 60 * 60 * 1000, seenEvery: 10 * 60 * 1000, noticeLen: 80, allyMin: 12, allyMax: 36, allyMax2: 2, allyBreakTurns: 5, allyBreakMerit: 30, allyBreakMeritCmd: 80, fireOffline: 24 * HOUR }, // 동맹 (2026-11-13): 기간 12~36턴, 세력당 2개, 파기하면 5턴 뒤 풀림 + 파기한 세력 장수 공적 -30 · 대도독 -80(포함, 2026-11-13 100 → 80) // noticeLen: 공지 글자 수 // offline: 이만큼(실제 시간) 접속이 없으면 자리를 잃는다. handWait: 넘겨받을 장수가 수락할 시간. seenEvery: 마지막 접속 시각을 적는 간격
  get meritIncome() { return seasonNow() >= 7 ? 0.00005 : 0.0001; }, // 2026-11-12 시즌 7부터 공적 200마다 1% (기획자). 공적 보너스: 공적 100마다 수입 1% 더 (1,000이면 10%. 2026-10-25 0.0001 → 0.0002, 2026-10-31 다시 0.0001)
  foodPerAgri: 3.5,         // 임시: 수확 군량 = 그 성의 농업 × 3.5 (× 치안 보정. 2026-10-25 3 → 3.5, 2026-10-26 기본 500을 더한 만큼 3.3으로, 2026-11-02 3.5)
  foodBase: 500,            // 수확마다 성마다 기본으로 더 들어오는 군량: 수확 = (농업 × 3.5 + 500) × 치안 보정 (2026-10-25, 농업 낮은 성 보완)
  foodPerTroops: 0.02,      // 매달 병사 100명이 군량 2를 먹는다 (장수가 머무는 성의 군량. 2026-10-25 1에서 2배로. 2026-11-02 잠시 0.018로 했다가 수확 3.5로 바꾸며 되돌림)
  starveLoss: 0.05,         // 임시: 군량이 모자라면 그달 병력 5%가 흩어진다

  // 전쟁 (임시값)
  marchFoodRate: 0.1,       // 출진하면 병력 × 0.1만큼 떠나는 성의 군량을 바로 쓴다 (전투 결과와 상관없이 사라짐. 2026-10-26 수확이 늘어 0.05 → 0.07, 2026-10-27 0.08, 2026-10-30 0.1)
  captureKeep: { min: 0.5, max: 0.7 }, // 성을 점령하면 그 성 군량의 50~70%(무작위)만 남는다 (나머지는 흩어짐)
  captureFoodMin: 1000,     // 세력 성을 함락한 뒤 남은 군량이 1,000보다 적으면 1,000으로 채운다 (2026-11-02. 공백지는 그대로)
  guardTroops: { 1: 2000, 2: 3000, 3: 5000 }, // 수비대장 병력 (최대치, 시즌 시작 값). 2026-10-26 성 규모 × 1,000에서 올림 (초반 너무 빠른 확장 막기)
  guardMax: { 1: 5000, 2: 7000, 3: 10000 }, // 수비대장 징병으로 채울 수 있는 최대치 (2026-11-04 시즌 5, 같은 날 4,000/6,000/8,000에서 올림). 자동 회복은 guardTroops까지만
  guardRegen: 200,          // 수비대장이 매달 회복하는 병력 (최대치까지)
  guardStat: 60,            // 수비대장 능력치 (통솔·무력·지력 모두, 2026-10-26 50에서 올림)
  // 5합 전투 (기획서 8장): 출진 1회에 최대 5합. 한 합에 양쪽이 동시에 상대 병력을 "내 전투력 × 17%"만큼 줄인다
  roundsMax: 5,
  fieldFromSeason: 7,       // 야전 (맞출진, 2026-11-09 기획): 이 시즌부터. 같은 턴에 두 성이 서로 출진하면 들판에서 먼저 싸운다 (engine.js runField)
  roundRate: 0.2,           // 2026-11-07 시즌 6: 0.2 → 0.17 → 0.19 → 0.2 (방어도 패치로 성 싸움 양쪽 피해가 이미 15~30% 줄어서 되돌림. 큰 부대는 병력 곡선으로 누름. 패치노트에는 안 씀). 임시: 비슷하면 5합 뒤에도 양쪽이 남고, 2~3배 차이면 2~3합에 끝난다
  // 병력 곡선: 병력이 많을수록 전투력이 덜 늘어난다. 실효 병력 = 5,000 × (병력 ÷ 5,000)^exp (exp 1이면 정비례)
  troopCurve: { ref: 4500, exp: 0.70 }, // 병력 곡선 (2026-11-13 4,491 → 4,500 반올림, +0.06%. 2026-11-07 시즌 6: 4,730·0.71 → 4,491·0.70 (같은 날 0.67 → 0.69 → 0.70으로 완화). 1,000명은 그대로, 6,000명 -1.8%, 12,000명 -2.5%. 2026-10-26 지수 0.75 → 0.72, 2026-10-31 기준 5,000 → 4,730·지수 0.71: 1,000명은 그대로 두고 큰 부대 우위를 조금 더 누름)
  battleRandom: 0.05,       // 합마다 전투력에 ±5% 무작위
  // 방어도 피해 감소 구간제 (2026-11-10 기획자, 시즌 6 도중 2026-11-10 20:00 KST부터): 방어 100마다 더해지는 감소 %. 0~500은 3%씩, 500~1,000은 2%씩 → 1,000이면 25%. 1,000 넘으면 마지막 값(2%)으로
  wallCutSteps: [3, 3, 3, 3, 3, 2, 2, 2, 2, 2],
  wallCutStepsFrom: Date.UTC(2026, 10, 10, 11, 0), // 2026-11-10 20:00 KST. 그 전에는 wallCutPer100 (100마다 3%)
  wallCutPer100: 0.03,      // 방어도 피해 감소: 성을 지키는 쪽이 보통 합에서 받는 피해가 방어 100마다 -3% (방어 1,000이면 -30%). 2026-11-06 시즌 6: 그 전엔 수비 전투력 × (1 + 방어 ÷ 2,500) (100마다 +4%). 돌격·책략·일기토에는 적용 안 함
  captureCut: 0.10,         // 함락된 성의 치안이 지금 값에서 10% 깎인다 (2026-10-26 20% → 15%, 2026-10-27 격전지가 너무 처참하다는 의견으로 10%. 방어는 아래 captureWall로 다시 세운다)
  // 함락 때 농업·상업은 그 성 최대치 대비 얼마나 찼는지에 따라 깎인다 (2026-11-07 시즌 6): 50% 이상 15%, 25~50% 10%, 25% 미만 5%.
  // 그 전엔 일괄 10% (100 미만이면 5%). 잘 키운 성일수록 많이 잃어 중반 이후 다시 쌓을 일이 생기게
  captureCutDev: [{ from: 0.5, rate: 0.15 }, { from: 0.25, rate: 0.10 }, { from: 0, rate: 0.05 }],
  // 연속 함락 완화 (2026-11-12 기획자, 시즌 7부터): 최근 5턴 안에 이미 함락된 성은 농업·상업이 원래 비율의 절반만 깎인다 (치안은 그대로). 뺏고 뺏기는 격전지가 너무 황폐해져서
  get captureRepeatTurns() { return seasonNow() >= 7 ? 5 : 0; },
  captureRepeatRate: 0.5,
  // 성벽 공격 (기획서 7장): 지키는 부대가 없거나 모두 쓰러뜨리면, 남은 병력의 3~4%만큼 성의 방어를 깎고, 깎은 양의 4배(siegeLoss)만큼 병력을 잃는다.
  // 방어가 0이 되어야 점령. 점령하면 방어를 성 크기만큼 다시 세운다
  siegeRate: { min: 0.03, max: 0.04 }, // 2026-11-07 시즌 6: 3~4.5%에서 (템포 안정화). 2026-11-02 3~5%에서
  siegeLoss: 4,             // 성벽 공격에서 잃는 병력 = 깎은 방어 × 4 (2026-11-09 시즌 6 도중 3.5에서, 패치노트 없음. 2026-11-02 3 → 3.5)
  captureWall: { 1: 100, 2: 200, 3: 300 },
  // 일기토 (무력): 양쪽 무력이 70 이상이면 합마다 낮은 확률로 벌어진다 (임시값)
  duel: { minWar: 70, chance: 0.04, lossPerWar: [15, 20], lossCap: 1, exp: 40 }, // 2026-11-07 시즌 6: 상한 50%를 넣었다가 같은 날 뺌 (1 = 상한 없음. 소규모 부대의 역전 요소로 둔다). // 2026-11-07 시즌 6: 진 쪽 손실 무력 × 13~20 → 15~20. // 2026-11-03 시즌 5: 일기토 승리 경험치 50 → 40, 발생 확률 합마다 5% → 4%. // 일기토: 진 쪽 병력 손실 = 이긴 쪽 무력 × 13~20 (2026-10-31, 그 전엔 진 쪽 병력의 30% → 25%). 양쪽 무력 70 이상이면 합마다 5% (2026-10-28 8%에서, 빠뜨롱 나와 특성은 10%),출진 한 번(5합)에 최대 1번 (2026-10-26 10%·제한 없음에서 바꿈) 이기면 무력 경험치 50 (2026-10-27 40에서)
  // 전투 중 책략 (2026-10-26): 지력 70 이상이고 상대보다 높으면, 합마다 (지력 ÷ 20)% 확률로 (2026-11-03 시즌 5 ÷ 15에서) 일방 공격 (처음 ÷ 10에서 낮춤). 피해 = (60~90) × 10 × (지력 차이 ÷ 10)^0.6 (2026-10-31 (50~100), 지수 0.7에서)
  charge: { minWar: 70, chancePerWar: 1 / 2000, base: [60, 90], ref: 10, exp: 0.6, gapAdd: 5, troopRef: 5000, troopExp: 0.3, statExp: 30 }, // 2026-11-07 시즌 6: 피해 × min(1, (쓰는 쪽 병력 ÷ 5,000)^0.3) (작은 부대 싸움 운빨 줄이기). // 2026-11-03 시즌 5 발동 확률 능력치 ÷ 1500 → ÷ 2000, 경험치 40 → 30. 돌격 (2026-11-03 시즌 5): 책략의 무력 버전. 같은 수식에 지력 대신 무력. 무력 경험치 40, 공적 20. 침착이면 피해 -50%
  scheme: { minInt: 70, chancePerInt: 1 / 2000, base: [60, 90], ref: 10, exp: 0.6, gapAdd: 5, troopRef: 5000, troopExp: 0.3, kinds: ['🔥 화공', '🪨 낙석', '🏹 복병'], statExp: 30 }, // 2026-11-07 시즌 6: 피해 × min(1, (쓰는 쪽 병력 ÷ 5,000)^0.3). 2026-11-03 시즌 5 발동 확률 지력 ÷ 1500 → ÷ 2000, 경험치 40 → 30. // 책략 한 번에 지력 경험치 40 (2026-10-27 30에서). 출진 한 번(5합)에 최대 1번

  // 병종 (기획서 8장)
  matchup: 0.2,             // 상성: 이기는 병종 +20% (지는 병종 감점은 없음)
  matchupS7: 0.15,          // 시즌 7부터 +15% (2026-11-10 기획자, 시즌 7 패치노트에 넣음). matchupOf()
  warPer1: 0.0015,          // 병종과 상관없이 무력 1마다 전투력 +0.15%, 공격·수비 모두 (무력 100이면 +15%). 화면·패치노트에는 '10마다 +1.5%'. 2026-11-06 시즌 6: 10마다 +1%(10 단위로 끊음)에서. 2026-11-04 시즌 5: 20마다 +1%에서 10마다로
  guardUnit: { type: null },  // 2026-11-14 기획자: 수비대는 병종 없음 (상성 없음). 그 전: 기본 보병, 수비대 징병으로 바꿈. 수비대장의 기본 병종 (훈련도는 2026-11-06 기능째 지움)

  npcOnly: [],              // 플레이어가 고를 수 없는 세력 이름 (지금은 없음. 동탁 NPC는 보류)
  get resignMeritCut() { return seasonNow() >= 7 ? 0.15 : 0; }, // 하야하면 공적 -15% (2026-11-13 -10% → -15%) (시즌 7부터, 2026-11-11 기획자: 하야로 갈아타는 플레이 대가. 세력이 멸망해 재야가 되면 깎지 않는다)
  rejoinWait: 10,           // 하야한 세력에 다시 들어가려면 기다려야 하는 턴 수
  medalBonus: 1,            // 개국공신 훈장 하나마다 다음 시즌들에 장수를 만들 때 통솔·무력·지력 +1 (누적, 2026-10-27)
  heroCount: 5,             // 훈장 받는 인원. 시즌 5부터 전체 공적 상위 몇 명 (2026-11-04). 그 전 개국공신: 통일 세력에 한 번만 들어가 끝까지 남은 장수 중 공적 상위 몇 명에게 훈장 🎖 (2026-10-27, 시즌 3부터)
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
const peaceIncome = v => (v >= RULES.peaceOk ? 1 : v >= RULES.peaceLow ? 0.85 : 0.75); // 2026-10-31 0.9 → 0.85
// 치안 보정: 징병으로 모이는 병력에 곱한다. 0이면 징병할 수 없다
const peaceDraft = v => (v >= RULES.peaceOk ? 1 : v >= RULES.peaceLow ? 0.85 : 0); // 치안 불안이면 15% 덜 모인다

// 내정 1회로 오르는 양: 쓰는 능력치 × 무작위 비율 (RULES.domesticRate)
const domesticGain = (key, stat) => {
  const [lo, hi] = RULES.domesticRate[key] || RULES.domesticRate.agri;
  return Math.max(1, Math.floor(stat * (lo + Math.random() * (hi - lo))));
};
// 징병 치안 감소 기준 (모은 병사 몇 명당 치안 -1): 시즌 7부터 350, 그 전엔 300
const draftPeaceOf = season => ((season || 1) >= 7 ? RULES.draftPeacePerS7 : RULES.draftPeacePer);
// 징병 1회로 늘어나는 병력: 통솔 × 10~20 (무작위)
// 징병 1회 = 통솔 × 15~25 (무작위) + 공적 × 0.1
const draftGain = (lea, merit = 0) => lea * randInt(RULES.draftPerLea.min, RULES.draftPerLea.max) + Math.floor(merit * RULES.draftPerMerit);
// 출진에 필요한 군량
// 출진 군량 (2026-11-06: 세력 특성 군량 소비도 적용. fid = 출진하는 세력)
const marchFood = (troops, fid) => Math.ceil(troops * RULES.marchFoodRate * Math.max(0, 1 + ((fid && traitOf(fid).food) || 0)));
// 장수 한 명이 거느릴 수 있는 최대 병력 (통솔)
const troopsMax = g => effStats(g).lea * RULES.troopsPerLea + (gTrait(g).troopsBonus || 0); // 개인 특성 마성의 장수 +1,000 (2026-11-08)
// 함락된 성은 농업·상업·치안이 조금 깎인다. 깎인 양을 돌려준다 (방어는 성벽 공격으로 이미 0)
// 농업·상업은 그 성 최대치 대비 찬 비율로 깎는 비율이 정해진다 (RULES.captureCutDev, 2026-11-07). 치안은 RULES.captureCut
function captureDamage(cs, grade, repeat = false) {
  const out = {};
  for (const k of ['agri', 'comm', 'peace']) {
    const rate = k === 'peace' ? RULES.captureCut : RULES.captureCutDev.find(t => cs[k] >= devMax(grade, k) * t.from).rate * (repeat ? RULES.captureRepeatRate : 1);
    out[k] = Math.floor(cs[k] * rate);
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
// 정원 초과 (2026-11-12, 시즌 7부터): 상업 몫에 곱하는 비율 = (정원 ÷ 인원)^crowdPow[성 크기] (2026-11-13: 소성 0.75 · 중성 1 · 대도시 1.5), 정원 안이면 1. 인원 = 그 성에 머무는 그 세력 장수 수
const crowdRate = (grade, count) => (seasonNow() >= RULES.crowdFromSeason && count > RULES.crowdCap[grade] ? (RULES.crowdCap[grade] / count) ** RULES.crowdPow[grade] : 1);
const goldIncome = (cs, merit = 0, crowd = 1) => Math.floor((RULES.goldBase + cs.comm * RULES.goldPerComm * crowd) * (1 + merit * RULES.meritIncome) * peaceIncome(cs.peace));
// 수확(4·10월): 그 성의 농업에 따라 군량이 들어온다 (상한까지만)
function harvestFood(cs, grade, rate = 0) { // rate: 지역 이벤트(풍작 +0.3 · 가뭄 -0.3)로 이번 수확량이 바뀌는 비율
  cs.food = Math.min(foodMax(grade), cs.food + Math.floor((cs.agri * RULES.foodPerAgri + RULES.foodBase) * peaceIncome(cs.peace) * (1 + rate)));
}
// 게임 속 날짜: n번째 턴이 몇 년 몇 월인지
function dateOf(turn, year = (typeof S !== "undefined" && S && S.startYear) || RULES.startYear) { // 해는 그 세계가 시작한 해 (명예의 전당은 그 시즌의 해를 준다)
  const m = RULES.startMonth - 1 + turn;
  let y = year + Math.floor(m / 12);
  if (year < 0 && y >= 0) y++; // 기원전(음수)에서 시작하면 0년 없이 기원전 1년 → 서기 1년 (2026-11-06)
  return { year: y, month: (m % 12) + 1 };
}
// 해 표시: 음수는 기원전 (-203 → "기원전 203년")
const yearText = y => (y < 0 ? `기원전 ${-y}년` : `${y}년`);
const dateText = (turn, year) => { const d = dateOf(turn, year); return `${yearText(d.year)} ${d.month}월`; };

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

// ===== 장수 특성 (2026-10-27, 금낭: 장수를 만든 뒤 비단 주머니에서 3장을 뽑아 하나를 영구로 고른다. 다시 뽑기 1번) =====
// 2026-10-28 기획자 목록 18개. tier(상·중·하)마다 뽑힐 비율이 다르다 (TRAIT_TIER_WEIGHT). 효과가 붙는 곳은 engine.js·아래 전투 공식에서 gTrait(장수 또는 부대)로 읽는다
const GENERAL_TRAITS = {
  brave: { tier: 'N', name: '용맹', desc: '공격 전투력 +5%', attack: 0.05 }, // 2026-11-07 시즌 6: +3%에서 (철벽 피해 감소 +5%와 맞춤)
  wall: { tier: 'N', name: '철벽', desc: '수비 시 피해 감소 +5%', dmgCut: 0.05 }, // 2026-11-07 시즌 6: 수비 전투력 +3%에서. 방어도 피해 감소(wallCut)에 더한다 (보통 합만)
  trade: { tier: 'N', name: '상재', desc: '상업 내정 +30%', dev: { comm: 0.30 } }, // 2026-11-08 시즌 6 +30%. // 2026-10-28 +10% → +15% → +20%, 2026-11-03 시즌 5 +25%
  farm: { tier: 'N', name: '둔전', desc: '농업 내정 +30%', dev: { agri: 0.30 } }, // 2026-11-08 시즌 6 +30%. // 2026-10-28 +10% → +15% → +20%, 2026-11-03 시즌 5 +25%
  build: { tier: 'N', name: '장인', desc: '축성 내정 +30%', dev: { wall: 0.30 } }, // 2026-11-08 시즌 6 +30%. // 2026-10-28 +10% → +15% → +20%, 2026-11-03 시즌 5 +25%
  lazy: { tier: 'R', name: '장군뒹굴', desc: '대기 턴마다 모든 능력 경험치 +4', idleExp: 4 }, // 2026-11-08 시즌 6: +3 → +4. // 2026-11-03 시즌 5: +2 → +3. // 2026-10-31 추가. 빈 칸일 때만, 세력 소속일 때만, 다른 경험치 보너스 없이 정확히 2 (같은 날 1에서)
  politic: { tier: 'R', name: '전문정치팀', desc: '모든 내정 +20%', dev: { agri: 0.20, comm: 0.20, tech: 0.20, wall: 0.20, peace: 0.20 } }, // 2026-11-08 시즌 6 +20%. // 2026-10-28 +5%에서 +10%, 2026-11-03 시즌 5 +15%
  haggle: { tier: 'N', name: '협상가', desc: '상점 값 -10%', shop: -0.10 }, // 2026-10-28 -5%에서
  rich: { tier: 'N', name: '부호', desc: '금 수입 +10%', gold: 0.10 }, // 2026-10-31 추가, 2026-11-07 시즌 6 +5% → +10%
  schemer: { tier: 'N', name: '책사', desc: '계략 성공 확률 +8%p', plot: 0.08 }, // 2026-11-08 시즌 6: +5%p → +8%p (파괴·유언·첩보, 최대 90% 위로도 더함)
  charisma: { tier: 'N', name: '인망', desc: '징병량 +15%', draft: 0.15 }, // 2026-11-08 시즌 6: +10% → +15%. // 2026-10-28 +10% → +5% → +10%
  frail: { tier: 'SR', name: '뼈에게 닿기를', get desc() { return `전투력 -${Math.round(-this.power * 100)}%, 대신 이동을 4칸까지 (아군 땅이 끊겨도)`; }, get power() { return seasonNow() >= 7 ? -0.01 : -0.02; }, moveRange: 4, freePath: true }, // 2026-11-13 시즌 7: 전투력 -2% → -1% (기획자). // 2026-11-03 시즌 5: 길이 끊겨도 4칸 안의 아군 성으로. // 2026-10-28 3칸 → 4칸
  chadol: { tier: 'R', name: '차돌애호가', desc: '통솔·무력 경험치 +10%, 지력 경험치 -5%', exp: { lea: 0.10, war: 0.10, int: -0.05 } }, // 2026-11-03 시즌 5: 통솔·무력 +5%·지력 -3% → 통솔·무력 +10%·지력 -5%. 2026-10-28 -10%·+20% → -5%·+10% → -3%·+5%
  discipline: { tier: 'R', name: '기강 잡기', desc: '머무는 성의 치안이 매턴 +2 (중복 불가)', peaceTurn: 2 },
  scholar: { tier: 'N', name: '학구열', desc: '수련 경험치 +15%', trainExp: 0.15 }, // 2026-10-28 +10%에서
  engineer: { tier: 'R', name: '병기도 과학', desc: '병기 제작비 -20%', siegePrice: -0.20 }, // 2026-11-07 시즌 6: -15% → -20% (2026-10-28 -20%에서 -15%로 내렸었음)
  medic: { tier: 'R', name: '너 치료된 거야', desc: '전투 뒤 30% 확률로 잃은 병력의 30%가 돌아옴', heal: { chance: 0.3, rate: 0.3 } }, // 2026-11-08 시즌 6: 20% → 30%. // 2026-10-28 50%·25% → 30%·25%, 2026-10-31 30%·20%
  pierce: { tier: 'SR', name: '관통맨', desc: '공격 시 합마다 40% 확률로 성벽 피해 (병력 ÷ 200)', pierce: { chance: 0.40, per: 200 } }, // 2026-11-08 시즌 6: 25%·÷400 → 40%·÷200 (출진 한 번 성벽 18 → 약 60, 시뮬). // 2026-10-31 추가. 병력 손실 없음, 방어가 0이 돼도 수비 부대를 쓰러뜨려야 점령
  persuade: { tier: 'SR', name: '설득민수', get desc() { return `수비할 때 불리하면 합마다 ${Math.round(this.persuade * 100)}% 확률로 상대가 퇴각`; }, get persuade() { return seasonNow() >= 7 ? 0.05 : 0.04; } }, // 2026-11-10 기획자: 시즌 7부터 4% → 5% (시즌 7 패치노트). // 2026-11-07 시즌 6: 3% → 4%. 2026-10-28 5% → 4% → 3%
  allure: { tier: 'SR', name: '마성의 장수', desc: '병력 최대치 +1,000', troopsBonus: 1000 }, // 2026-11-08 시즌 6 추가 (SR 비율은 다섯 개가 나눠 가짐: 1.6 × 4 → 1.28 × 5 → 같은 날 1.0)
  levy: { tier: 'SR', name: '이게 일상이야', desc: "명령 '갈취' : 무력의 2~5배만큼 금 획득, 치안 -3 (쿨타임 5턴)", levy: { warMin: 2, warMax: 5, peace: 3, cooldown: 5 } }, // 2026-10-31 금 = 무력 × 2~5. 2026-10-30 무력 × 1~5 (그 전 30~300). 2026-10-28 10~500·5턴 → 10~400·6턴 → 10~400·5턴 → 30~300·5턴 (티어 중 → 상)
  duelist: { tier: 'R', name: '빠뜨롱 나와', desc: '일기토 발생률 +10% 및 승리 확률 +15%', duelChance: 0.10, duelWin: 0.15 }, // 2026-11-07 시즌 6: +5%·+10%에서
  calm: { tier: 'SSR', name: '침착', get desc() { return seasonNow() >= 7 ? '일기토·책략·돌격 피해 -50%, 방어 시 성 계략 피해 -50%' : '일기토·책략·돌격 피해 -50%, 머무는 성의 계략 피해 -50%'; }, calm: 0.50, get calmNeedsDefense() { return seasonNow() >= 7; } }, // 2026-11-10 기획자: 시즌 7부터 성 계략(파괴·유언) 경감은 방어 모드를 켠 침착 장수가 있어야 (일기토·책략·돌격은 그대로, 시즌 7 패치노트). // 2026-11-03 돌격도 줄인다. // 2026-10-31 -40% → -50%. 2026-10-28 최상 (같은 성에 여럿이어도 계략 경감은 한 번만)
  taunt: { tier: 'SSR', name: '55도발', desc: '공격 시 55% 확률로 수비 부대 성벽 효과 무시', taunt: 0.55 }, // 2026-11-07 시즌 6 추가: 수비 부대와 맞붙을 때마다 판정. 성공하면 그 상대는 방어도 피해 감소(wallCut)를 못 받는다 (철벽은 그대로, 성벽 공격 단계는 그대로). 뽑힐 비율은 침착과 같은 SSR 0.8
};
// 장수(또는 전투 부대)의 개인 특성. 없으면 빈 것
const seasonNow = () => (typeof S !== 'undefined' && S ? S.season || 1 : 1); // 시즌별로 달라지는 특성 값 (전투 시뮬레이터처럼 S가 없으면 1)
const gTrait = x => (x && GENERAL_TRAITS[x.trait]) || {};
// 특성 하나가 뽑힐 비율 (합이 100이라 그대로 %): 2026-10-29 SSR 1 → 0.8, R 5 → 4.5, 줄인 3.2를 N 9개에 나눔 (7 → 약 7.36). SR 2는 그대로
const TRAIT_TIER_WEIGHT = { SSR: 0.5, SR: 1, R: 4, N: 6.6 }; // 2026-11-08: SR 1.28 → 1, N 6.3795 → 6.6 (합 딱 100). 시뮬(리롤: SR 있으면 10%, R·N뿐이면 70%) 100명 중 SSR 5 · SR 22 · R 50 · N 23. // 2026-11-08: SR 마성의 장수 추가로 SR 1.6 → 1.28 (SR 합 6.4 그대로, 전체 합 99.2 그대로). // 2026-11-08: R 4.035 → 4, 남은 0.245를 N 10개에 (+0.0245, 합 99.2 그대로). // 2026-11-08 시즌 6: SR 1.8 → 1.6, 남은 0.8은 R·N에 비율대로 (합 99.2 그대로라 SSR 실제 확률 그대로). 시뮬(리롤 SR 30%·R/N 70%): 100명 중 SSR 5.1 · SR 24.5 · R 49.5 · N 21.0. // 2026-11-08 시즌 6: SSR 0.8 → 0.5 (SSR 2개가 되며 100명 중 약 10명 → 약 6명, 다시 뽑기 1번 포함 시뮬). // 2026-11-07 시즌 6: SSR 55도발 추가로 N 6.4 → 6.3 (합 99.8, 실제 확률은 합으로 나누므로 100%: SSR 0.802 · SR 1.804 · R 4.008 · N 6.313). // 2026-11-06 SSR 1 → 0.8, N 6.38 → 6.4로 되돌림 (침착이 너무 자주 나옴, 합 100). // 2026-11-03 시즌 5: SSR 0.8 → 1, N 6.4 → 6.38 (합 100). // 2026-10-31 SSR 1개·SR 4개·R 7개·N 10개 기준으로 합 100. // 등급 이름 2026-10-28 최상·상·중·하 → SSR·SR·R·N. // 특성 하나가 뽑힐 비율 (2026-10-28: 최상 1·상 3·중 6·하 9개라 합이 100, 하나당 최상 1% · 상 2% · 중 5% · 하 7%. 처음 1:2:3)
const TRAIT_DRAW = 3;     // 주머니에서 나오는 종이 수
const TRAIT_REROLLS = 1;  // 다시 뽑기 횟수

// ===== 세력 특성 (기획서 "세력 특성"): 역사에 근거한 작은 패시브. 세력 이름으로 찾는다 =====
// 숫자는 비율 (0.05 = 5%). 효과가 붙는 곳은 engine.js·아래 전투 공식에서 traitOf(세력id)로 읽는다
// 출진 금 (2026-11-03): 병력 1,000당 20, 천 단위 버림, 최소 20. 예: 500 → 20, 2,000 → 40, 10,000 → 200
const attackGoldOf = troops => Math.max(RULES.attackGold.min, Math.floor((troops || 0) / 1000) * RULES.attackGold.per1000);

// ===== 세력 특성을 지도 파일에 적기 (2026-11-06) =====
// 지도 파일의 세력에 trait: { name: '역발산기개세', fx: { attack: 0.10, draftPeace: 0.50 } } 를 적으면 그게 먼저 쓰인다.
// 없으면 아래 FACTION_TRAITS에서 세력 이름으로 찾는다. 고를 수 있는 효과는 TRAIT_FX뿐 (새 종류는 코드에 효과를 넣고 여기에 더한다)
// pct: 0.10 = 10%. max: 지도 편집기·서버가 받아 주는 크기 한도 (±)
const TRAIT_FX = [
  { key: 'attack', label: '공격 전투력', max: 0.3 },
  { key: 'defense', label: '수비 전투력', max: 0.3 },
  { key: 'cavalry', label: '기병 전투력', max: 0.3 },
  { key: 'cavalryDefense', label: '기병 수비 전투력', max: 0.3 },
  { key: 'infantry', label: '보병 전투력', max: 0.3 }, // 2026-11-06 새 효과
  { key: 'archer', label: '궁병 전투력', max: 0.3 }, // 2026-11-06 새 효과
  { key: 'draft', label: '징병량', max: 0.5 },
  { key: 'cavalryDraft', label: '기병 징병량', max: 0.5 },
  { key: 'draftPeace', label: '징병 치안 감소', max: 1 },
  { key: 'gold', label: '금 수입', max: 0.5 },
  { key: 'food', label: '군량 소비', max: 0.5 }, // 매달 먹는 군량과 출진 군량 둘 다 (2026-11-06)
  { key: 'comm', label: '상업 내정', max: 0.5 },
  { key: 'siege', label: '성벽 피해', max: 0.5 },
  { key: 'siegePrice', label: '병기 제작비', max: 0.5 },
  { key: 'shop', label: '상점 값', max: 0.5 },
  { key: 'exp', label: '모든 능력 경험치', max: 0.5 },
  { key: 'expInt', label: '지력 경험치', max: 0.5 },
  { key: 'trainExp', label: '수련 경험치', max: 0.5 },
  { key: 'retreatLoss', label: '함락·포위 때 병력 손실', max: 1 }, // 2026-11-06 새 효과: 성을 잃고 물러날 때 잃는 병력
  { key: 'move', label: '이동 거리', unit: '칸', int: true, max: 2 }, // 2026-11-06 새 효과: 이동 명령 칸 수 (군량 수송은 그대로)
  { key: 'peaceTurn', label: '모든 성 치안 매턴', unit: '', int: true, max: 5 }, // 2026-11-06 새 효과: 세력의 모든 성
  { key: 'freeTrain', label: '수련에 금이 들지 않음', flag: true },
];
// 효과 → 설명 글: { attack: 0.1, draftPeace: 0.5 } → "공격 전투력 +10%, 징병 치안 감소 +50%"
const traitDesc = fx => Object.keys(fx).map(k => TRAIT_FX.find(d => d.key === k)).filter(d => d && fx[d.key] !== 0 && fx[d.key] !== false) // 적힌 순서대로
  .map(d => (d.flag ? d.label : d.int ? `${d.label} ${fx[d.key] > 0 ? '+' : ''}${fx[d.key]}${d.unit}` : `${d.label} ${fx[d.key] > 0 ? '+' : ''}${Math.round(fx[d.key] * 1000) / 10}%`)).join(', ');
// 지도 파일에서 온 특성을 믿을 수 있는 모양으로: 아는 효과만, 한도 안에서. 이름이 없거나 효과가 없으면 null
function cleanTrait(t) {
  if (!t || typeof t !== 'object') return null;
  const fx = {};
  for (const k of Object.keys(t.fx || {})) { // 적힌 순서를 지킨다 (설명 글 순서)
    const d = TRAIT_FX.find(x => x.key === k);
    if (!d) continue;
    const v = t.fx && t.fx[d.key];
    if (d.flag) { if (v === true) fx[d.key] = true; continue; }
    const n = +v;
    if (Number.isFinite(n) && n !== 0) fx[d.key] = Math.max(-d.max, Math.min(d.max, d.int ? Math.round(n) : Math.round(n * 1000) / 1000));
    if (fx[d.key] === 0) delete fx[d.key];
  }
  const name = String(t.name || '').trim().slice(0, 12);
  return name && Object.keys(fx).length ? { name, fx } : null;
}
const FACTION_TRAITS = {
  마등: { name: '서량기병', desc: '기병 전투력 +5%', cavalry: 0.05 },
  공손찬: { name: '백마의종', desc: '기병 수비 전투력 +10%', cavalryDefense: 0.10 },
  조조: { name: '유재시거', desc: '모든 능력 경험치 +10%', exp: 0.10 },
  원소: { name: '사세삼공', desc: '징병량 +5%', draft: 0.05 }, // 2026-10-27 금 수입 +5%에서 바꿈 (명문가라 사람이 모임)
  유비: { name: '인덕', desc: '징병 치안 감소 -50%', draftPeace: -0.50 }, // 2026-10-27 -30%에서 (체감이 거의 없어서)
  손견: { name: '강동의 호랑이', desc: '공격 전투력 +5%', attack: 0.05 },
  손책: { name: '소패왕', desc: '공격 전투력 +5%', attack: 0.05 }, // 200년 지도 (손견과 같은 효과)
  동탁: { name: '미오성', desc: '금 수입 +5%', gold: 0.05 }, // 2026-10-27 징병 +5%에서 바꿈 (원소와 겹치지 않게)
  원술: { name: '옥새', desc: '상점 값 -10%', shop: -0.10 },
  유표: { name: '형주 학풍', desc: '지력 경험치 +25%', expInt: 0.25 }, // 2026-10-27 15%에서 올림
  유언: { name: '익주 천험', desc: '수비 전투력 +5%', defense: 0.05 },
  유장: { name: '익주 천험', desc: '수비 전투력 +5%', defense: 0.05 }, // 200년 지도 (유언과 똑같이)
  도겸: { name: '서주의 풍요', desc: '상업 내정 +5%', comm: 0.05 },
  장로: { name: '오두미도', desc: '군량 소비 -25%', food: -0.25 }, // 2026-11-05 시즌 5 -20% → -25% (2026-11-03 -15% → -20%, 성 1개 세력)
  엄백호: { name: '강동 호족', desc: '성벽 피해 +15%', siege: 0.15 },
  왕랑: { name: '경학대가', desc: '수련에 금이 들지 않고 수련 경험치 +20%', freeTrain: true, trainExp: 0.20 }, // 2026-10-27 수련 경험치 +20% 더함
  // 한국 지도 (2026-10-31)
  고려: { name: '벽란도', desc: '금 수입 +5%', gold: 0.05 },
  조선: { name: '신기전', desc: '병기 제작비 -20%', siegePrice: -0.20 },
  고구려: { name: '개마무사', desc: '기병 전투력 +5%, 기병 징병량 +5%', cavalry: 0.05, cavalryDraft: 0.05 },
  백제: { name: '오경박사', desc: '지력 경험치 +25%', expInt: 0.25 },
  마한: { name: '삼한 소도', desc: '징병 치안 감소 -50%', draftPeace: -0.50 },
  신라: { name: '화랑도', desc: '수련에 금이 들지 않고 수련 경험치 +20%', freeTrain: true, trainExp: 0.20 },
  가야: { name: '철의 왕국', desc: '성벽 피해 +15%', siege: 0.15 },
  탐라: { name: '절해고도', desc: '수비 전투력 +5%', defense: 0.05 },
  // 211년 지도 유비입촉 (2026-11-03, 시즌 5)
  손권: { name: '강동인재', desc: '징병량 +5%', draft: 0.05 },
  마초: { name: '서량기병', desc: '기병 전투력 +5%, 기병 징병량 +5%', cavalry: 0.05, cavalryDraft: 0.05 }, // 2026-11-03 기병 징병 +5% 더함 (고구려 개마무사와 같은 효과)
  사섭: { name: '남해 교역', desc: '금 수입 +15%', gold: 0.15 }, // 2026-11-05 +10% → +15% (2026-11-03 +5% → +10%, 성 1개 세력). 1·4·7·10월 정기 수입에만
};

// ===== 전투 =====
// 부대 하나: { name, troops, stats, type(병종) }
// 부대 전투력 = 병력(곡선) × (0.5 + 병종 능력치 ÷ 120) (2026-11-04 시즌 5: 0.4 + ÷100에서, 고점을 살짝 내림 · 70 vs 110 차이 36% → 31%. 2026-10-25 0.5에서 0.4로 낮췄었음)
function unitPower(u) {
  const ut = UNIT_TYPES[u.type], stat = ut ? u.stats[ut.stat] : u.stats.lea; // 수비대는 병종이 없다 (2026-11-14, 능력치는 모두 같음)
  const c = RULES.troopCurve, eff = u.troops > 0 ? c.ref * Math.pow(u.troops / c.ref, c.exp) : 0; // 병력 곡선
  return eff * (0.5 + stat / 120);
}
// 상성 보정: a가 b에게 강하면 1.2 (시즌 7부터 1.15). 약할 때 깎는 것은 없다 (너무 세서 뺐다)
function matchupOf(a, b) {
  const season = typeof S !== 'undefined' && S ? S.season || 1 : 1; // 전투 시뮬레이터처럼 S가 없으면 지금 값
  if (!UNIT_TYPES[a.type] || !UNIT_TYPES[b.type]) return 1; // 병종 없는 수비대는 상성을 주지도 받지도 않는다 (2026-11-14)
  if (UNIT_TYPES[a.type].beats === b.type) return 1 + (season >= 7 ? RULES.matchupS7 : RULES.matchup);
  return 1;
}
// 공격 전투력: 정란이 있으면 더 세다
// 세력 특성: 기병(마등), 출진 공격(손견)
// 무력 보너스: 병종과 상관없이 무력 1마다 전투력 +0.15% (10마다 +1.5%), 공격·수비 모두 (2026-11-06 시즌 6. 2026-11-04 시즌 5 20마다에서 10마다로. 2026-10-26 처음, 무력의 가치를 올리려고)
// 보병·궁병 전투력 (세력 특성, 2026-11-06). 기병은 cavalry로 따로
const unitTypeBonus = (t, type) => (type === '보병' ? 1 + (t.infantry || 0) : type === '궁병' ? 1 + (t.archer || 0) : 1);
const warBonus = u => 1 + (u.stats.war || 0) * RULES.warPer1; // 2026-11-06: 10 단위로 끊지 않고 1마다
const attackPower = (a, d) => {
  const t = traitOf(a.faction);
  return unitPower(a) * (d ? matchupOf(a, d) : 1) * (a.siege && a.siege.정란 ? 1 + SIEGE_EFFECT.towerAttack : 1)
    * warBonus(a)
    * (1 + (t.attack || 0)) * (a.type === '기병' ? 1 + (t.cavalry || 0) : 1) * unitTypeBonus(t, a.type)
    * (1 + (gTrait(a).attack || 0) + (gTrait(a).power || 0)); // 개인 특성: 용맹, 뼈에게 닿기를
};
// 수비 전투력 (성 방어도는 2026-11-06부터 여기 대신 받는 피해를 줄인다: wallCut)
// 세력 특성: 기병(마등·공손찬 수비), 수비 전투력(유언)
// 방어도 피해 감소 (2026-11-06): 성을 지키는 쪽이 보통 합에서 받는 피해 비율 (0.3 = 30% 덜 받음)
const wallCutStepped = () => Date.now() >= RULES.wallCutStepsFrom; // 구간제가 켜졌는지 (도움말 문구도 이걸 본다)
const wallCut = wall => {
  const w = Math.max(0, wall || 0);
  if (!wallCutStepped()) return Math.min(0.9, w / 100 * RULES.wallCutPer100);
  const st = RULES.wallCutSteps;
  let pct = 0;
  for (let i = 0; i * 100 < w; i++) pct += (st[Math.min(i, st.length - 1)]) * Math.min(1, (w - i * 100) / 100); // 100 단위 구간마다, 마지막 구간은 비례
  return Math.min(0.9, pct / 100);
};
const defensePower = (d, wall, a) => {
  const t = traitOf(d.faction);
  return unitPower(d) * (a ? matchupOf(d, a) : 1) * (1 + (t.defense || 0)) * warBonus(d) // 방어도는 2026-11-06부터 여기 대신 받는 피해를 줄인다 (wallCut)
    * (d.type === '기병' ? (1 + (t.cavalry || 0)) * (1 + (t.cavalryDefense || 0)) : 1) * unitTypeBonus(t, d.type)
    * (1 + (gTrait(d).defense || 0) + (gTrait(d).power || 0)); // 개인 특성: 뼈에게 닿기를 (철벽은 2026-11-07부터 받는 피해 감소: dmgCut)
};


// 일기토: 무력 높은 쪽이 이길 확률이 높다 (50% + 무력 차이 × 1%, 10~90%)
// 책략·돌격 병력 배율 (2026-11-07 시즌 6): 쓰는 쪽 병력이 5,000보다 적으면 피해가 줄어든다 (2천 명 0.76배). 5,000 이상은 1배
const troopScale = (u, R) => Math.min(1, Math.pow(Math.max(0, u.troops) / R.troopRef, R.troopExp));
// 일기토 승률 (2026-11-13 기획자, 시즌 7부터): 무력 차이 10까지는 1점당 1%, 10을 넘는 부분은 1점당 1.5% (최대 90%). 그 전: 1점당 1%
const duelWinRate = (myWar, theirWar) => {
  const d = myWar - theirWar, x = Math.abs(d);
  const v = seasonNow() >= 7 && x > 10 ? 10 + (x - 10) * 1.5 : x;
  return Math.min(0.9, Math.max(0.1, 0.5 + Math.sign(d) * v / 100));
};

// 공격 부대 하나와 수비 부대 하나가 남은 합 수(left)만큼 맞붙는다. 한쪽이 전멸하면 멈춘다.
// 병력을 직접 줄이고 { used(쓴 합 수), lines(합마다 한 줄), atkLost, defLost }를 돌려준다
// field: 야전 (2026-11-09, 시즌 7부터). 양쪽 다 공격 쪽 전투력, 성벽·철벽·세력 수비 특성 없음, 55도발·벽력거·정란·설득민수·관통맨 없음
const fieldPower = (u, foe) => attackPower({ ...u, siege: {} }, foe); // 야전에서는 병기(정란)가 힘을 못 쓴다
function fightRounds(att, def, wall, left, field = false) {
  if (field) wall = 0;
  const luck = () => 1 + (Math.random() * 2 - 1) * RULES.battleRandom;
  const a0 = att.troops, d0 = def.troops, lines = [];
  let used = 0, pierced = 0; // pierced: 개인 특성 관통맨이 합 중에 깎은 방어
  // 개인 특성 55도발 (2026-11-07 시즌 6): 공격 쪽이 수비 부대와 맞붙을 때마다 55% 판정. 성공하면 이 맞대결 동안 그 상대는 성벽(방어도) 효과를 못 받는다
  const taunted = !field && !!gTrait(att).taunt && def.troops > 0 && Math.random() < gTrait(att).taunt;
  if (taunted) lines.push(`🔥 ${att.name}의 도발! ${def.name} 부대가 성 밖으로 뛰쳐나왔다! (성벽 효과 없음)`);
  // 벽력거: 이번 출진에서 처음 맞붙는 수비 부대에게, 합을 시작하기 전에 선제 사격 (반격 없음, 합 수에 들지 않음)
  if (!field && att.siege && att.siege.벽력거 && !att.struck && def.troops > 0) {
    att.struck = true;
    const dLoss = Math.min(def.troops, Math.ceil(attackPower(att, def) * RULES.roundRate * SIEGE_EFFECT.firstStrike * luck()));
    def.troops -= dLoss;
    lines.push(`💥 벽력거 선제 사격! ${def.name} -${dLoss.toLocaleString('ko-KR')} (반격 없음)`);
  }
  while (used < left && att.troops > 0 && def.troops > 0) {
    used++;
    // 개인 특성 설득민수 (2026-10-28): 수비 쪽이 이번 합에 전투력이 밀리면 합마다 persuade(지금 4%) 확률로 상대가 설득당해 물러난다 (출진이 그대로 끝남)
    if (!field && gTrait(def).persuade && defensePower(def, wall, att) / (1 - wallCut(wall)) < attackPower(att, def) && Math.random() < gTrait(def).persuade) {
      att.persuaded = true;
      lines.push(`${used}합: 🗣 ${def.name}의 설득에 ${att.name}의 마음이 흔들렸다! ${att.name} 부대가 물러난다.`);
      break;
    }
    // 일기토: 양쪽 무력이 기준 이상이면 낮은 확률로. 이긴 쪽은 피해 없이, 진 쪽 부대만 크게 다친다
    // 개인 특성 빠뜨롱 나와: 어느 한쪽이라도 가지고 있으면 더 자주 벌어지고, 가진 쪽이 이길 확률 +15%p (2026-11-07)
    const D = RULES.duel, duelChance = D.chance + Math.max(gTrait(att).duelChance || 0, gTrait(def).duelChance || 0);
    if (!att.dueled && att.stats.war >= D.minWar && def.stats.war >= D.minWar && Math.random() < duelChance) {
      att.dueled = true; // 이번 출진에서는 더 일어나지 않는다
      const aRate = Math.min(0.95, Math.max(0.05, duelWinRate(att.stats.war, def.stats.war) + (gTrait(att).duelWin || 0) - (gTrait(def).duelWin || 0)));
      const aWin = Math.random() < aRate;
      const w = aWin ? att : def, l = aWin ? def : att;
      const loss = Math.min(Math.ceil(l.troops * D.lossCap), Math.ceil(w.stats.war * (D.lossPerWar[0] + Math.random() * (D.lossPerWar[1] - D.lossPerWar[0])) * (1 - (gTrait(l).calm || 0)))); // 침착: 진 쪽 피해 감소 · 진 쪽 병력의 50%까지 (2026-11-07)
      l.troops -= loss;
      w.duelWins = (w.duelWins || 0) + 1;
      l.duelLosses = (l.duelLosses || 0) + 1; // 분석용 기록 (2026-11-06)
      lines.push(`${used}합: ⚡ 일기토! ${w.name}(무력 ${w.stats.war}) 대 ${l.name}(무력 ${l.stats.war}) → ${w.name} 승리! ${l.name} 부대 -${loss.toLocaleString('ko-KR')}`);
      continue;
    }
    // 책략 (2026-10-26): 지력이 기준 이상이고 상대보다 높은 쪽이, 합마다 (지력 ÷ 20)% 확률로 (2026-11-03 시즌 5 ÷ 15에서) 보통 교전 대신 일방적으로 친다.
    // 피해 = (60~90) × 10 × ((지력 차이 + 5) ÷ 10)^0.6 (2026-11-04 시즌 5: 차이에 +5, 작은 차이의 저점을 올림). 병종·공수·수비대장 가리지 않음, 병력 상한 없음
    const C = RULES.scheme, ai = att.stats.int || 0, di = def.stats.int || 0;
    const sch = ai >= C.minInt && ai > di ? [att, def, ai - di] : di >= C.minInt && di > ai ? [def, att, di - ai] : null;
    if (sch && !att.schemed && Math.random() < sch[0].stats.int * C.chancePerInt) {
      att.schemed = true; // 책략도 출진 한 번(5합)에 최대 1번 (어느 쪽이 쓰든)
      const [me, foe, gap] = sch;
      const loss = Math.min(foe.troops, Math.round((C.base[0] + Math.random() * (C.base[1] - C.base[0])) * C.ref * Math.pow((gap + C.gapAdd) / C.ref, C.exp) * troopScale(me, C) * (1 - (gTrait(foe).calm || 0)))); // 침착: 책략 피해 감소 · 쓰는 쪽 병력 배율 (2026-11-07)
      foe.troops -= loss;
      me.schemes = (me.schemes || 0) + 1;
      const kind = C.kinds[Math.floor(Math.random() * C.kinds.length)];
      lines.push(`${used}합: ${kind}! ${me.name}(지력 ${me.stats.int})의 계책에 ${foe.name} 부대 -${loss.toLocaleString('ko-KR')}`);
      continue;
    }
    // 돌격 (2026-11-03 시즌 5): 책략의 무력 버전. 무력이 기준 이상이고 상대보다 높은 쪽이, 합마다 (무력 ÷ 20)% 확률로 (2026-11-03 시즌 5 ÷ 15에서) 보통 교전 대신 일방적으로 친다.
    // 피해 = (60~90) × 10 × ((무력 차이 + 5) ÷ 10)^0.6 (2026-11-04 시즌 5: 차이에 +5). 출진 한 번(5합)에 최대 1번 (책략과 따로 센다)
    const G = RULES.charge, aw = att.stats.war || 0, dw = def.stats.war || 0;
    const chg = aw >= G.minWar && aw > dw ? [att, def, aw - dw] : dw >= G.minWar && dw > aw ? [def, att, dw - aw] : null;
    if (chg && !att.charged && Math.random() < chg[0].stats.war * G.chancePerWar) {
      att.charged = true;
      const [me, foe, gap] = chg;
      const loss = Math.min(foe.troops, Math.round((G.base[0] + Math.random() * (G.base[1] - G.base[0])) * G.ref * Math.pow((gap + G.gapAdd) / G.ref, G.exp) * troopScale(me, G) * (1 - (gTrait(foe).calm || 0)))); // 침착: 돌격 피해 감소 · 쓰는 쪽 병력 배율 (2026-11-07)
      foe.troops -= loss;
      me.charges = (me.charges || 0) + 1;
      lines.push(`${used}합: 🐎 돌격! ${me.name}(무력 ${me.stats.war})의 돌격에 ${foe.name} 부대 -${loss.toLocaleString('ko-KR')}`);
      continue;
    }
    // 보통 합: 양쪽이 동시에 상대 병력을 줄인다
    const hitDef = field ? Math.ceil(fieldPower(att, def) * RULES.roundRate * luck()) : Math.ceil(attackPower(att, def) * RULES.roundRate * luck() * (1 - Math.min(0.9, (taunted ? 0 : wallCut(wall)) + (gTrait(def).dmgCut || 0)))); // 55도발 성공 시 방어도 효과 없음 (2026-11-07) // 성 방어도만큼 수비 쪽 피해 감소 (2026-11-06) + 개인 특성 철벽 (2026-11-07)
    const hitAtt = Math.ceil((field ? fieldPower(def, att) : defensePower(def, wall, att)) * RULES.roundRate * luck());
    const dLoss = Math.min(def.troops, hitDef), aLoss = Math.min(att.troops, hitAtt);
    def.troops -= dLoss;
    att.troops -= aLoss;
    lines.push(`${used}합: ${att.name} -${aLoss.toLocaleString('ko-KR')} · ${def.name} -${dLoss.toLocaleString('ko-KR')}`);
    // 개인 특성 관통맨 (2026-10-31): 보통 합에서 확률로 성벽에도 피해. 병력 손실이 없고, 다음 합부터 수비 보정이 줄어든다
    const P = gTrait(att).pierce;
    if (P && att.troops > 0 && wall > 0 && Math.random() < P.chance) {
      const hit = Math.min(wall, Math.floor(att.troops / P.per));
      if (hit > 0) { wall -= hit; pierced += hit; lines.push(`🔩 관통! 성벽 방어 -${hit.toLocaleString('ko-KR')}`); }
    }
  }
  return { used, lines, atkLost: a0 - att.troops, defLost: d0 - def.troops, pierced };
}

// ===== 계략 (지력) =====
// 이웃한 다른 세력 성에 쓴다. 지력이 높을수록 잘 되고, 성공하면 낮은 확률로 대성공(효과 2배) (임시값)
const PLOT = {
  successRate: int => Math.min(0.9, seasonNow() >= 7 ? 0.15 + int / 190 : int / 140), // 시즌 7부터 15% + 지력 ÷ 190 (2026-11-11 기획자, 지력 80이 지금과 같고 높을수록 내려간다. 시즌 7 패치노트). 그 전: 2026-11-08 시즌 6: ÷ 150 → ÷ 140 (패치노트 없음). 2026-11-03 시즌 5: 기본 +5%p 뺌 (2026-10-26에 넣었던 것). 지력 120이면 80%
  critRate: int => int / (seasonNow() >= 7 ? 600 : 500), // 시즌 7부터 ÷ 600 (2026-11-11 기획자). 그 전: 성공했을 때 그중 대성공 확률 (2026-11-03 시즌 5: ÷ 400 → ÷ 500)
  critMul: 1.5,                        // 대성공 효과 배수 (2026-10-26 2배 → 1.5배)
  get destroy() { return { wallPerInt: seasonNow() >= 7 ? [0.6, 0.8] : [0.8, 1] }; }, // 파괴: 방어 -(지력 × 0.8~1). 시즌 7부터 0.6~0.8 (2026-11-11 기획자 "계략이 너무 세다", 시즌 7 패치노트). 2026-11-04 시즌 5: × 1에서
  get rumor() { const r = seasonNow() >= 7 ? [0.12, 0.15] : [0.16, 0.2]; return { peacePerInt: r, devPerInt: r }; }, // 시즌 7부터 0.12~0.15 (2026-11-11 기획자, 시즌 7 패치노트). 유언: 치안·농업·상업 각각 -(지력 × 0.16~0.2), 셋을 따로 굴린다 (2026-11-04 시즌 5: 0.2에서. 2026-10-25 0.2 → 0.25, 2026-10-26 다시 0.2)
  get exp() { return seasonNow() >= 7 ? 30 : 40; }, get critExp() { return seasonNow() >= 7 ? 30 : 40; }, get spyExp() { return 30; }, get failExp() { return seasonNow() >= 7 ? 10 : 0; }, // 2026-11-14 기획자 시즌 7: 파괴·유언·첩보 모두 실패 10, 성공(대성공 포함) 30. 그 전:   // 첩보 성공 경험치 30 (2026-11-03 시즌 5, 40에서). 파괴·유언 성공하면 지력 경험치 40, 대성공도 40 (2026-11-03 시즌 5 60에서. 2026-10-27 30·50 → 40·60)
};
// 'fail' | 'ok' | 'crit'
function rollPlot(int, bonus = 0) { // bonus: 개인 특성 책사 +5%p (최대치 위로도 더한다)
  if (Math.random() >= PLOT.successRate(int) + bonus) return 'fail';
  return Math.random() < PLOT.critRate(int) ? 'crit' : 'ok';
}

// ===== 탐색 (임시값) =====
// weight: 일어날 확률(%) — 합계 100
// 탐색 사건 (확률 = weight%, 합 100). 2026-10-25 기획자 수치
const EXPLORE = [ // 2026-11-08 기획자: 금 18 → 15 · 특성 주머니 5 → 8 (레어 아님). 2026-11-07 시즌 6 기획자 표: 금 18 · 군량 18 · 의병 10 · 잔치 10 · 첩자 8(새로) · 보물 3(새로) · 달인 삭제 (합 100 = %)
  { key: 'none', weight: 10 }, // 2026-10-27 15 → 10 (2026-10-31 같은 날 8로 내렸다가 되돌림)
  // jackpot: 발견했을 때 그중 이 확률로 대박 (2026-10-31 금·군량·의병 양을 올림)
  { key: 'gold', weight: 15, min: 300, max: 600, jackpot: { rate: 0.2, min: 1000, max: 1500 } }, // 2026-11-08: 300~500 → 300~600 (패치노트 없음). 2026-11-07 시즌 6: 200~500 → 300~500
  { key: 'food', weight: 18, min: 1000, max: 2500, jackpot: { rate: 0.2, min: 3000, max: 5000 } }, // 2026-11-07 시즌 6: 500~1,000 → 1,000~2,500, 대박 2,000~4,000 → 3,000~5,000
  { key: 'troops', weight: 10, min: 1500, max: 3000 }, // 2026-11-08: 1,000~3,000 → 1,500~3,000 (패치노트 없음). 의병 합류 (지금 병종으로, 병사가 없으면 보병)
  { key: 'item', weight: 10 },                         // 장비 발견: 상점 장비 하나를 얻는다 (2026-10-31)
  { key: 'feast', weight: 10, peace: 10, min: 30, max: 50 }, // 마을 잔치 (2026-10-31): 그 성 치안 +10, 농업·상업 각각 +30~50 (최대치까지)
  { key: 'bandit', weight: 8, minRate: 0.05, maxRate: 0.10, goldMinRate: 0.15, goldMaxRate: 0.20, warExp: 20 }, // warExp: 병사로 싸웠을 때 무력 경험치 (2026-11-08). 병력 5~10% 또는 금 15~20% (2026-10-31 10 → 8%)
  { key: 'spy', weight: 8 },                           // 적 첩자 포획 (2026-11-07): 가장 가까운 적 성 중 하나의 정보가 우리 세력에 spyTurns턴 보인다
  { key: 'pouch', weight: 8 },                          // 특성 주머니 발견 (2026-10-28, 2026-10-31 2 → 5%, 2026-11-08 8%로 올리고 레어에서 뺌: ★ 없음). 3장 중 하나로 바꾸거나 지금 특성 유지. 다시 뽑기 1번
  { key: 'treasure', weight: 3 },                       // 레어: 보물 발견 (2026-11-07). 주인 없는 보물이 없으면 장비 발견으로 바뀐다
];

// 보물 (2026-11-07 시즌 6, 기획자 목록): 세상에 하나씩, 한 장수는 1개까지 (이미 있으면 탐색은 장비 발견, 빼앗을 땐 사라짐). 능력치 최대치(120)를 넘길 수 있다.
// 뽑을 때 가점이 높을수록 드물다 (pickWeight). 내 부대가 전투에서 전멸하면 보물마다 2% 실종(다시 탐색으로 나옴) · 3% 이긴 적 장수에게 넘어감
const TREASURES = {
  손자병법서: { stat: 'lea', bonus: 7 }, 병법이십사편: { stat: 'lea', bonus: 6 }, 맹덕신서: { stat: 'lea', bonus: 5 }, 육도: { stat: 'lea', bonus: 4 }, 삼략: { stat: 'lea', bonus: 3 },
  청룡언월도: { stat: 'war', bonus: 7 }, 방천화극: { stat: 'war', bonus: 6 }, 장팔사모: { stat: 'war', bonus: 5 }, 청공검: { stat: 'war', bonus: 4 }, 의천검: { stat: 'war', bonus: 3 },
  둔갑천서: { stat: 'int', bonus: 7 }, 태평요술서: { stat: 'int', bonus: 6 }, 주역: { stat: 'int', bonus: 5 }, 도덕경: { stat: 'int', bonus: 4 }, 남화경: { stat: 'int', bonus: 3 }, // 2026-11-13 시즌 7: 노자 → 도덕경, 장자 → 남화경 (TREASURE_RENAME)
};
const TREASURE_RULES = { pickWeight: { 3: 30, 4: 25, 5: 20, 6: 15, 7: 10 }, loseRate: 0.02, takeRate: 0.03, sellPer: 600, foundTurns: 5 }; // foundTurns: 보물이 있는데 또 찾으면 고를 시간 (턴, 시즌 7부터, 2026-11-10) · // 2026-11-07 기획자: 5%·5% → 3%·3%, 2026-11-08 실종만 3% → 2%. sellPer: 팔기 = 가점 × 600금 (2026-11-08)
const TREASURE_RENAME = { 노자: '도덕경', 장자: '남화경' }; // 옛 이름으로 가진 보물은 새 이름으로 읽는다
const treasuresOf = g => (g.treasures || []).map(n => TREASURE_RENAME[n] || n).filter(n => TREASURES[n]);

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
  정란: { price: 2000, desc: '수비 부대와 싸울 때 공격 전투력 +15%' },
  벽력거: { price: 4000, desc: '수비 부대와 싸우기 전에 선제 사격 (보통 한 합 피해의 50%, 반격 없음)' },
};
// 병기 만드는 값: 개인 특성 병기도 과학은 -20%
const siegePrice = (g, type) => Math.round(SIEGE[type].price * (1 + (traitOf(g.faction).siegePrice || 0) + (gTrait(g).siegePrice || 0))); // 조선 신기전, 개인 특성 병기도 과학
// 병기 효과 (임시값)
const SIEGE_EFFECT = {
  ramWall: 0.4,     // 충차: 성벽 공격으로 깎는 방어 +40% (같은 손실로 더 깎는다)
  towerAttack: 0.15, // 정란: 수비 부대와 싸울 때 공격 전투력 +15%
  get breakChance() { return seasonNow() >= 7 ? 0.4 : 0.5; }, // 부대가 전멸하면 병기가 부서질 확률 (2026-11-10 기획자: 시즌 7부터 50% → 40%, 시즌 7 패치노트)
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
const shopPrice = (g, name) => Math.round((RULES.shopPrice.base + RULES.shopPrice.step * gearCount(g, name)) * (1 + (traitOf(g.faction).shop || 0) + (gTrait(g).shop || 0))); // 원술 할인, 개인 특성 협상가

// 기본 능력치 + 상점 물건만 (최대치 120까지). 장비를 더 얻을 수 있는지는 이걸로 본다 (보물로 120을 넘겨도 장비 몫은 따로, 2026-11-07)
function gearStats(g) {
  const s = { ...g.stats };
  for (const [name, it] of Object.entries(SHOP)) s[it.stat] = Math.min(RULES.statMax, s[it.stat] + it.bonus * gearCount(g, name));
  return s;
}
// 장수의 실제 능력치: 기본 능력치 + 가진 상점 물건 (최대치 120을 넘지 않는다) + 보물 (넘길 수 있다)
function effStats(g) {
  const s = { ...g.stats };
  for (const [name, it] of Object.entries(SHOP)) s[it.stat] = Math.min(RULES.statMax, s[it.stat] + it.bonus * gearCount(g, name));
  for (const n of treasuresOf(g)) s[TREASURES[n].stat] += TREASURES[n].bonus; // 보물은 최대치를 넘길 수 있다 (2026-11-07)
  return s;
}
