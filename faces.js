'use strict';

// ===== 장수 얼굴: img/faces 폴더의 그림(256×320)을 보여 준다 =====
// 새 얼굴을 늘리려면 그림을 img/faces에 넣고 아래 목록에 한 줄 추가한다.

// chat: 채팅 닉네임 색 (2026-10-30, 얼굴 그림의 키컬러를 어두운 바탕에서 읽히게 밝게)
const FACES = [
  { id: 'm1', name: '무관 1', style: '무관', chat: '#f5a060' },
  { id: 'm2', name: '무관 2', style: '무관', chat: '#a6d672' },
  { id: 'm3', name: '무관 3', style: '무관', chat: '#c8b6f7' }, // 2026-11-03 #aeb0f7 → 연보라
  { id: 'm4', name: '무관 4', style: '무관', chat: '#f2cf5e' },
  { id: 'm5', name: '무관 5', style: '무관', chat: '#5fd6b0' }, // 2026-11-03 시즌 5 (사용자 그림 face/무5.png)
  { id: 'c1', name: '문관 1', style: '문관', chat: '#d9b070' },
  { id: 'c2', name: '문관 2', style: '문관', chat: '#b47cf2' }, // 2026-11-03 #c99af2 → 짙은 보라
  { id: 'c3', name: '문관 3', style: '문관', chat: '#6b9cf5' }, // 2026-11-03 #93b6ee → 맑은 파랑
  { id: 'c4', name: '문관 4', style: '문관', chat: '#f2806e' },
  { id: 'c5', name: '문관 5', style: '문관', chat: '#d8d0c0' }, // 2026-11-03 시즌 5 (사용자 그림 face/문5.png)
];

function faceCanvas(faceId, cls = '') {
  const f = FACES.find(x => x.id === faceId) || FACES[0];
  const img = document.createElement('img');
  img.className = 'face ' + cls;
  img.src = 'img/faces/' + f.id + '.jpg';
  img.alt = f.name;
  return img;
}
