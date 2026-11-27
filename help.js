'use strict';
// ===== 새 도움말 (2026-11-25, 기획자 지시서 ddang_s9_help_rebuild.md) =====
// 원칙: 지금 규칙만 설명한다 (예전 시즌과의 차이·폐지된 명령은 적지 않는다). 숫자는 모두 RULES 등 실제 상수에서 읽는다.
// 숨은 규칙(지역 이벤트가 쉬는 턴, 유대의 고정 피해, 장수 재생성 대기)은 적지 않는다.
// 구조: 대분류(HELP 카테고리) → 소항목(sub). 소항목마다 기본 설명(body) + 접히는 상세(detail) + 관련 항목(related) + 검색 별칭(keys)
// 부르는 법: helpDialog2() 목록·helpDialog2('army') 대분류·helpDialog2('army.siege') 소항목으로 바로·helpDialog2(3) 대분류 번호 (AI 자료용)
// 아직 관리자만 본다 (game.js의 #helpBtn). 일반 장수는 옛 helpDialog
function helpTopics() {
  const R = RULES, pct = v => Math.round(v * 100), sn = k => STATS.find(s => s.key === k).name, gName = ['', '소성', '중성', '대도시', '수도'];
  const C = R.commander, RA = R.raid, RI = R.rise, RN = R.ronin, RAr = R.roninArmy, T2 = R.tier2, B = R.bandit, BS = R.besiege, CP = R.capital, CU = R.catchUp;
  const ul = items => `<ul>${items.filter(Boolean).map(x => `<li>${x}</li>`).join('')}</ul>`;
  const table = (head, rows) => `<table class="oddsTable helpTable"><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;
  const link = (id, text) => `<button class="link" data-goto="${id}">${text}</button>`;
  const tbl = (k, text) => `<button class="link" data-table="${k}">${text}</button>`;
  const grades = [1, 2, 3, 4];
  const units = unitTypesNow(), base = units.filter(t => !unitTier2(t)), elite = units.filter(unitTier2);
  const sieges = siegeTypes();
  const useText = u => (u === '공수' ? '공격·수비' : u === '공' ? '공격' : '수비');
  // 병기 값 (2026-11-25 피드백): 기본 가격(SIEGE[t].price)을 먼저, 내 장수의 실제 구매가(siegePrice: 세력·장수 특성 할인)가 다르면 옆에 작게
  const myG = typeof me === 'function' ? me() : null;
  const siegePriceText = t => { const base = SIEGE[t].price, mine = myG ? siegePrice(myG, t) : base; return fmt(base) + (mine !== base ? ` <span class="dim small">(내 구매가 ${fmt(mine)})</span>` : ''); };
  const quest = `금 +${RN.quest[0]}~${RN.quest[1]}${RN.questFame ? `·명성 +${RN.questFame}` : ''}`;
  return [
    { id: 'start', icon: '🎯', title: '처음 시작하기', blurb: '목표·첫 행동·예약', subs: [
      { id: 'goal', title: '게임 목표', keys: ['천하통일', '목표'], body: `<p>장수 한 명을 키우며 여러 유저와 함께 하는 턴제 전략 게임이에요. 세력의 장수들이 힘을 모아 지도의 모든 성을 차지하면 <b>천하통일</b>로 시즌이 끝나요.</p>
        <p>세력에 들어가 통일을 돕는 길도 있고, 세력 밖의 <b>재야</b>로 독립해서 살아가는 길도 있어요.</p>`, related: ['faction.unify', 'ronin.basic'] },
      { id: 'create', title: '장수 만들기', keys: ['능력치', '주사위', '생성', '금낭'], body: `<p>이름·얼굴을 정하고 <b>통솔·무력·지력</b>을 굴려요 (한 항목 ${ROLL.min}~${ROLL.max}, 합 ${ROLL.total}). 그다음 장수 <b>특성</b>을 3장 중에서 하나 골라요.</p>
        ${ul(['<b>세 능력치 모두 전투에 쓰여요.</b> 통솔은 보병, 무력은 기병, 지력은 궁병 계열의 힘이에요. 주력 능력치에 맞는 병종을 고르세요.', '전투 밖에서는 통솔은 징병·치안, 무력은 축성, 지력은 농업·상업·계략에 쓰여요.', '셋의 평균이 높을수록 거느릴 수 있는 병력이 많아요.'])}`, related: ['general.stats', 'general.trait'] },
      { id: 'join', title: '세력 고르기와 재야', keys: ['임관', '세력 선택', '재야'], body: `<p>장수를 만들면 들어갈 <b>세력</b>을 골라 임관해요. 처음 ${R.joinCap.turns}턴 동안은 장수가 너무 많이 모인 세력은 고를 수 없어요.</p>
        <p>세력을 떠나면(하야) <b>재야</b>가 돼요. 재야는 세력 없이 의뢰·약탈·거병으로 살아가는 독립된 길이에요.</p>`, related: ['faction.join', 'ronin.basic'] },
      { id: 'turn', title: '턴과 명령 예약', keys: ['턴', '예약', '예약표', '시간', '밤'], body: `${ul([
        `1턴 = 실제 ${R.turnLength / MIN}분 = 게임 속 <b>1달</b>이에요. 밤 ${R.night.from}~${R.night.to}시에는 1턴이 ${R.night.turnLength / MIN}분이에요. 아래에서 말하는 "턴"과 "달"은 같은 뜻이에요.`,
        `<b>명령 예약표</b>에 ${R.queueSize}칸까지 명령을 넣어 두면, 접속하지 않아도 한 턴에 한 칸씩 실행돼요.`,
        '같은 턴의 명령은 <b>먼저 예약한 순서</b>대로 실행돼요.',
        '실행할 때 조건이 안 맞으면(금 부족 등) 그 턴은 <b>실패 → 대기</b>예요. 결과는 <b>기록</b> 창에서 봐요.'])}`, related: [] },
      { id: 'first', title: '첫 행동', keys: ['처음', '초보', '뭐부터'], body: `<p><b>세력 장수</b></p>${ul(['<b>내정</b>으로 머무는 성을 키워요. 금·군량 수입이 늘어요.', '<b>징병</b>으로 병사를 모아요.', '세력 상황을 보고 <b>방어 모드</b>로 성을 지키거나, <b>출진</b>으로 이웃 적 성을 공격해요.'])}
        <p><b>재야 장수</b></p>${ul(['<b>의뢰</b>·<b>탐색</b>으로 금과 명성을 모아요.', '필요하면 <b>모병</b>으로 병사를 모아 약탈·거병을 노려요.'])}`, related: ['city.domestic', 'army.draft', 'battle.defense', 'ronin.quest'] },
      { id: 'map', title: '지도 보기', keys: ['지도', '성 정보', '공백지', '색'], body: `${ul([
        '성 칸의 색은 그 성의 세력이에요. 색이 없는 칸은 <b>공백지</b>(주인 없는 땅), 회색은 <b>도적군</b>이 차지한 성이에요.',
        '성 이름 아래 ★ 수는 성 크기예요. 소성·중성·대도시·수도 순으로 커요.',
        '성을 누르면 성 정보가 나와요. 우리 성은 모두 보이고, 다른 세력 성은 <b>첩보</b>에 성공해야 내정·군량·장수가 보여요.'])}`, related: ['city.size', 'plot.spy'] },
    ] },
    { id: 'general', icon: '📊', title: '장수와 성장', blurb: '능력치·경험치·명성·특성', subs: [
      { id: 'stats', title: '능력치', keys: ['통솔', '무력', '지력', '능력치'], body: '<p>세 능력치 모두 전투에 쓰여요. 병종마다 힘을 내는 능력치가 달라서, 주력 능력치에 맞는 병종을 고르면 돼요.</p>' + table(['능력치', '전투', '전투 밖'], [
        ['<b>통솔</b>', '보병 계열 전투력', '징병·모병량, 치안 내정'],
        ['<b>무력</b>', `기병 계열 전투력, 단기접전, 돌격, <b>모든 병종</b> 전투력 보너스 (무력 10마다 +${Math.round(R.warPer1 * 10 * 1000) / 10}%)`, '축성 내정'],
        ['<b>지력</b>', '궁병 계열 전투력, 책략', '농업·상업 내정, 계략']])
        + `<p>장비·보물로 오른 값도 능력치에 들어가요. 능력치 최대는 ${R.statMax}이에요 (보물은 넘길 수 있어요).</p>`, related: ['army.units'] },
      { id: 'troops', title: '병력 상한과 징병량', keys: ['최대 병력', '병력 상한', '징병량'], body: `${ul([
        `<b>최대 병력</b> = 세 능력치 평균 × ${R.statV1.troopsPerAvg} - ${fmt(-R.statV1.troopsBase)}${R.statV1.meritTroops ? ` + 명성 × ${R.statV1.meritTroops} (명성으로 느는 몫은 최대 ${fmt(R.statV1.meritTroopsMax)})` : ''}.`,
        `<b>징병 1번</b>에 ${fmt(R.statV1.draftBase)} + 통솔 × ${R.statV1.draftPer.min}~${R.statV1.draftPer.max}명이 모이고 (무력·지력은 상관없어요), 명성 ${fmt(Math.round(1 / R.draftPerMerit))}마다 1명이 더 와요.`])}`, related: ['army.draft'] },
      { id: 'exp', title: '경험치와 성장', keys: ['경험치', '성장', '레벨업', '수련'], body: `<p>행동하면 관련 능력치의 <b>경험치</b>가 쌓이고, 다 차면 그 능력치가 1 올라요. 필요한 경험치는 ${R.expNeedBase} + 지금 능력치 × ${R.expNeedPer}예요.</p>`
        + table(['행동', '경험치'], [
          ['내정', `그 내정의 능력치 +${R.statExp.domestic} (최대치에서 하면 +${R.fullDev.exp})`],
          ['징병·모병', `통솔 +${R.statExp.draft}`],
          ['싸움 (출진·수비·약탈)', `병종의 능력치 +${R.statExp.battle}, 적 장수 부대를 물리치면 하나마다 +${R.statExp.win}`],
          ['성 점령·거병', `통솔 +${R.statExp.capture}`],
          ['계략 (파괴·유언·첩보)', `지력 +${PLOT.exp} (실패해도 +${PLOT.failExp})`],
          ['단기접전 승리·돌격·책략', `무력 +${R.duel.exp}·무력 +${R.charge.statExp}·지력 +${R.scheme.statExp}`],
          ['승급·증축', `병종 능력치 +${T2.upExp}·세 능력치 모두 +${R.expand.exp[1]}~${R.expand.exp[3]}`]]),
        detail: `<p><b>성장 보너스</b>: 시즌 ${CU.afterTurn}턴이 지나면, 명성 ${CU.minMerit} 이상 장수끼리 능력치 합(장비·보물 제외)을 비교해서 낮은 쪽이 경험치를 더 받아요.</p>`
          + table(['능력치 합 순위', '경험치'], CU.tiers.map(([p, m], i) => [`하위 ${i ? pct(CU.tiers[i - 1][0]) + '~' : ''}${pct(p)}%`, `×${m}`])), related: [] },
      { id: 'fame', title: '명성', keys: ['명성', '공적', '명성표'], body: `<p>장수의 활동과 업적을 나타내는 점수예요. 명령을 하거나 싸우면 쌓이고, 하야·약탈 같은 일로 줄어요. ${tbl('merit', '명성표')}</p>`
        + ul([`금 수입이 늘어요 (명성 ${fmt(Math.round(0.01 / R.meritIncome))}마다 +1%).`, `징병량이 늘어요 (명성 ${fmt(Math.round(1 / R.draftPerMerit))}마다 +1명).`, `대도독은 명성 ${fmt(C.minMerit)}, 거병은 명성 ${fmt(RI.minMerit)} 이상이어야 해요.`, `한 턴에 얻는 명성은 최대 ${R.meritTurnMax}이에요 (정복·증축 보상은 예외).`]), related: ['general.medal'] },
      { id: 'medal', title: '훈장', keys: ['훈장', '시즌 보상'], body: `<p>시즌이 끝날 때 세력과 상관없이 명성 상위 ${R.heroCount}명이 받아요. 하나마다 다음 시즌부터 통솔·무력·지력 +${R.medalBonus}로 시작해요 (최대 +${R.medalBonusMax}).</p>`, related: ['extras.hall'] },
      { id: 'trait', title: '특성', keys: ['특성', '세력 특성', '특성 주머니', 'SSR'], body: `${ul([
        `<b>장수 특성</b>: 장수를 만들 때 3장 중 하나를 골라요. 탐색 이벤트의 <b>특성 주머니</b>로 바꿀 기회를 얻어요. ${tbl('trait', '특성 확률표')}`,
        '<b>세력 특성</b>: 지도에 따라 세력마다 붙어 있어요. 세력 창에서 세력을 누르면 보여요.',
        '등급이 높다고 무조건 좋은 성능은 아니에요. 대신 더 재밌는 플레이를 할 수 있어요.'])}`, related: [] },
      { id: 'gear', title: '장비와 보물', keys: ['상점', '장비', '명마', '명검', '서적', '보물'], body: table(['', '장비', '보물'], [
        ['얻는 곳', '장수 창의 <b>상점</b>에서 금으로 (턴을 쓰지 않음), 탐색 이벤트', '탐색 이벤트, 적 성 함락에서 아주 드물게'],
        ['효과', `명마(통솔)·명검(무력)·서적(지력) 하나에 +${SHOP.명검.bonus}, 최대치(${R.statMax})까지`, '능력치 +3~+7, 최대치를 넘길 수 있음' + (TREASURES.적토마 && trOpen('적토마') ? '<br>적토마는 능력치 대신 이동 +1칸 (이동 명령만)' : '')],
        ['개수', '여러 개 (살 때마다 비싸짐)', '세상에 하나씩, 장수 한 명당 1개'],
        ['잃는 경우', '—', `내 부대가 전멸하면 사라지거나(${pct(TREASURE_RULES.loseRate)}%) 적에게 빼앗김(${pct(TREASURE_RULES.takeRate)}%)`]]), related: [] },
    ] },
    { id: 'economy', icon: '💰', title: '금과 군량', blurb: '수입·수확·지출·수송', subs: [
      { id: 'kinds', title: '금과 군량은 누구 것', keys: ['금', '군량', '개인 군량'], body: ul([
        '<b>금</b>은 장수 개인 것이에요. 내 명령에 내가 써요.',
        '<b>군량</b>은 성마다 따로 있어요. 그 성에 머무는 우리 세력 장수들의 병사가 함께 먹어요.',
        `<b>재야</b>는 성 군량 대신 <b>개인 군량</b>을 써요. ${link('ronin.army', '재야 모병')}`]), related: [] },
      { id: 'gold', title: '금 수입', keys: ['금 수입', '수입', '상업'], body: `<p>${R.goldMonths.join('·')}월에 들어와요. 내가 있는 성의 상업과 우리 세력 평균 상업을 ${pct(R.goldFloor.own)}:${pct(R.goldFloor.avg)}로 섞어서 정해요.</p>`
        + ul([`명성 ${fmt(Math.round(0.01 / R.meritIncome))}마다 +1%·세력 성 하나마다 +${Math.round(R.goldFloor.perCity * 1000) / 10}% (최대 +${pct(R.goldFloor.cityMax)}%)`, `대도독 +${pct(C.perkGold)}%·수도가 있는 세력 +${pct(CP.gold)}%`, `치안이 낮으면 줄고(${link('city.peace', '치안')}), 한 성에 장수가 정원보다 많으면 줄어요(${link('city.size', '성 크기')}).`, `최대 ${fmt(R.playerGoldMax)}까지 가질 수 있어요.`, '<b>재야는 정기 금 수입이 없어요.</b> 의뢰·탐색·약탈로 직접 벌어요.']),
        detail: R.lateGold ? `<p><b>중도 참가 지원금</b>: 시즌 도중에 이번 시즌 첫 장수를 만들면, 시즌이 시작한 뒤 ${R.lateGold.perTurns}턴마다 금 ${R.lateGold.gold}씩 쳐서 받고 시작해요 (최대 ${fmt(R.lateGold.max)}).</p>` : '', related: [] },
      { id: 'spend', title: '금 쓰는 곳', keys: ['지출', '비용'], body: table(['쓰는 곳', '금'], [
        ['징병', `${R.myGoldCost.draft} (정예 병종 ${fmt(T2.gold)})`], ['승급', `1,000명당 ${T2.upPer1000}`],
        ['출진', `병력 1,000명당 ${R.attackGold.per1000}`], ['병기', sieges.map(t => `${t} ${siegePriceText(t)}`).join('·')],
        ['계략 (파괴·유언·첩보)', `${R.myGoldCost.plot}`], ['증축', grades.slice(0, 3).map(k => `${gName[k]} ${fmt(R.expand.cost[k])}`).join('·')],
        ['군량 구매·상점', '고른 만큼'], ['재야: 탐색·모병·거병', `${R.myGoldCost.explore}·${R.myGoldCost.draft}·${fmt(RI.gold)}`]]), related: [] },
      { id: 'food', title: '군량 수확과 소비', keys: ['수확', '군량', '굶주림', '기아'], body: ul([
        `${R.harvestMonths.join('·')}월에 그 성 <b>농업</b>에 따라 수확해요 (치안이 낮으면 줄어요). 성 크기마다 쌓을 수 있는 양이 있어요.`,
        `병사는 머무는 성의 군량을 매달 먹어요: 100명당 ${pct(R.foodPerTroops)}, 정예 병종은 ${T2.food}배.`,
        `<b>모자라면</b> 그달 병력의 ${pct(R.starveLoss)}%가 흩어져요.`,
        `출진할 때 병력의 ${pct(R.marchFoodRate)}%만큼 출발한 성의 군량을 써요. 통솔 10마다 ${Math.round(R.statV1.leaMarchFood * 1000)}%씩 덜 써요.`]),
        detail: table(['성 크기', '군량 최대'], grades.map(k => [gName[k], fmt(R.foodMax[k])])), related: [] },
      { id: 'buy', title: '군량 구매와 수송', keys: ['군량 구매', '시세', '수송', '보급'], body: ul([
        `<b>군량 구매</b>: 금으로 머무는 성의 군량을 사요. 시세(금 1당 군량 ${R.foodBuy.min}~${R.foodBuy.max})는 매달 바뀌어요. 한 번에 금 ${fmt(R.foodBuy.goldMax)}까지.`,
        `<b>군량 수송</b>: 우리 땅으로 ${R.moveRange}칸 안의 우리 성과 군량을 주고받아요 (한 번에 최대 ${fmt(R.transportMax)}). 수도가 끼면 ${CP.transportRange}칸.`,
        `대도독은 어디에 있든 우리 성끼리 군량을 옮기는 <b>보급</b>을 할 수 있어요. ${link('faction.commander', '대도독')}`]), related: [] },
    ] },
    { id: 'city', icon: '🏯', title: '내정과 도시', blurb: '내정·성 크기·수비대·도적', subs: [
      { id: 'domestic', title: '내정', keys: ['농업', '상업', '축성', '치안', '내정'], body: table(['명령', '능력치', '효과', '최대치에서 하면'], [
        ['농업', sn(DOMESTIC.agri.stat), '군량 수확 증가', `군량 +(${sn('int')} × ${R.fullDev.reward.agri[1]})`],
        ['상업', sn(DOMESTIC.comm.stat), '금 수입 증가', `내 금 +(${sn('int')} × ${R.fullDev.reward.comm[1]})`],
        ['축성', sn(DOMESTIC.wall.stat), '방어 증가 (지킬 때 피해 감소)', `수비대 +(${sn('war')} × ${R.fullDev.reward.wall[1]})`],
        ['치안', sn(DOMESTIC.peace.stat), '수입·징병 회복, 도적 예방', '첩자 색출 기회']])
        + ul([`금 없이 1턴을 써요. 명성 +${R.merit.domestic} (최대치에서 하면 +${R.fullDev.merit}).`, `농업·상업·방어가 그 성의 처음 값보다 낮으면 효과가 ×${R.recoverBuff.mult}예요 (성 정보에 하늘색).`]), related: ['city.event', 'city.peace'] },
      { id: 'event', title: '탐색 이벤트', keys: ['탐색', '탐색 이벤트', '확률표', '의병', '잔치'], body: `<p>세력 장수가 내정을 하면 ${pct(R.s9cmd.domExplore)}% 확률로 <b>탐색 이벤트</b>가 함께 일어나요. 금·군량·의병·장비·마을 잔치·밀서 입수·특성 주머니·기술자·보물·현인의 가르침(경험치)을 얻거나, 가끔 도적을 만나요. ${tbl('explore-normal', '확률표')}</p>
        <p>재야는 <b>탐색</b> 명령으로 따로 찾아요. ${link('ronin.quest', '재야 탐색')}</p>`, related: [] },
      { id: 'peace', title: '치안', keys: ['치안', '첩자 색출', '징병 불가'], body: ul([
        `치안 ${R.peaceOk} 아래: 금 수입·수확 -${pct(1 - peaceIncome(R.peaceLow))}%, 징병 -${pct(1 - peaceDraft(R.peaceLow))}%.`,
        `치안 ${R.peaceLow} 아래: 금 수입·수확 -${pct(1 - peaceIncome(0))}%, <b>징병할 수 없어요</b>.`,
        `징병하면 모은 병사 ${R.draftPeacePerS7}명당 치안이 1 떨어져요. 치안이 낮으면 ${link('city.bandit', '도적')}이 나와요.`,
        `치안이 최대치일 때 치안 내정을 하면, 이 성에 적 첩보가 걸려 있을 때 ${pct(R.s9cmd.counterSpy)}% 확률로 <b>첩자 색출</b>: 적의 정보망을 끊고 명성 +${R.s9cmd.counterSpyMerit}.`]), related: ['plot.spy'] },
      { id: 'size', title: '성 크기', keys: ['소성', '중성', '대도시', '수도', '정원', '성 크기'], body: table(['', ...grades.map(k => gName[k])], [
        ['농업·상업 최대', ...grades.map(k => fmt(R.devMax.agri[k]))],
        ['방어 최대', ...grades.map(k => fmt(R.devMax.wall[k]))],
        ['군량 최대', ...grades.map(k => fmt(R.foodMax[k]))],
        ['장수 정원', ...grades.map(k => R.crowdCap[k] + '명')],
        ['수비대 최대', ...grades.map(k => fmt(R.guardMax[k]))],
        ['정예 병종', ...grades.map(k => (k >= T2.gradeMin ? '○' : '×'))]])
        + `<p><b>정원</b>: 한 성에 머무는 우리 장수가 정원을 넘으면 그 성 장수 모두의 금 수입 중 상업 몫이 줄어요.</p>`, related: ['city.expand'] },
      { id: 'expand', title: '증축과 수도', keys: ['증축', '수도', '천도'], body: ul([
        `농업·상업·방어·치안이 모두 최대치의 ${pct(R.expand.ready)}% 이상인 우리 성을 한 단계 키워요 (금 ${grades.slice(0, 3).map(k => `${gName[k]} ${fmt(R.expand.cost[k])}`).join('·')}). 명성과 세 능력치 경험치를 얻어요.`,
        '대도시를 키우면 <b>수도</b>가 돼요. 세력당 하나라서, 이미 수도가 있으면 수도를 옮겨요(천도).',
        `수도가 있는 세력: 금 수입 +${pct(CP.gold)}%·모든 성 수확 +${pct(CP.food)}%·수도에서 징병 +${pct(CP.draft)}%. 수도는 적 계략 성공률 -${pct(CP.plotResist)}%p, 수비대가 매달 +${CP.guardRegen}.`,
        `수도를 빼앗기면 대도시로 내려가고 우리 모든 성 치안 -${CP.lossPeace}.`]), related: [] },
      { id: 'guard', title: '수비대', keys: ['수비대', '수비대장', '수비대 징병'], body: ul([
        `세력 성을 지키는 NPC 부대예요. 처음에 ${grades.slice(0, 3).map(k => `${gName[k]} ${fmt(R.guardTroops[k])}`).join('·')}명이 있어요. 모든 능력치 ${R.guardStat}, 병종 없음, 군량을 먹지 않아요.`,
        '<b>수비대 징병</b>: 징병 창에서 체크하면 모은 병사가 내 병력 대신 수비대에 들어가요. 내 병력이 가득일 때 넘친 병사도 수비대로 가요.',
        `장수가 없는 세력의 수비대는 매달 ${R.guardRegen}씩 처음 수까지 되찾아요. 한 번 전멸하면 다시 생기지 않아요.`,
        `장수가 지키는 ${link('battle.defense', '방어 모드')}와 함께 병력 많은 순서로 막아요.`]), related: [] },
      { id: 'bandit', title: '도적과 도적군', keys: ['도적', '도적군', '치안'], body: `<p><b>도적</b>은 치안이 낮은 성에 매달 확률로 나타나는 사건이에요 (치안 ${B.chance.map(([b, c]) => `${b} 미만 ${Math.round(c * 1000) / 10}%`).join('·')}).</p>`
        + ul([`치안 -${B.peace[0]}~${B.peace[1]}, 그 성 장수 병력·수비대 -${B.troops[0]}~${B.troops[1]}%.`, `지킬 병사가 없으면 방어가 -${B.wall[0]}~${B.wall[1]} 깎이고, 0이 되면 <b>도적군</b>이 성을 차지해요. 그 세력 장수 명성 -${B.merit} (대도독 -${B.meritCmd}).`])
        + `<p><b>도적군</b>은 성을 차지하고 앉은 NPC예요. 공격하지 않고, 되찾아도 멸망 보상은 없어요. 재야는 도적군 성에서 ${link('ronin.rise', '거병')}할 수 있어요.</p>`, related: [] },
      { id: 'siege', title: '포위', keys: ['포위'], body: ul([
        `이웃 성이 모두 적 성이고 최근 ${BS.window}달 중 ${BS.hits}달 이상 공격받은 성은 <b>포위</b>돼요.`,
        `포위 중: 내정 효과 ×${BS.devMul}, 매달 그 성 병사·수비대 -${pct(BS.troopLoss[0])}~${pct(BS.troopLoss[1])}%.`,
        `${BS.quiet}달 동안 공격이 없거나 이웃에 적이 아닌 성이 생기면 풀려요.`]), related: [] },
      { id: 'region', title: '지역 이벤트', keys: ['풍작', '가뭄', '민란', '역병', '지진', '지역 이벤트'], body: `<p>가끔 지역마다 ${R.regionEvents.map(e => e.icon + ' ' + e.name).join('·')} 같은 일이 일어나 그 지역 성의 수치가 바뀌어요.</p>`, related: [] },
    ] },
    { id: 'army', icon: '🪖', title: '병종과 병기', blurb: '징병·정예·승급·병기', subs: [
      { id: 'draft', title: '징병', keys: ['징병', '병종 변경', '해산'], body: ul([
        `금 ${R.myGoldCost.draft}으로 병사를 모아요. 모이는 수는 ${link('general.troops', '징병량')}을 봐요.`,
        '<b>다른 병종을 모으면 지금 병력은 모두 해산해요.</b>',
        `치안 ${R.peaceLow} 아래인 성에서는 징병할 수 없어요.`]), related: ['city.guard'] },
      { id: 'units', title: '병종', keys: ['보병', '기병', '궁병', '중보병', '중기병', '노병', '정예', '상성'], body: `<p><b>기병 → 보병 → 궁병 → 기병</b> 순으로 상대에게 강해요 (상성 전투력 +${pct(R.matchupS7)}%). 정예 병종도 같은 계열의 상성을 그대로 받아요.</p>`
        + table(['능력치', '기본 병종', '정예 병종', '정예 효과'], base.map(b => { const e = elite.find(t => UNIT_TYPES[t].base === b); return [sn(UNIT_TYPES[b].stat), b, e || '—', e ? UNIT_TYPES[e].desc : '—']; }))
        + table(['', '기본 병종', '정예 병종'], [['징병 금', fmt(R.myGoldCost.draft), fmt(T2.gold)], ['군량', '100명당 ' + pct(R.foodPerTroops), `${T2.food}배`], ['모으는 곳', '어디서나', `${gName[T2.gradeMin]} 이상 성`]])
        + '<p>정예 병종은 상위 호환이 아니라, 돈과 군량을 더 쓰는 대신 특기가 붙은 병종이에요.</p>',
        // 정예 효과의 적용 범위 (2026-11-25 전투 코드 rules.js attackPower·defensePower·fightRounds와 대조). 이름·수치는 UNIT_TYPES에서 읽는다 (효과 종류 dmgCut·dmgUp·charge·scheme로 문장을 고른다)
        detail: ul(elite.map(t => { const u = UNIT_TYPES[t], head = `<b>${u.desc}</b>(${t})`;
          if (u.dmgCut) return `${head}: 서로 맞붙는 보통 합(공성·수비·야전·약탈 교전)에서 받는 병력 피해에만 붙어요. 단기접전·책략·돌격·벽력거 사격, 성벽을 공격할 때 잃는 병력, 도적·포위·굶주림으로 잃는 병력에는 붙지 않아요.`;
          if (u.dmgUp) return `${head}: 보통 합에서 주는 병력 피해에만 붙어요. 단기접전·책략·돌격·벽력거 사격, 성벽(방어) 깎기에는 붙지 않아요.`;
          if (u.charge || u.chargeDmg) return `${head}: 돌격에만 붙어요. 무력이 돌격 조건(${R.charge.minWar})에 못 미치면 효과가 없어요.`;
          if (u.scheme || u.schemeDmg) return `${head}: 책략에만 붙어요. 지력이 책략 조건(${R.scheme.minInt})에 못 미치면 효과가 없어요.`;
          return ''; })), related: ['battle.skill'] },
      { id: 'upgrade', title: '승급', keys: ['승급', '정예'], body: `<p>징병 창의 <b>정예</b> 탭에서 해요. 지금 기본 병종 병력을 해산하지 않고 같은 계열 정예 병종으로 바꿔요 (보병 → 중보병). ${gName[T2.gradeMin]} 이상 성에서만, 1,000명당 금 ${T2.upPer1000}. 1턴을 써요.</p>`, related: [] },
      { id: 'siege', title: '병기', keys: ['병기', '충차', '정란', '연노', '벽력거', '내구도'], body: `<p>병기는 부대에 하나 갖추는 장비예요. 공격·수비 목적에 맞게 골라요.</p>`
        + table(['병기', '쓰는 때', '금', '효과'], sieges.map(t => [`<b>${t}</b>`, useText(SIEGE[t].use), siegePriceText(t), SIEGE[t].desc]))
        + '<p class="dim small">세력·장수 특성에 따라 실제 구매 가격이 달라질 수 있어요.</p>'
        + ul([`<b>내구도 ${SIEGE_EFFECT.durMax}</b>: 효과가 나올 때마다 1씩 닳고 0이 되면 사라져요.`, '부대마다 하나만. 다른 병기를 만들면 갖고 있던 병기는 사라져요.', `부대가 전멸하거나 성이 점령당하면 ${pct(SIEGE_EFFECT.breakChance)}% 확률로 부서져요.`]),
        detail: ul(['내구도가 닳는 때: 충차 = 성벽 공격 1번·정란 = 수비 부대 하나와 싸운 1번·연노 = 공격 부대 하나와 싸운 1번·벽력거 = 사격 1번',
          '<b>벽력거</b>: 공격할 때는 출진 한 번에 처음 맞붙는 수비 부대에게, 수비할 때는 턴마다 처음 맞붙는 공격 부대에게 1번 쏴요. 양쪽 다 있으면 공격 쪽이 먼저 쏴요. 반격은 없어요.',
          '<b>연노</b>는 방어 모드로 성을 지킬 때만, <b>정란·충차</b>는 공격할 때만 효과가 나요. 야전에서는 병기가 효과가 없어요.',
          `탐색 이벤트의 <b>기술자</b>를 만나면 병기 내구도를 ${SIEGE_EFFECT.durFix[0]}~${SIEGE_EFFECT.durFix[1]} 되찾거나 강화(부서질 때 1번 버팀)해요. 병기가 없으면 하나를 얻어요.`]), related: ['battle.march'] },
    ] },
    { id: 'battle', icon: '⚔', title: '전투', blurb: '방어·이동·출진·공성', subs: [
      { id: 'flow', title: '전투 흐름', keys: ['전투', '흐름', '합'], body: `<ol><li><b>출진</b>으로 이웃 성을 공격해요.</li><li>같은 턴에 서로 출진했다면 들판에서 <b>야전</b>부터.</li><li>성에서는 수비대·방어 모드 장수와 최대 <b>${R.roundsMax}합</b>을 싸워요.</li><li>수비 부대를 다 쓰러뜨리면 <b>성벽</b>을 공격해요.</li><li>방어가 0이 되면 <b>점령</b>이에요.</li></ol>
        <p>병력이 모자라면 합 안에 수비 부대를 다 못 쓰러뜨리고 돌아오고, 그 사이 잃은 병력은 돌아오지 않아요.</p>`, related: [] },
      { id: 'defense', title: '수비와 방어 모드', keys: ['방어 모드', '수비', '방어'], body: ul([
        `장수 창의 <b>방어 모드</b>를 켜 두면 내가 있는 성이 공격받을 때 앞장서서 막아요. 한 성에 ${R.defenseMax}명까지.`,
        '수비대와 방어 모드 장수가 <b>병력 많은 순서</b>로 막아요. 수비 장수가 쓰러지면 방어를 끈 장수 중 병력 많은 장수가 자동으로 켜져요.',
        `성을 지키는 부대는 방어가 높을수록 보통 합에서 받는 피해가 줄어요 (방어 500이면 -${pct(wallCut(500))}%, 1,000이면 -${pct(wallCut(1000))}%).`,
        '<b>성이 떨어지면</b> 그 성 장수는 이웃 우리 성으로 물러나요.']),
        detail: ul([`방어를 끈 채 물러나면 병력 -${pct(R.defenseOffLoss.min)}~${pct(R.defenseOffLoss.max)}%.`, `이웃에 우리 성이 없으면(고립) 가장 가까운 우리 성으로 가며 병력 -${pct(R.isolatedLoss)}%.`, '방어 효과는 단기접전·책략·돌격·벽력거에는 통하지 않아요.']), related: ['army.siege'] },
      { id: 'move', title: '이동', keys: ['이동', '옮기기'], body: ul([
        `우리 땅으로 이어진 ${R.moveRange}칸 안의 <b>우리 성</b>으로 옮겨요. 금·군량 없이 1턴을 쓰고 명성 +${R.merit.move}.`,
        '적 성이나 공백지를 지나서는 갈 수 없어요. 병력은 그대로 데려가요.']),
        detail: ul(['옮겨 간 성에 방어 모드 장수가 이미 가득이면 내 방어 모드는 꺼져요.', '특성에 따라 더 멀리 가거나, 우리 땅이 끊겨도 갈 수 있어요.', `재야는 누구 땅이든 ${RN.moveRange}칸까지 이동해요.`]), related: ['battle.march', 'ronin.basic'] },
      { id: 'march', title: '출진', keys: ['출진', '공격', '먼 길', '쿨타임', '시즌 시작 보호'], body: ul([
        `이웃 성을 공격해요. 금 = 병력 1,000명당 ${R.attackGold.per1000}, 군량 = 병력의 ${pct(R.marchFoodRate)}% (출발한 성에서, 통솔이 높으면 덜 써요).`,
        `출진하면 ${R.attackCooldown}턴 뒤에 다시 출진할 수 있어요 (예약 칸도 막혀요).`,
        `<b>먼 길</b>(출진 창에 "(먼 길)"이 붙은 성)로 공격하면 금·군량 ×${R.farMarch.mult}.`,
        '공백지는 싸우지 않고 들어가요. 동맹 세력의 성은 공격할 수 없어요.',
        `<b>시즌 시작 보호</b>: 시즌이 시작되고 ${R.openProtect.turns}턴 동안은 다른 세력의 성을 공격할 수 없어요 (공백지·도적군 성은 돼요).`]), related: [] },
      { id: 'field', title: '야전', keys: ['야전', '맞출진'], body: ul([
        '같은 턴에 두 성이 <b>서로를 향해 출진</b>하면 들판에서 먼저 1:1로 맞붙어요 (예약 순서대로).',
        `성벽이 없어 양쪽 모두 공격하는 쪽으로 싸워요. 야전을 다 이기면 남은 합으로 상대 성을 공격해요 (합쳐 ${R.roundsMax}합).`,
        '55도발·병기·설득민수·관통맨은 야전에서 통하지 않아요.']), related: [] },
      { id: 'capture', title: '공성과 점령', keys: ['공성', '성벽', '점령', '함락'], body: ul([
        `수비 부대를 다 쓰러뜨리면 성벽을 공격해요. 남은 병력의 ${pct(R.siegeRate.min)}~${pct(R.siegeRate.max)}%만큼 방어를 깎고, 그 ${R.siegeLoss}배의 병력을 잃어요.`,
        `<b>방어가 0이 되면 점령</b>. 점령한 장수는 금 ${fmt(R.battleReward)}을 받아요 (${R.recaptureGold.turns}턴 안에 주인이 바뀐 성이면 절반).`]),
        detail: ul([`점령한 성은 군량이 ${pct(R.captureKeep.min)}~${pct(R.captureKeep.max)}%만 남고(최소 ${fmt(R.captureFoodMin)}), 농업·상업·치안이 깎이고, 방어는 ${grades.slice(0, 3).map(k => `${gName[k]} ${R.captureWall[k]}`).join('·')}로 다시 세워져요.`, `${R.captureRepeatTurns}턴 안에 다시 함락된 성은 농업·상업이 덜 깎여요.`]), related: [] },
      { id: 'skill', title: '전투 기술', keys: ['단기접전', '책략', '돌격', '일기토'], body: ul([
        `<b>단기접전</b>: 양쪽 무력 ${R.duel.minWar} 이상이면 합마다 가끔. 이긴 쪽은 피해가 없고 진 쪽만 크게 잃어요.`,
        `<b>책략</b>(지력)·<b>돌격</b>(무력): ${R.scheme.minInt} 이상이면 상대보다 낮아도 합마다 가끔 일방적으로 쳐요. 능력치가 높을수록 자주, 차이가 클수록 아파요.`,
        '셋 다 출진 한 번에 한 번까지예요.']),
        detail: `<p>합마다 발동 확률은 능력치 ÷ ${Math.round(1 / R.scheme.chancePerInt)}이에요 (90이면 ${Math.round(90 * R.scheme.chancePerInt * 1000) / 10}%). 양쪽 다 쓸 수 있으면 능력치가 높은 쪽이 먼저 기회를 잡아요. 특성·정예 병종이 확률이나 피해를 바꿀 수 있어요.</p>`, related: ['army.units'] },
      { id: 'loss', title: '전멸과 잃는 것', keys: ['전멸', '패배', '손실'], body: ul([
        '내 부대가 전멸하면 그 싸움은 끝이에요.',
        `갖고 있던 병기는 ${pct(SIEGE_EFFECT.breakChance)}% 확률로 부서지고, 보물은 ${pct(TREASURE_RULES.loseRate)}% 사라지거나 ${pct(TREASURE_RULES.takeRate)}% 빼앗겨요.`]), related: [] },
    ] },
    { id: 'plot', icon: '🎭', title: '계략과 첩보', blurb: '파괴·유언·첩보·색출', subs: [
      { id: 'plots', title: '계략', keys: ['계략', '파괴', '유언', '대성공'], body: table(['계략', '대상', '효과'], [
        ['<b>파괴</b>', '이웃 적 성', `방어 -(지력 × ${PLOT.destroy.wallPerInt[0]}~${PLOT.destroy.wallPerInt[1]})`],
        ['<b>유언</b>', '이웃 적 성', `치안·농업·상업 각각 -(지력 × ${PLOT.rumor.peacePerInt[0]}~${PLOT.rumor.peacePerInt[1]})`]])
        + ul([`금 ${R.myGoldCost.plot} (실패해도 들어요). 성공률 약 ${pct(PLOT.successRate(60))}%(지력 60) ~ ${pct(PLOT.successRate(100))}%(지력 100).`, `가끔 <b>대성공</b>: 효과 ×${PLOT.critMul}.`, '동맹 세력에는 쓸 수 없어요.']),
        detail: `<p>성공률 = ${pct(PLOT.successRate(0))}% + 지력 ÷ ${Math.round(1 / (PLOT.successRate(1) - PLOT.successRate(0)))} (최대 90%). 성공했을 때 대성공 확률 = 지력 ÷ ${Math.round(1 / PLOT.critRate(1))}. 수도는 적 계략 성공률 -${pct(CP.plotResist)}%p.</p>`, related: [] },
      ...(cmdOn('spy') ? [{ id: 'spy', title: '첩보', keys: ['첩보', '정보'], body: ul([
        `${spyRange()}칸 안의 다른 세력 성에 첩자를 보내 농업·상업·방어·치안·군량·수비대·장수를 알아내요. 금 ${R.myGoldCost.plot}.`,
        `성공하면 ${R.spyTurns}턴 동안 <b>우리 세력 모두</b>가 그 성을 자세히 봐요. 동맹 세력에도 쓸 수 있어요.`]), related: ['plot.counter'] }] : []),
      { id: 'counter', title: '첩자 색출', keys: ['첩자 색출', '색출'], body: `<p>치안이 최대치인 성에서 치안 내정을 하면, 그 성에 적 첩보가 걸려 있을 때 ${pct(R.s9cmd.counterSpy)}% 확률로 적의 정보망을 끊어요 (명성 +${R.s9cmd.counterSpyMerit}).</p>`, related: ['city.peace'] },
    ] },
    { id: 'faction', icon: '🚩', title: '세력과 외교', blurb: '임관·대도독·동맹·통일', subs: [
      { id: 'join', title: '임관·하야·해고', keys: ['임관', '하야', '해고', '임관 제한'], body: ul([
        `<b>임관 제한</b>: 처음 ${R.joinCap.turns}턴 동안은 전체 장수의 ${pct(R.joinCap.rate)}% 이상이 모인 세력에 새로 들어갈 수 없어요.`,
        `<b>하야</b>: 세력을 떠나 그 성에 재야로 남아요. <b>명성 -${pct(R.resignMeritCut)}%, 병력은 해산하고</b>, ${R.rejoinWait}턴 동안 어느 세력에도 임관할 수 없어요.`,
        `<b>해고</b>: 대도독이 ${C.fireOffline / HOUR}시간 넘게 접속하지 않은 장수를 재야로 보내요. 명성은 그대로, 다시 들어가는 대기는 없어요.`]),
        detail: `<p>임관 제한은 세력에 든 장수가 모두 ${R.joinCap.minTotal}명 이상일 때부터 적용되고, 성이 남은 세력이 ${R.joinCap.offAt}개 이하가 되면 없어요.</p>`, related: ['ronin.basic'] },
      { id: 'commander', title: '대도독', keys: ['대도독', '공지', '방침', '보급', '위임', '반납'], body: ul([
        `세력마다 한 명. 명성 ${fmt(C.minMerit)} 이상, 세력 장수 ${C.minMembers}명 이상이면 <b>도독직 수락</b>으로 올라요 (세력의 첫 대도독은 세력 명성 1위만).`,
        `<b>혜택</b>: 병력 상한 +${fmt(C.perkTroops)}, 금 수입 +${pct(C.perkGold)}%.`,
        `<b>권한</b>: 📌 공지·🧭 방침(지도에 🛡·🗡 표시)·🤝 동맹·🚚 보급·🚪 해고·위임·반납. 다른 장수에게 명령을 내리지는 못해요.`,
        `<b>방침 효과</b>: 🛡 방어할 성은 지키는 쪽이 받는 피해 -${pct(C.policyFx.def)}%, 🗡 공격 목표로 출진하면 공격력 +${pct(C.policyFx.atk)}% (야전 포함). 효과는 바꾼 뒤 ${C.policyFx.delay}턴이 지나야 켜져요. 대도독이 없어지면 방침도 사라져요.`]),
        detail: ul([`위임: 명성 ${fmt(C.minMerit)} 이상인 같은 세력 장수에게. 받는 장수가 ${C.handWait / HOUR}시간 안에 수락해야 넘어가요.`, `직접 반납하면 ${C.resignWait}턴 동안 다시 못 맡아요 (위임은 괜찮아요).`, `${C.offline / HOUR}시간 넘게 접속하지 않거나, 명성·인원 조건이 깨지면 자리를 잃어요.`, '보급: 어디에 있든 우리 성 A에서 B로 군량을 옮겨요 (A·B는 우리 땅으로 이어진 가까운 성). 한 턴을 써요.']), related: ['faction.ally'] },
      { id: 'ally', title: '동맹', keys: ['동맹', '파기', '외교'], body: ul([
        `양쪽 대도독이 맺어요. 기간 ${C.allyMin}~${C.allyMax}턴, 세력당 ${C.allyMax2}개까지.`,
        '동맹 중에는 서로 <b>출진·파괴·유언</b>을 못 해요. 첩보는 돼요.',
        '동맹을 맺어도 양쪽 모두 적대 세력이 하나 이상 남아 있어야 해요.',
        `<b>파기</b>하면 ${C.allyBreakTurns}턴 뒤에 풀리고, 파기한 세력 장수 모두 명성 -${C.allyBreakMerit} (대도독 -${C.allyBreakMeritCmd}). 기간이 끝나 풀리면 벌칙은 없어요.`]), related: [] },
      { id: 'unify', title: '멸망과 천하통일', keys: ['멸망', '천하통일', '통일', '정복'], body: ul([
        '세력의 마지막 성이 떨어지면 <b>멸망</b>이에요. 그 세력 장수는 병력이 해산하고 재야가 돼요.',
        '멸망시킨 세력의 장수 모두 명성·금·경험치 보상을 받아요. 망한 세력 장수가 많을수록 크고, 우리 세력 인원이 많을수록 줄어요.',
        '세력이 하나만 남으면 <b>천하통일</b>로 시즌이 끝나요. 남은 도적군 성은 저절로 흡수돼요.']), related: ['general.medal'] },
    ] },
    { id: 'ronin', icon: '🏴', title: '재야 생활', blurb: '의뢰·모병·약탈·거병', subs: [
      { id: 'basic', title: '재야의 기본', keys: ['재야', '재야 채팅'], body: `<p>재야는 세력에 들지 않고 혼자 살아가는 <b>독립된 플레이</b>예요. 하야·해고·멸망하면 그 성에 재야로 남아요.</p>`
        + ul([`누구 땅이든 ${RN.moveRange}칸까지 이동해요.`, '<b>정기 금 수입이 없어요.</b> 의뢰·탐색·약탈로 직접 벌어요.', '재야끼리는 <b>재야 채팅</b>을 써요.', '재야 명령은 따로 있어요: 이동·탐색·의뢰·모병·군량 구매·약탈·거병·임관.']), related: ['ronin.join'] },
      { id: 'quest', title: '탐색과 의뢰', keys: ['재야 탐색', '의뢰', '현인', '주민 돕기'], body: ul([
        `<b>탐색</b>: 금 ${R.myGoldCost.explore}. 금·현인(경험치)·주민 돕기(명성)·의병·장비·특성 주머니·보물을 찾거나 도적을 만나요. ${tbl('explore-ronin', '재야 확률표')}`,
        `<b>의뢰</b>: 머무는 성에서 일을 맡아 ${quest}를 받아요. 금을 쓰지 않고 버는 명령이에요.`]), related: [] },
      { id: 'army', title: '모병과 개인 군량', keys: ['모병', '개인 군량', '재야 군량'], body: ul([
        `<b>모병</b>: 금 ${R.myGoldCost.draft}, 세력 장수 징병의 ${pct(RAr.draftRate)}%만 모여요. 기본 병종만, 성 치안은 깎지 않아요.`,
        `재야 병사는 <b>개인 군량</b>을 먹어요 (최대 ${fmt(RAr.foodMax)}). 수확 달(${R.harvestMonths.join('·')}월)마다 ${RAr.foodBase} + 통솔 × ${RAr.foodPerLea}이 들어오고, 군량 구매도 개인 군량으로 들어와요.`,
        `모자라면 그달 병력의 ${pct(R.starveLoss)}%가 흩어져요. 재야가 될 때 개인 군량 ${RAr.startFood}로 시작해요.`]), related: [] },
      { id: 'raid', title: '약탈', keys: ['약탈'], body: `<p>머무는 성에서 금과 군량을 빼앗아요. <b>성은 차지하지 않아요.</b></p>`
        + ul([`병력 ${fmt(RA.minTroops)}명 이상. <b>시도할 때마다 명성 -${RA.merit}</b>.`, `얻는 것: 금 ≈ 그 성 상업 × ${RA.gold}, 군량 ≈ 농업 × ${RA.food} (개인 군량 빈자리까지).`, `지키는 부대가 있으면 ${pct(RA.fightChance)}% 확률로 ${RA.rounds}합을 싸워요. <b>전멸하면 실패</b>.`]),
        detail: ul([`얻는 양은 ±${pct(RA.spread)}% 오르내려요. 약탈 창에 예상 범위가 나와요.`, `같은 성은 ${RA.cityWait}턴에 한 번만 털 수 있어요.`, `털린 성: 농업·상업 -${pct(RA.dmg[0])}~${pct(RA.dmg[1])}%, 치안 -${RA.peace[0]}~${RA.peace[1]}. 그 세력 장수들에게 알려져요.`, '지키는 쪽은 방어 모드 장수 중 병력이 가장 많은 장수, 없으면 수비대예요. 성벽 효과는 없어요.']), related: [] },
      { id: 'rise', title: '거병', keys: ['거병', '건국', '새 세력'], body: `<p><b>공백지</b>나 <b>도적군 성</b>에서 새 세력을 세우고 대도독이 돼요.</p>`
        + table(['조건', ''], [['명성', `${fmt(RI.minMerit)} 이상`], ['병력', `${fmt(RI.minTroops)}명 이상`], ['금', `${fmt(RI.gold)} (시도할 때 내요)`], ['군량', `병력 × ${RI.foodRate} (개인 군량에서, 시도할 때 써요)`], ['하야 대기', '끝나야 해요'], ['횟수', `한 시즌에 성공 ${RI.max}번까지 (남은 횟수는 거병 창에)`]])
        + ul(['도적군 성은 도적군과 성벽 없이 싸워 <b>이겨야</b> 해요. 지면 금·군량과 병력을 잃어요.', `거병하면 명성 +${RI.meritEmpty} (도적 제압 시 +${RI.merit}), 세력 이름은 1~${RI.nameMax}글자로 지어요.`]),
        detail: ul([`새 세력은 ${RI.protect}턴 동안 공격받지도, 공격하지도 못해요.`, `거병한 대도독은 ${RI.lockTurns}턴 동안 하야·반납·위임을 할 수 없어요 (접속이 끊겨 자리를 잃는 건 그대로).`, '거병한 대도독은 명성·인원 조건 없이 대도독을 맡아요.', '세력에 장수가 아무도 안 남으면 세력은 사라지고 성은 공백지가 돼요.']), related: ['faction.commander'] },
      { id: 'join', title: '임관', keys: ['재야 임관'], body: `<p>들어갈 세력의 성으로 가서 <b>임관</b>을 누르면 바로 소속돼요. 병력은 그대로, 개인 군량은 사라져요. 하야 대기와 임관 제한은 그대로 적용돼요.</p>`, related: ['faction.join'] },
    ] },
    { id: 'extras', icon: '💡', title: '대회와 기타 기능', blurb: '대회·미니게임·단축키', subs: [
      { id: 'tourney', title: '무술대회·설전대회', keys: ['대회', '무술대회', '설전대회'], body: ul([
        '가끔 열려요. 열리면 🏟 대회 단추로 신청해요 (참가비가 있어요).',
        `무술대회는 무력, 설전대회는 지력으로 1:1 카드 대결을 해요. 한 번에 최대 ${R.tourney.max}명, 세력당 ${R.tourney.factionMax}명까지.`,
        '우승·준우승은 금·명성·경험치를 받아요. 대회 창의 📖 규칙에서 자세히 봐요.']), related: [] },
      { id: 'mini', title: '미니게임', keys: ['미니게임', '일기당천', '맹장집결'], body: '<p>첫 화면에서 <b>일기당천</b>과 <b>맹장집결</b>을 할 수 있어요. 본게임 장수·자원과는 상관없어요.</p>', related: [] },
      { id: 'hall', title: '명예의 전당', keys: ['명예의 전당', '기록'], body: '<p>첫 화면에서 지난 시즌의 통일 세력, 명성 순위, 훈장, 세력 변화 다시 보기를 볼 수 있어요.</p>', related: [] },
      { id: 'ai', title: '공명의 조언', keys: ['공명', '제갈량', 'AI'], body: '<p>위쪽 🪶 공명의 조언에서 규칙을 물어볼 수 있어요. 하루에 물어볼 수 있는 횟수가 정해져 있어요.</p>', related: [] },
      ...(typeof hotkeysOk === 'function' && hotkeysOk() ? [{ id: 'keys', title: '단축키', keys: ['단축키', '키보드'], body: ul(['PC에서 키보드로 명령을 넣을 수 있어요. 위쪽 ⌨ 단축키에서 켜고 바꿔요.', '재야일 때는 재야 명령 키가 따로 있어요.', '고르는 창에서는 숫자 1~9, 0으로 고르고 한 번 더 누르면 확인이에요.']), related: [] }] : []),
    ] },
  ];
}

// 검색용 글: 태그를 빼고 공백을 줄인다
const helpPlain = html => String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const helpNorm = s => String(s || '').toLowerCase().replace(/\s+/g, '');
let helpQuery = ''; // 목록 화면 검색어 (돌아왔을 때 그대로)

// ----- 화면 -----
// 이동 기록 (2026-11-25 피드백): 관련 항목·검색 결과·목록 단추로 옮겨 가면 지금 자리(대분류·스크롤·펼친 자세히)를 쌓아 두고, ◀ 이전으로 되돌린다
// 도움말 단추로 새로 열면 기록을 비운다. 표(명성표·확률표)에서 돌아올 때도 그 자리 그대로
let helpHist = [], helpNow = null; // helpNow(): 지금 화면의 자리 { target, scroll, open }

// target: -1/없음 = 목록, 숫자 = 대분류 번호, 'army' = 대분류, 'army.siege' = 소항목
function helpDialog2(target = -1) { helpHist = []; helpShow(target); }
function helpGo(target, opt = {}) { if (helpNow) helpHist.push(helpNow()); helpShow(target, opt); } // 기록을 남기고 옮겨 간다
function helpBack() { const s = helpHist.pop(); if (s) helpShow(s.target, s); }
// opt: { scroll: 본문 스크롤 위치, open: 펼쳐 둘 소항목 id들, openSub: target 소항목의 자세히를 펼침 }
function helpShow(target = -1, opt = {}) {
  const topics = helpTopics();
  const catOf = id => topics.find(c => c.id === id);
  if (target === -1 || target == null || (typeof target === 'number' && !topics[target]) || (typeof target === 'string' && !catOf(target.split('.')[0]))) return helpIndex2(topics, opt);
  const cat = typeof target === 'number' ? topics[target] : catOf(target.split('.')[0]);
  const subId = typeof target === 'string' ? target.split('.')[1] : null;
  const subs = cat.subs.map(s => `<section class="helpSec" id="hs-${cat.id}-${s.id}">
      <h4>${s.title}</h4>${s.body}
      ${s.detail ? `<details class="helpMore" data-sub="${s.id}"><summary>자세히</summary>${s.detail}</details>` : ''}
      ${s.related && s.related.length ? `<p class="helpRel">관련: ${s.related.map(r => { const [c, x] = r.split('.'), cc = catOf(c), ss = cc && cc.subs.find(y => y.id === x); return ss ? `<button class="link" data-goto="${r}">${ss.title}</button>` : ''; }).filter(Boolean).join('·')}</p>` : ''}
    </section>`).join('');
  openModal(`
    <h2>땅국지 도움말</h2>
    <p class="helpCrumb"><button class="link" id="helpHome">도움말</button> › ${cat.icon} ${cat.title}</p>
    <p class="helpChips">${cat.subs.map(s => `<button class="mini" data-jump="${s.id}">${s.title}</button>`).join('')}</p>
    <div class="help helpScroll helpBody">${subs}</div>
    <div class="modalBtns helpNav">
      <button data-close class="main">닫기</button>
      <span class="helpNavR">${helpHist.length ? '<button id="helpPrev">◀ 이전</button> ' : ''}<button id="helpList">☰ 목록으로</button></span>
    </div>`, box => {
    const body = box.querySelector('.helpBody');
    helpNow = () => ({ target: cat.id, scroll: body ? body.scrollTop : 0, open: [...box.querySelectorAll('details.helpMore[open]')].map(d => d.dataset.sub) });
    box.querySelector('#helpList').onclick = () => helpGo(-1);
    box.querySelector('#helpHome').onclick = () => helpGo(-1);
    if (box.querySelector('#helpPrev')) box.querySelector('#helpPrev').onclick = helpBack;
    const jump = id => { const el = box.querySelector(`#hs-${cat.id}-${id}`); if (el && body) body.scrollTop = el.offsetTop - body.offsetTop; };
    box.querySelectorAll('[data-jump]').forEach(b => { b.onclick = () => jump(b.dataset.jump); });
    helpBindLinks(box);
    for (const id of opt.open || []) { const d = box.querySelector(`details.helpMore[data-sub="${id}"]`); if (d) d.open = true; }
    if (opt.openSub && subId) { const d = box.querySelector(`details.helpMore[data-sub="${subId}"]`); if (d) d.open = true; } // 검색어가 자세히 안에만 있으면 펼쳐서 보여 준다
    if (opt.scroll != null && body) body.scrollTop = opt.scroll; else if (subId) jump(subId);
  });
  $('#modalBox').classList.add('wideBox', 'helpBox');
}
// 관련 항목·표 링크 (본문과 검색 결과에서 함께 쓴다). 표에서 돌아오면 떠날 때의 자리 그대로
function helpBindLinks(box) {
  box.querySelectorAll('[data-goto]').forEach(b => { b.onclick = () => helpGo(b.dataset.goto, { openSub: b.dataset.open === '1' }); });
  box.querySelectorAll('[data-table]').forEach(b => { b.onclick = () => {
    const at = helpNow ? helpNow() : { target: -1 }, ret = () => helpShow(at.target, at), k = b.dataset.table;
    if (k === 'merit') meritTableDialog(ret, '도움말');
    else if (k === 'trait') traitOddsDialog(ret, '도움말');
    else exploreOddsDialog(ret, '도움말로', k === 'explore-ronin' ? 'ronin' : 'normal');
  }; });
}
function helpIndex2(topics, opt = {}) {
  openModal(`
    <h2>땅국지 도움말${typeof IS_ADMIN !== 'undefined' && IS_ADMIN ? ' <span class="dim small">· 새 버전 (관리자 확인용)</span>' : ''}</h2>
    <p class="helpSearch"><input id="helpQ" type="search" placeholder="도움말 검색 (예: 연노, 정예, 약탈)" autocomplete="off" value="${esc(helpQuery)}"></p>
    <div class="helpIdxBody"><div id="helpResults"></div>
    <div id="helpCats">
      <p class="helpStart"><button class="main" data-goto="start">🎯 처음 오셨나요? 빠른 시작 가이드 ›</button></p>
      <div class="helpIndex helpIndex2">${topics.map((c, i) => c.id === 'start' ? '' : `<button data-page="${i}"><span class="hiIc">${c.icon}</span><span class="hiT">${c.title}<small class="hiB">${c.blurb}</small></span></button>`).join('')}</div>
    </div></div>
    <div class="modalBtns${helpHist.length ? ' helpNav' : ''}"><button data-close class="main">닫기</button>${helpHist.length ? '<button id="helpPrev">◀ 이전</button>' : ''}</div>`, box => {
    const idxBody = box.querySelector('.helpIdxBody');
    helpNow = () => ({ target: -1, scroll: idxBody ? idxBody.scrollTop : 0 });
    if (box.querySelector('#helpPrev')) box.querySelector('#helpPrev').onclick = helpBack;
    box.querySelectorAll('[data-page]').forEach(b => { b.onclick = () => helpGo(+b.dataset.page); });
    helpBindLinks(box); // 빠른 시작 가이드 단추
    const q = box.querySelector('#helpQ'), res = box.querySelector('#helpResults'), cats = box.querySelector('#helpCats');
    const run = () => { // 입력칸은 다시 그리지 않고 결과만 바꾼다 (한글 입력이 깨지지 않게)
      helpQuery = q.value;
      const n = helpNorm(helpQuery);
      cats.hidden = !!n;
      if (!n) { res.innerHTML = ''; return; }
      const hits = [];
      for (const c of topics) for (const s of c.subs) {
        const title = helpNorm(s.title), keys = (s.keys || []).map(helpNorm), main = helpPlain(s.body), more = helpPlain(s.detail || ''), text = main + ' ' + more;
        const inMain = title.includes(n) || keys.some(k => k.includes(n)) || helpNorm(main).includes(n);
        const inMore = !inMain && helpNorm(more).includes(n); // 자세히 안에만 있으면 눌렀을 때 펼친다 (2026-11-25 피드백)
        const score = title.includes(n) ? 3 : keys.some(k => k.includes(n)) ? 2 : inMain || inMore ? 1 : 0;
        if (!score) continue;
        const i = text.replace(/\s+/g, '').toLowerCase().indexOf(n); // 글 속 위치를 대략 찾아 앞뒤를 조금 보여 준다
        let snip = text.slice(0, 60);
        if (i >= 0) { let k = 0, pos = 0; for (; pos < text.length && k < i; pos++) if (!/\s/.test(text[pos])) k++; snip = (pos > 20 ? '…' : '') + text.slice(Math.max(0, pos - 20), pos + 50); }
        hits.push({ score, c, s, snip, inMore });
      }
      hits.sort((a, b) => b.score - a.score);
      res.innerHTML = hits.length ? `<ul class="helpHits">${hits.slice(0, 20).map(h => `<li><button class="link" data-goto="${h.c.id}.${h.s.id}"${h.inMore ? ' data-open="1"' : ''}>${h.c.icon} ${esc(h.c.title)} › <b>${esc(h.s.title)}</b>${h.inMore ? ' <span class="dim small">(자세히)</span>' : ''}</button><br><span class="dim small">${esc(h.snip)}…</span></li>`).join('')}</ul>`
        : '<p class="dim">찾는 내용이 없어요. 다른 말로 찾아보세요.</p>';
      helpBindLinks(res);
    };
    q.addEventListener('input', run);
    if (helpQuery) run();
    if (opt.scroll != null && idxBody) idxBody.scrollTop = opt.scroll;
  });
  $('#modalBox').classList.add('wideBox', 'helpBox');
}
