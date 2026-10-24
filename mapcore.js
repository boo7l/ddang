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
