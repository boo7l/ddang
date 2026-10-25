'use strict';

// ===== 지도 공통 규칙 (게임 화면과 지도 편집기가 같이 쓴다) =====
const GRADE_NAME = { 1: '소성', 2: '중성', 3: '대도시' };

// 두 성이 맞닿아 있는지: 8방향이면 꼭지점도 인정, 4방향이면 변만 인정
function adjacent(map, a, b) {
  const dx = Math.abs(a.x - b.x), dy = Math.abs(a.y - b.y);
  if (dx === 0 && dy === 0) return false;
  return map.adjacency === 4 ? dx + dy === 1 : dx <= 1 && dy <= 1;
}

const neighborsOf = (map, c) => map.cities.filter(o => adjacent(map, c, o));

// 모든 성이 하나로 이어져 있는지 검사. 떨어진 성 목록을 돌려준다.
function findIsolated(map) {
  if (map.cities.length === 0) return [];
  const seen = new Set([map.cities[0].id]);
  const queue = [map.cities[0]];
  while (queue.length) {
    for (const n of neighborsOf(map, queue.shift())) {
      if (!seen.has(n.id)) { seen.add(n.id); queue.push(n); }
    }
  }
  return map.cities.filter(c => !seen.has(c.id));
}

// ===== 주(州): 성을 한나라 13주(+사례) 단위로 묶는다 (2026-10-25, 나중에 지역 설정·이벤트에 쓴다) =====
// 성 이름으로 적는다. 지도에 성을 더하거나 이름을 바꾸면 여기도 고친다
const PROVINCES = {
  유주: ['계', '북평'],
  기주: ['남피', '업'],
  병주: ['진양'],
  청주: ['평원', '북해'],
  연주: ['진류', '복양'],
  사례: ['장안', '낙양'],
  량주: ['무위', '안정', '천수'],
  예주: ['허창', '여남', '소패'],
  서주: ['하비'],
  익주: ['한중', '자동', '성도', '강주', '영안', '건녕'],
  형주: ['상용', '완', '신야', '양양', '강하', '강릉', '무릉', '장사', '영릉', '계양'],
  양주: ['수춘', '여강', '시상', '건업', '오', '회계'],
};
// 성이 속한 주 이름 (없으면 '')
const provinceOf = c => Object.keys(PROVINCES).find(p => PROVINCES[p].includes(c.name)) || '';
// 효과·이벤트 계산용으로 더 잘게 나눈 주 (화면에는 provinceOf의 큰 이름을 보여 준다).
// 형주는 성이 10개로 너무 커서 형북·형남으로 나눠 계산한다 (2026-10-25)
const PROVINCE_PARTS = {
  형주: { 형북: ['상용', '완', '신야', '양양', '강하', '강릉'], 형남: ['무릉', '장사', '영릉', '계양'] },
};
// 효과를 계산할 때 쓰는 구역 이름: 나눈 주면 그 조각(형북·형남), 아니면 주 이름 그대로
function regionOf(c) {
  const p = provinceOf(c), parts = PROVINCE_PARTS[p];
  return (parts && Object.keys(parts).find(k => parts[k].includes(c.name))) || p;
}
