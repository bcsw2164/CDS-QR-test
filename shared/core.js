/* ============================================================
   Signature System — core.js
   ------------------------------------------------------------
   sig-sketch.js(슬라이더 단일 생성기)와 archive-sketch.js(아카이브
   그리드)가 공유하는 그래픽 생성 로직. 여기를 고치면 두 페이지 모두에
   반영된다.

   그래픽 구성:
     레이어 1 — 일그러진 사각형
       errorB → 꼭짓점 4개의 가로(X) 방향 이탈 폭
       errorA → 꼭짓점 4개의 세로(Y) 방향 이탈 폭
       (둘 다 0이면 완벽한 정사각형, 클수록 각 꼭짓점이 어긋남)

     레이어 2 — 원
       errorA → 중심(0)에서 왼쪽 위 대각선 방향(1)으로의 이동 거리

   재현성:
     사각형·원 모두 노이즈 없이 errorA/errorB만으로 계산되는 순수
     함수라 시드가 필요 없다 (같은 입력 → 항상 같은 결과). 그리드는
     여전히 noiseSeed(hashSeed(errorA, errorB))로 호출부에서 시드를
     맞춰야 한다.

   색상:
     errorA/errorB와 무관하게 항상 고정.
     사각형+원 — 사각형은 SQUARE_COLOR, 원은 CIRCLE_COLOR.
     그리드   — 항상 GRID_COLOR.

   렌더링 대상(g):
     drawDistortedRect / drawCircle / drawGridMesh는 첫 인자로 그릴
     대상 g를 받는다. 메인 캔버스에 그릴 때는 window(전역 p5 함수들이
     묶여있는 객체)를, 아카이브 그리드처럼 아이템별 개별 버퍼에 그릴
     때는 createGraphics()로 만든 p5.Graphics 객체를 넘긴다. 두 쪽 다
     동일한 draw API(push/fill/vertex 등)를 가지므로 함수 내부는
     대상이 무엇이든 신경 쓰지 않는다.

   크기 규칙:
     이 파일의 모든 도형 수치는 호출부에서 넘겨받은 size(캔버스/셀
     크기) 대비 비율(XXX_RATIO 상수)로만 계산한다. 픽셀 고정값은 여기
     없음 — 캔버스 크기는 호출하는 sketch.js가 화면에 맞게 정한다.
   ============================================================ */

// ── 형태 상수 (모두 size 대비 비율) ──────────────────────────
const JITTER_RATIO = 0.36; // 꼭짓점 최대 이탈 거리 = size × 이 비율
const DIAGONAL_DIST_RATIO = 0.32; // 원의 최대 대각선 이동 거리 = size × 이 비율
const CIRCLE_R_RATIO = 0.18; // 원 반지름 = size × 이 비율

// ── 색상 상수 (고정, errorA/errorB와 무관) ──────────────────
const SQUARE_COLOR = '#18E6BD'; // 사각형+원 오브젝트의 사각형
const CIRCLE_COLOR = '#1E322D'; // 사각형+원 오브젝트의 원
const GRID_COLOR = '#F44881'; // 그리드 오브젝트

// 같은 (a, b) → 항상 같은 정수 시드
function hashSeed(a, b) {
  const x = Math.floor(a * 1000);
  const y = Math.floor(b * 1000);
  let h = (x * 374761393 + y * 668265263) % 2147483647;
  if (h < 0) h += 2147483647;
  return h;
}

// noise()를 -1 ~ 1 범위로 변환
function ns(x, y) {
  return (noise(x, y) - 0.5) * 2;
}

// ── 레이어 1: 일그러진 사각형 ───────────────────────────────
//
// 노이즈 없이 errorA/errorB만으로 결정되는 순수 함수. 축을 분리해서
// errorB는 가로(X) 이탈 폭을, errorA는 세로(Y) 이탈 폭을 각각 담당한다
// (mouseX/mouseY로 X/Y를 따로 제어하던 참고 레퍼런스와 같은 방식).
// 꼭짓점별로 그 폭 안에서 "어느 쪽으로, 얼마나"를 정하는 고정 계수
// (CORNER_DIR, -1~1)만 있고 그 외엔 무작위 요소가 전혀 없다 — 같은
// errorA/errorB → 항상 같은 형태, 값이 가까우면 형태도 가깝다.
//
// g: 그릴 대상 — 메인 캔버스(전역 p5, 즉 window)이거나
//    createGraphics()로 만든 개별 버퍼(p5.Graphics). 둘 다 같은
//    draw API(push/fill/vertex 등)를 가지므로 그대로 호출한다.
//
// 꼭짓점별 고정 방향 계수 [X방향, Y방향] (-1~1) — 네 꼭짓점이 서로
// 다른 쪽으로 흩어지도록 부호·크기를 다르게 줌.
const CORNER_DIR = [
  [-0.6, 0.8], // 좌상
  [0.9, -0.4], // 우상
  [-0.3, -0.9], // 우하
  [0.7, 0.5], // 좌하
];

function drawDistortedRect(g, cx, cy, size, errorA, errorB, col) {
  const half = size / 2;
  const jitterX = map(errorB, 0, 1, 0, size * JITTER_RATIO);
  const jitterY = map(errorA, 0, 1, 0, size * JITTER_RATIO);

  // 꼭짓점 기본 위치: [좌상, 우상, 우하, 좌하]
  const base = [
    [-half, -half],
    [half, -half],
    [half, half],
    [-half, half],
  ];

  g.push();
  g.translate(cx, cy);
  g.fill(col);
  g.noStroke();
  g.beginShape();
  for (let i = 0; i < 4; i++) {
    const [dirX, dirY] = CORNER_DIR[i];
    const dx = dirX * jitterX;
    const dy = dirY * jitterY;
    g.vertex(base[i][0] + dx, base[i][1] + dy);
  }
  g.endShape(CLOSE);
  g.pop();
}

// ── 레이어 2: 원 ────────────────────────────────────────────
//
// 중심에서 왼쪽 위 대각선 방향으로 errorA에 따라 이동한다.
// errorA = 0 → 정중앙
// errorA = 1 → 왼쪽 위 대각선으로 최대한 이동한 위치
//
function drawCircle(g, cx, cy, size, errorA, col) {
  const maxDist = size * DIAGONAL_DIST_RATIO;
  const circleR = size * CIRCLE_R_RATIO;

  const dist = map(errorA, 0, 1, 0, maxDist);

  const px = cx - dist * Math.SQRT1_2;
  const py = cy - dist * Math.SQRT1_2;

  g.push();
  g.noStroke();
  g.fill(col);
  g.ellipse(px, py, circleR * 2, circleR * 2);
  g.pop();
}

// ── 격자 메쉬 (그리드 오브젝트) ──────────────────────────────
//
// 가로/세로 두꺼운 막대가 전체를 관통하는 하나의 격자 메쉬.
// 테두리(가장 바깥 칸막이)는 그리지 않고 내부 칸막이(N-1개씩)만 그려서
// 사각형 박스처럼 닫힌 테두리가 생기지 않도록 한다.
// 사각형+원과 마찬가지로 하나의 단일 오브젝트로 다룬다.
//
//   격자 밀도 — errorA: 내부 칸막이 개수(N-1개씩)를 결정.
//   막대의 어긋남 — errorB: 각 막대 끝점 위치·굵기·삐져나옴을 결정.
//     errorB = 0 → 모든 막대가 곧고 균일한 기계 같은 격자.
//     errorB = 1 → 막대마다 끝이 틀어지고 굵기도 제각각인 격자.
//
// 색은 오브젝트 전체에 하나만 적용 (막대별로 다르게 뽑지 않음).
// 호출 전 noiseSeed(hashSeed(errorA, errorB))로 시드를 맞춰야 한다.
//
const GRID_MIN_N = 3; // errorA = 0 일 때 칸 수 (성김)
const GRID_MAX_N = 6; // errorA = 1 일 때 칸 수 (빽빽함)
const BAR_THICKNESS_RATIO = 0.26; // 막대 기본 굵기 = cellSize × 이 비율
const THICKNESS_JITTER_MAX_RATIO = 0.35; // errorB = 1 일 때 굵기 변동폭 (기본 굵기 대비)
const ENDPOINT_JITTER_MAX_RATIO = 0.5; // errorB = 1 일 때 막대 끝점이 흔들리는 폭 (cellSize 대비)
const OVERSHOOT_BASE_RATIO = 0.0025; // errorB와 무관한 최소 삐져나옴 (size 대비)
const OVERSHOOT_JITTER_MAX_RATIO = 0.04; // errorB = 1 일 때 추가되는 삐져나옴 (size 대비)

// errorA(0~1) → 격자 칸 수(N)
function gridDensityFromErrorA(errorA) {
  return Math.round(map(errorA, 0, 1, GRID_MIN_N, GRID_MAX_N));
}

// 두 점을 잇는 두꺼운 막대 하나
function drawBar(g, x1, y1, x2, y2, thickness) {
  g.strokeWeight(Math.max(1, thickness));
  g.line(x1, y1, x2, y2);
}

function drawGridMesh(g, cx, cy, size, n, errorB, col) {
  const half = size / 2;
  const left = cx - half;
  const top = cy - half;
  const cellSize = size / n;

  const baseThickness = cellSize * BAR_THICKNESS_RATIO;
  const thicknessJitter = map(errorB, 0, 1, 0, baseThickness * THICKNESS_JITTER_MAX_RATIO);
  const endpointJitter = map(errorB, 0, 1, 0, cellSize * ENDPOINT_JITTER_MAX_RATIO);
  const overshoot =
    size * OVERSHOOT_BASE_RATIO + map(errorB, 0, 1, 0, size * OVERSHOOT_JITTER_MAX_RATIO);

  g.stroke(col);
  g.strokeCap(SQUARE);
  g.noFill();

  // 세로 막대 N-1개 (테두리 역할을 하는 양 끝 막대는 그리지 않고 내부 칸막이만)
  for (let i = 1; i < n; i++) {
    const idealX = left + i * cellSize;
    const topX = idealX + ns(i * 11, 0) * endpointJitter;
    const botX = idealX + ns(i * 11, 7) * endpointJitter;
    const th = baseThickness + ns(i * 11, 3) * thicknessJitter;
    drawBar(g, topX, top - overshoot, botX, top + size + overshoot, th);
  }

  // 가로 막대 N-1개 (테두리 역할을 하는 양 끝 막대는 그리지 않고 내부 칸막이만)
  for (let j = 1; j < n; j++) {
    const idealY = top + j * cellSize;
    const leftY = idealY + ns(j * 17 + 500, 0) * endpointJitter;
    const rightY = idealY + ns(j * 17 + 500, 7) * endpointJitter;
    const th = baseThickness + ns(j * 17 + 500, 3) * thicknessJitter;
    drawBar(g, left - overshoot, leftY, left + size + overshoot, rightY, th);
  }
}
