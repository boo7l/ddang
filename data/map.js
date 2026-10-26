// 자동으로 만든 파일. data/map_200.json을 고치고 supabase/build.sh를 돌린다.
const MAP_DATA = {
 "scenario": "관도대전",
 "year": 200,
 "cols": 8,
 "rows": 10,
 "adjacency": 8,
 "factions": [
  {
   "id": "cc",
   "name": "조조",
   "color": "#2655c5"
  },
  {
   "id": "lb",
   "name": "원소",
   "color": "#c6910c"
  },
  {
   "id": "f1791967125335",
   "name": "유비",
   "color": "#4b8f38"
  },
  {
   "id": "f1792022131639",
   "name": "손책",
   "color": "#c0392b"
  },
  {
   "id": "f1793022007853",
   "name": "유표",
   "color": "#51c9e1"
  },
  {
   "id": "f1793022008706",
   "name": "장로",
   "color": "#d6866b"
  },
  {
   "id": "f1793022808511",
   "name": "유장",
   "color": "#1d6f6c"
  },
  {
   "id": "f1793022836023",
   "name": "마등",
   "color": "#652f2f"
  }
 ],
 "cities": [
  {
   "id": "c0",
   "x": 6,
   "y": 0,
   "name": "계",
   "faction": "lb",
   "grade": 2
  },
  {
   "id": "c1",
   "x": 7,
   "y": 0,
   "name": "북평",
   "faction": "lb",
   "grade": 1
  },
  {
   "id": "c2",
   "x": 5,
   "y": 1,
   "name": "진양",
   "faction": "lb",
   "grade": 1
  },
  {
   "id": "c3",
   "x": 7,
   "y": 1,
   "name": "남피",
   "faction": "lb",
   "grade": 2
  },
  {
   "id": "c4",
   "x": 0,
   "y": 1,
   "name": "무위",
   "faction": "f1793022836023",
   "grade": 2
  },
  {
   "id": "c5",
   "x": 5,
   "y": 2,
   "name": "업",
   "faction": "lb",
   "grade": 3
  },
  {
   "id": "c6",
   "x": 6,
   "y": 2,
   "name": "평원",
   "faction": "lb",
   "grade": 1
  },
  {
   "id": "c7",
   "x": 7,
   "y": 3,
   "name": "북해",
   "faction": "lb",
   "grade": 2
  },
  {
   "id": "c8",
   "x": 0,
   "y": 3,
   "name": "천수",
   "faction": "f1793022836023",
   "grade": 2
  },
  {
   "id": "c9",
   "x": 2,
   "y": 3,
   "name": "장안",
   "faction": "cc",
   "grade": 3
  },
  {
   "id": "c10",
   "x": 3,
   "y": 3,
   "name": "낙양",
   "faction": "cc",
   "grade": 3
  },
  {
   "id": "c11",
   "x": 4,
   "y": 3,
   "name": "진류",
   "faction": "cc",
   "grade": 2
  },
  {
   "id": "c12",
   "x": 1,
   "y": 4,
   "name": "한중",
   "faction": "f1793022008706",
   "grade": 3
  },
  {
   "id": "c13",
   "x": 3,
   "y": 4,
   "name": "완",
   "faction": "cc",
   "grade": 2
  },
  {
   "id": "c14",
   "x": 4,
   "y": 4,
   "name": "허창",
   "faction": "cc",
   "grade": 2
  },
  {
   "id": "c15",
   "x": 6,
   "y": 4,
   "name": "소패",
   "faction": "f1791967125335",
   "grade": 1
  },
  {
   "id": "c16",
   "x": 7,
   "y": 4,
   "name": "하비",
   "faction": "f1791967125335",
   "grade": 2
  },
  {
   "id": "c17",
   "x": 2,
   "y": 5,
   "name": "상용",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c18",
   "x": 3,
   "y": 5,
   "name": "신야",
   "faction": "f1793022007853",
   "grade": 1
  },
  {
   "id": "c19",
   "x": 5,
   "y": 5,
   "name": "여남",
   "faction": "cc",
   "grade": 2
  },
  {
   "id": "c20",
   "x": 6,
   "y": 5,
   "name": "수춘",
   "faction": "cc",
   "grade": 2
  },
  {
   "id": "c22",
   "x": 0,
   "y": 5,
   "name": "자동",
   "faction": "f1793022808511",
   "grade": 1
  },
  {
   "id": "c23",
   "x": 3,
   "y": 6,
   "name": "양양",
   "faction": "f1793022007853",
   "grade": 3
  },
  {
   "id": "c24",
   "x": 4,
   "y": 6,
   "name": "강하",
   "faction": "f1793022007853",
   "grade": 2
  },
  {
   "id": "c25",
   "x": 6,
   "y": 7,
   "name": "건업",
   "faction": "f1792022131639",
   "grade": 3
  },
  {
   "id": "c26",
   "x": 0,
   "y": 6,
   "name": "성도",
   "faction": "f1793022808511",
   "grade": 3
  },
  {
   "id": "c27",
   "x": 1,
   "y": 7,
   "name": "강주",
   "faction": "f1793022808511",
   "grade": 2
  },
  {
   "id": "c28",
   "x": 2,
   "y": 7,
   "name": "영안",
   "faction": "f1793022808511",
   "grade": 1
  },
  {
   "id": "c29",
   "x": 3,
   "y": 7,
   "name": "강릉",
   "faction": "f1793022007853",
   "grade": 2
  },
  {
   "id": "c30",
   "x": 5,
   "y": 7,
   "name": "시상",
   "faction": "f1792022131639",
   "grade": 1
  },
  {
   "id": "c31",
   "x": 7,
   "y": 7,
   "name": "오",
   "faction": "f1792022131639",
   "grade": 2
  },
  {
   "id": "c32",
   "x": 4,
   "y": 8,
   "name": "장사",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c33",
   "x": 7,
   "y": 8,
   "name": "회계",
   "faction": "f1792022131639",
   "grade": 2
  },
  {
   "id": "c34",
   "x": 0,
   "y": 8,
   "name": "건녕",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c35",
   "x": 3,
   "y": 9,
   "name": "영릉",
   "faction": "",
   "grade": 2
  },
  {
   "id": "c36",
   "x": 4,
   "y": 9,
   "name": "계양",
   "faction": "",
   "grade": 1
  },
  {
   "id": "c1791951679346",
   "x": 1,
   "y": 2,
   "name": "안정",
   "faction": "f1793022836023",
   "grade": 1
  },
  {
   "id": "c1791951679349",
   "x": 3,
   "y": 8,
   "name": "무릉",
   "faction": "f1793022007853",
   "grade": 1
  },
  {
   "id": "c1791951679351",
   "x": 6,
   "y": 6,
   "name": "여강",
   "faction": "f1792022131639",
   "grade": 2
  },
  {
   "id": "c1791951679352",
   "x": 5,
   "y": 3,
   "name": "복양",
   "faction": "cc",
   "grade": 2
  }
 ]
};
