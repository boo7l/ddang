// 자동으로 만든 파일. data/map_kor.json을 고치고 supabase/build.sh를 돌린다.
const MAP_DATA = {
 "scenario": "대한민국",
 "year": 2026,
 "cols": 8,
 "rows": 14,
 "adjacency": 8,
 "factions": [
  {
   "id": "js",
   "name": "조선",
   "color": "#38a353"
  },
  {
   "id": "gr",
   "name": "고려",
   "color": "#715c4b"
  },
  {
   "id": "gg",
   "name": "고구려",
   "color": "#d64343"
  },
  {
   "id": "bj",
   "name": "백제",
   "color": "#3a8c92"
  },
  {
   "id": "mh",
   "name": "마한",
   "color": "#425d28"
  },
  {
   "id": "sl",
   "name": "신라",
   "color": "#bc9a29"
  },
  {
   "id": "gy",
   "name": "가야",
   "color": "#ab5821"
  },
  {
   "id": "tr",
   "name": "탐라",
   "color": "#2742b0"
  }
 ],
 "cities": [
  {
   "id": "c0",
   "x": 3,
   "y": 0,
   "name": "의정부",
   "faction": "gr",
   "grade": 1
  },
  {
   "id": "c2",
   "x": 5,
   "y": 0,
   "name": "춘천",
   "faction": "gg",
   "grade": 2
  },
  {
   "id": "c3",
   "x": 7,
   "y": 2,
   "name": "강릉",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c4",
   "x": 2,
   "y": 3,
   "name": "수원",
   "faction": "js",
   "grade": 2
  },
  {
   "id": "c5",
   "x": 7,
   "y": 0,
   "name": "속초",
   "faction": "gg",
   "grade": 1
  },
  {
   "id": "c7",
   "x": 7,
   "y": 3,
   "name": "동해",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c8",
   "x": 1,
   "y": 2,
   "name": "인천",
   "faction": "js",
   "grade": 3
  },
  {
   "id": "c9",
   "x": 2,
   "y": 1,
   "name": "서울",
   "faction": "gr",
   "grade": 3
  },
  {
   "id": "c10",
   "x": 3,
   "y": 2,
   "name": "성남",
   "faction": "gr",
   "grade": 1
  },
  {
   "id": "c12",
   "x": 1,
   "y": 3,
   "name": "안산",
   "faction": "js",
   "grade": 1
  },
  {
   "id": "c13",
   "x": 3,
   "y": 3,
   "name": "용인",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c14",
   "x": 4,
   "y": 4,
   "name": "충주",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c15",
   "x": 5,
   "y": 2,
   "name": "원주",
   "faction": "gg",
   "grade": 3
  },
  {
   "id": "c16",
   "x": 6,
   "y": 5,
   "name": "안동",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c17",
   "x": 2,
   "y": 4,
   "name": "평택",
   "faction": "js",
   "grade": 2
  },
  {
   "id": "c18",
   "x": 2,
   "y": 5,
   "name": "천안",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c20",
   "x": 3,
   "y": 5,
   "name": "청주",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c22",
   "x": 1,
   "y": 5,
   "name": "아산",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c23",
   "x": 2,
   "y": 6,
   "name": "공주",
   "faction": "bj",
   "grade": 1
  },
  {
   "id": "c24",
   "x": 3,
   "y": 6,
   "name": "세종",
   "faction": "bj",
   "grade": 2
  },
  {
   "id": "c35",
   "x": 7,
   "y": 7,
   "name": "포항",
   "faction": "sl",
   "grade": 2
  },
  {
   "id": "c36",
   "x": 6,
   "y": 8,
   "name": "경주",
   "faction": "sl",
   "grade": 2
  },
  {
   "id": "c1791951679346",
   "x": 1,
   "y": 1,
   "name": "고양",
   "faction": "gr",
   "grade": 2
  },
  {
   "id": "c1793375043773",
   "x": 3,
   "y": 7,
   "name": "대전",
   "faction": "bj",
   "grade": 3
  },
  {
   "id": "c1793375084488",
   "x": 6,
   "y": 9,
   "name": "울산",
   "faction": "sl",
   "grade": 2
  },
  {
   "id": "c1793375090839",
   "x": 5,
   "y": 8,
   "name": "대구",
   "faction": "",
   "grade": 3
  },
  {
   "id": "c1793375094157",
   "x": 4,
   "y": 7,
   "name": "구미",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c1793375174961",
   "x": 6,
   "y": 10,
   "name": "부산",
   "faction": "gy",
   "grade": 3
  },
  {
   "id": "c1793375180843",
   "x": 5,
   "y": 10,
   "name": "김해",
   "faction": "gy",
   "grade": 2
  },
  {
   "id": "c1793375185369",
   "x": 3,
   "y": 10,
   "name": "진주",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c1793375190640",
   "x": 4,
   "y": 11,
   "name": "통영",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c1793375197437",
   "x": 2,
   "y": 13,
   "name": "제주",
   "faction": "tr",
   "grade": 2
  },
  {
   "id": "c1793375200557",
   "x": 2,
   "y": 11,
   "name": "순천",
   "faction": "mh",
   "grade": 2
  },
  {
   "id": "c1793375250369",
   "x": 1,
   "y": 10,
   "name": "광주",
   "faction": "mh",
   "grade": 3
  },
  {
   "id": "c1793375257361",
   "x": 0,
   "y": 11,
   "name": "목포",
   "faction": "mh",
   "grade": 1
  },
  {
   "id": "c1793375265725",
   "x": 2,
   "y": 9,
   "name": "전주",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c1793375271251",
   "x": 2,
   "y": 8,
   "name": "익산",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c1793375273661",
   "x": 1,
   "y": 8,
   "name": "군산",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c1793375319414",
   "x": 1,
   "y": 13,
   "name": "서귀포",
   "faction": "tr",
   "grade": 1
  },
  {
   "id": "c1793375874878",
   "x": 2,
   "y": 12,
   "name": "여수",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c1793409612092",
   "x": 4,
   "y": 10,
   "name": "창원",
   "faction": "gy",
   "grade": 2
  },
  {
   "id": "c1793409690302",
   "x": 2,
   "y": 10,
   "name": "남원",
   "faction": "",
   "grade": 1
  }
 ],
 "links": [
  [
   "c1793375257361",
   "c1793375319414"
  ],
  [
   "c16",
   "c1793375094157"
  ],
  [
   "c16",
   "c35"
  ],
  [
   "c16",
   "c14"
  ],
  [
   "c16",
   "c7"
  ],
  [
   "c0",
   "c2"
  ],
  [
   "c2",
   "c5"
  ],
  [
   "c5",
   "c3"
  ],
  [
   "c15",
   "c10"
  ],
  [
   "c15",
   "c3"
  ],
  [
   "c2",
   "c15"
  ],
  [
   "c14",
   "c15"
  ],
  [
   "c1793375090839",
   "c1793409612092"
  ],
  [
   "c23",
   "c1793375273661"
  ],
  [
   "c1793375094157",
   "c1793375185369"
  ]
 ]
};
