'use strict';

// ===== 장수 얼굴: img/faces 폴더의 그림(256×320)을 보여 준다 =====
// 새 얼굴을 늘리려면 그림을 img/faces에 넣고 아래 목록에 한 줄 추가한다.

const FACES = [
  { id: 'm1', name: '무관 1', style: '무관' },
  { id: 'm2', name: '무관 2', style: '무관' },
  { id: 'm3', name: '무관 3', style: '무관' },
  { id: 'm4', name: '무관 4', style: '무관' },
  { id: 'c1', name: '문관 1', style: '문관' },
  { id: 'c2', name: '문관 2', style: '문관' },
  { id: 'c3', name: '문관 3', style: '문관' },
  { id: 'c4', name: '문관 4', style: '문관' },
];

function faceCanvas(faceId, cls = '') {
  const f = FACES.find(x => x.id === faceId) || FACES[0];
  const img = document.createElement('img');
  img.className = 'face ' + cls;
  img.src = 'img/faces/' + f.id + '.jpg';
  img.alt = f.name;
  return img;
}
