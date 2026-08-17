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

     섹션 3 — 방사형 훅 (drawRadialBurstFlower, radial/)
       errorA → 중심 둘레 원 8개가 중심에서 가까워졌다(0) 멀어졌다(1)
                하는 거리
       errorB → 호가 지팡이처럼 말리는 정도 (0이면 직선, 1이면 크게 말림)

     섹션 4 — 베지어 뒤틀림 꽃잎 (drawTwistedBezierFlower, twist/)
       errorA → 꽃잎 뿌리·끝 폭 (각각 독립적으로 변함)
       errorB → 꽃잎이 옆으로 뒤틀리는 강도 (홀/짝 꽃잎 반대 방향)

     섹션 5(가칭) — 물고기 (drawFish, fish/) — 테두리 없는 플랫 컬러
     각진 아이콘 스타일. 몸통은 마름모 폴리곤 하나.
       errorA → 몸통 길이·높이 (서로 반대로 변해 넓적한 몸↔홀쭉한 몸)
       errorB → 꼬리지느러미가 벌어지는 정도 (0=뾰족한 스파이크, 1=활짝 부채꼴)

   재현성:
     사각형·원·꽃 세 종류·물고기 모두 노이즈 없이 errorA/errorB만으로
     계산되는 순수 함수라 시드가 필요 없다 (같은 입력 → 항상 같은
     결과). 그리드는 여전히 noiseSeed(hashSeed(errorA, errorB))로
     호출부에서 시드를 맞춰야 한다.

   색상:
     섹션별로 다름(아래 참고) — 사각형+원·그리드·뒤틀림 꽃잎은 항상
     고정색, 방사형 훅·물고기는 오차율에 따라 색조가 움직임.
     사각형+원 — 사각형은 SQUARE_COLOR, 원은 CIRCLE_COLOR.
     그리드   — 항상 GRID_COLOR.
     방사형 훅 — 오차율((A+B)/2)에 따라 선의 색조가 RADIAL_HUE_MIN~MAX
     (전체 색상환에 가깝게) 넓게 움직이고, 원은 거기서 RADIAL_DOT_HUE_
     OFFSET만큼 어긋난 색조를 써서 선과 항상 구분됨(웜/쿨 같은 계열
     제한 없음). 채도·명도는 고정(색조별 지각 밝기만 보정).
     뒤틀림 꽃잎 — 오차율과 무관하게 항상 고정 2색. 베지어를 더 많이
     타는 잎(홀수 인덱스)은 TWIST_PETAL_COLOR_TWISTED(#f06b77), 통통한
     잎(짝수 인덱스)은 TWIST_PETAL_COLOR_PLUMP(#ffed87), 중심 봉우리는
     TWIST_CENTER_DOT_COLOR(#9ac2ff).
     물고기   — 오차율((A+B)/2)에 따라 앞쪽 색조가 FISH_HUE_MIN~MAX
     범위에서 넓게 움직이고, 뒤쪽(꼬리 포함)은 거기서 FISH_BACK_HUE_
     OFFSET만큼 어긋난 색조를 써서 두 톤으로 나뉨. 채도·명도는 고정
     (색조별 지각 밝기만 보정).

   데이터:
     generateErrorData()가 꽃 그래픽의 errorA(u)/errorB(o)를 생성한다.
     지금은 random(0, 1)이고, 나중에 실제 데이터로 교체할 때는 이
     함수만 고치면 radial/, twist/ 두 페이지 모두에 반영된다.

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

// hue(0~360)에 따라 사람 눈에 다르게 느껴지는 밝기를 보정한다. 같은
// 명도(B) 숫자라도 노랑 근처(약 60°)는 훨씬 밝아 보이고 파랑 근처
// (약 240°)는 훨씬 어두워 보이는데, 그 반대 방향으로 코사인 곡선을
// 살짝 얹어서 색조가 넓게 움직여도 "느껴지는" 밝기는 비슷하게
// 유지되도록 한다. amplitude가 클수록 보정이 강해진다.
function perceptualBrightness(hue, baseBri, amplitude) {
  const adjusted = baseBri - amplitude * Math.cos(((hue - 60) * Math.PI) / 180);
  return Math.min(100, Math.max(30, adjusted));
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

// ── 데이터 생성 (u = errorA = unfilledRate, o = errorB = overflowRate) ──
//
// 지금은 랜덤 생성. 나중에 실제로 수집된 데이터로 교체할 때는 이 함수
// 하나만 바꾸면 radial/, twist/ 두 꽃 그래픽 페이지 모두에 반영된다.
// 실제 데이터 형식 예: { unfilledRate: 0.081, overflowRate: 0.102 }
// (unfilledRate 0.004~0.983, overflowRate 0.006~0.204 범위로 관측됨 —
//  다만 여기서는 두 값 모두 0~1 범위로 다루는 프로젝트 규칙을 따른다.)
function generateErrorData() {
  return {
    errorA: random(0, 1), // u = unfilledRate
    errorB: random(0, 1), // o = overflowRate
  };
}

// ── 섹션 3: 방사형 다발 꽃잎 ───────────────────────────────
//
// [방안 1+2 버전 — 굵은 테두리 선 + 다발 개수 축소]
// 되돌리고 싶으면: 아래 "방안 3" 블록 전체를 주석 처리하고, 이 블록의
// 주석(/* ~ */)을 해제하면 된다. 함수 이름이 같으므로 둘 중 하나만
// 활성화되어 있어야 한다(둘 다 열면 const 중복 선언 에러 발생).
/*
const RADIAL_PETAL_COUNT = 10;
const RADIAL_RADIUS_RATIO = 0.5; // 꽃 전체 반경 = size × 이 비율 (캔버스를 꽉 채움)
const RADIAL_LINE_COUNT_MIN = 1; // errorA = 0 일 때 다발 하나의 호 개수
const RADIAL_LINE_COUNT_MAX = 3; // errorA = 1 일 때 다발 하나의 호 개수
const RADIAL_SPREAD_MIN = 0.16; // errorB = 0 일 때 다발이 펼쳐지는 각도 폭 (라디안)
const RADIAL_SPREAD_MAX = 1.04; // errorB = 1 일 때 다발이 펼쳐지는 각도 폭 (라디안)
const RADIAL_TAPER_MAX_RATIO = 0.35; // errorA = 1 일 때 다발 양 끝 호가 짧아지는 최대 비율 (errorA = 0이면 타이퍼 없음)
const RADIAL_SWEEP_MAX = 4.5; // errorB = 1 일 때 호가 도는 총 각도(라디안, 약 258°) — errorB = 0이면 0(직선)
const RADIAL_HOOK_START_RATIO = 0.55; // 호 길이 중 이 비율까지는 직선 유지, 그 뒤(나머지)부터만 휨
const RADIAL_HOOK_RADIUS_RATIO = 0.35; // 훅 고리의 반지름 = radius × 이 비율 — sweep(휘는 양)과 무관하게 고정
const RADIAL_ARC_SEGMENTS = 24; // 휘는 구간을 근사하는 폴리라인 조각 수 (많을수록 매끈함)
const RADIAL_STROKE_COLOR = '#F2A03D'; // 호 색 — 단색(자리표시자, 나중에 원하는 색으로 교체 가능)
const RADIAL_STROKE_WEIGHT_RATIO = 0.06; // 호 굵기 = size × 이 비율 (겹치면 면처럼 보일 만큼 굵게)
const RADIAL_OUTLINE_COLOR = '#111'; // 검은 테두리 — 4번(뒤틀림) 그래픽과 볼드한 톤을 맞춤
const RADIAL_OUTLINE_EXTRA_RATIO = 0.018; // 테두리가 색 선 양쪽으로 삐져나오는 두께 = size × 이 비율
const RADIAL_CENTER_DOT_RATIO = 0.1; // 중심 흰 점 지름 = radius × 이 비율

function drawRadialBurstFlower(g, cx, cy, size, errorA, errorB) {
  const radius = size * RADIAL_RADIUS_RATIO;

  // 선 개수를 정수로 딱 끊어서 정하면(Math.round) 슬라이더를 움직여도
  // 한동안 아무 변화가 없다가 갑자기 선이 하나 늘어나 보인다. 대신 다음
  // 선을 미리 그려두고 굵기를 0→최대로 서서히 키워서(fade in) 실제로는
  // 계단이지만 눈에는 유기적으로 자라나는 것처럼 보이게 한다.
  const rawCount = map(errorA, 0, 1, RADIAL_LINE_COUNT_MIN, RADIAL_LINE_COUNT_MAX);
  const fullCount = Math.max(1, Math.floor(rawCount));
  const fadeAmount = rawCount - fullCount; // 0(안 보임)~1(완전히 자람)
  const lineCount = fadeAmount > 0 ? fullCount + 1 : fullCount;

  const spread = map(errorB, 0, 1, RADIAL_SPREAD_MIN, RADIAL_SPREAD_MAX);
  const taper = map(errorA, 0, 1, 0, RADIAL_TAPER_MAX_RATIO);
  const sweep = map(errorB, 0, 1, 0, RADIAL_SWEEP_MAX);
  const baseWeight = Math.max(1, size * RADIAL_STROKE_WEIGHT_RATIO);
  const outlineExtra = Math.max(1, size * RADIAL_OUTLINE_EXTRA_RATIO);

  g.push();
  g.translate(cx, cy);
  g.strokeCap(SQUARE); // 끝을 둥글리지 않고 직각으로 딱 떨어지게
  g.strokeJoin(ROUND); // 호를 잘게 쪼갠 조각들이 매끈하게 이어지도록
  g.noFill();

  for (let p = 0; p < RADIAL_PETAL_COUNT; p++) {
    const baseAngle = -HALF_PI + (TWO_PI * p) / RADIAL_PETAL_COUNT;

    for (let k = 0; k < lineCount; k++) {
      const t = lineCount > 1 ? k / (lineCount - 1) : 0.5;
      const lineAngle = baseAngle + (t - 0.5) * 2 * spread;
      const lenRatio = 1 - Math.abs(t - 0.5) * taper;
      const len = radius * lenRatio; // 호의 길이(arc length) — 직선일 때의 뻗는 거리와 같음

      const isFadingLine = k === lineCount - 1 && lineCount > fullCount;
      const lineWeight = isFadingLine ? baseWeight * fadeAmount : baseWeight;

      // 지팡이처럼 말리는 호 — 길이의 앞부분(RADIAL_HOOK_START_RATIO까지)은
      // lineAngle 방향 그대로 직선으로 뻗고, 나머지에서 훅 고리를 그린다.
      // 일단 임의 크기(RADIAL_HOOK_RADIUS_RATIO)로 좌표를 다 계산해둔 뒤,
      // 그중 중심에서 가장 먼 점이 정확히 len이 되도록 전체를 한 번에
      // 비율 조정(scale)한다 — sweep이 얼마든 "꽃이 뻗는 최대 거리"는
      // 항상 len으로 고정되고, 그 안에서 휘어지는 모양(곡률)만 달라진다.
      const straightLen = len * RADIAL_HOOK_START_RATIO;
      const hookRadius = len * RADIAL_HOOK_RADIUS_RATIO;
      const straightX = cos(lineAngle) * straightLen;
      const straightY = sin(lineAngle) * straightLen;

      const points = [
        [0, 0],
        [straightX, straightY],
      ];

      if (Math.abs(sweep) < 1e-4) {
        points.push([cos(lineAngle) * len, sin(lineAngle) * len]);
      } else {
        const circleCx = straightX + hookRadius * cos(lineAngle + HALF_PI);
        const circleCy = straightY + hookRadius * sin(lineAngle + HALF_PI);
        const alpha0 = lineAngle - HALF_PI;
        for (let seg = 1; seg <= RADIAL_ARC_SEGMENTS; seg++) {
          const alpha = alpha0 + (seg / RADIAL_ARC_SEGMENTS) * sweep;
          points.push([circleCx + hookRadius * cos(alpha), circleCy + hookRadius * sin(alpha)]);
        }
      }

      let maxDist = 0;
      for (const [x, y] of points) {
        const d = Math.hypot(x, y);
        if (d > maxDist) maxDist = d;
      }
      const scale = maxDist > 0 ? len / maxDist : 1;

      // 검은 테두리를 먼저 더 굵게 깔고, 그 위에 색 선을 얹어서
      // 4번(뒤틀림) 그래픽과 같은 "테두리 + 단색" 톤으로 맞춘다.
      g.stroke(RADIAL_OUTLINE_COLOR);
      g.strokeWeight(lineWeight + outlineExtra * 2);
      g.beginShape();
      for (const [x, y] of points) g.vertex(x * scale, y * scale);
      g.endShape();

      g.stroke(RADIAL_STROKE_COLOR);
      g.strokeWeight(lineWeight);
      g.beginShape();
      for (const [x, y] of points) g.vertex(x * scale, y * scale);
      g.endShape();
    }
  }

  g.stroke(RADIAL_OUTLINE_COLOR);
  g.strokeWeight(outlineExtra * 2);
  g.fill('#fff');
  g.ellipse(0, 0, radius * RADIAL_CENTER_DOT_RATIO, radius * RADIAL_CENTER_DOT_RATIO);
  g.pop();
}
*/

// [방안 3 버전 — 선(stroke) 대신 채워진 볼드한 콤마 모양 도형] — 폐기.
// 되돌리고 싶으면 이 블록 주석을 해제하면 된다(단, 아래 활성 버전은
// 먼저 주석 처리해야 함 — 함수 이름이 같아서 const 중복 선언 에러 남).
/*
const RADIAL_PETAL_COUNT = 10;
const RADIAL_RADIUS_RATIO = 0.5; // 꽃 전체 반경 = size × 이 비율 (캔버스를 꽉 채움)
const RADIAL_LINE_COUNT_MIN = 1; // errorA = 0 일 때 다발 하나의 도형 개수
const RADIAL_LINE_COUNT_MAX = 3; // errorA = 1 일 때 다발 하나의 도형 개수
const RADIAL_SPREAD_MIN = 0.16; // errorB = 0 일 때 다발이 펼쳐지는 각도 폭 (라디안)
const RADIAL_SPREAD_MAX = 1.04; // errorB = 1 일 때 다발이 펼쳐지는 각도 폭 (라디안)
const RADIAL_TAPER_MAX_RATIO = 0.35; // errorA = 1 일 때 다발 양 끝 도형이 짧아지는 최대 비율
const RADIAL_SWEEP_MAX = 4.5; // errorB = 1 일 때 도는 총 각도(라디안, 약 258°) — errorB = 0이면 0(직선)
const RADIAL_HOOK_START_RATIO = 0.55; // 길이 중 이 비율까지는 직선 유지, 그 뒤부터만 휨
const RADIAL_HOOK_RADIUS_RATIO = 0.35; // 훅 고리의 반지름 = radius × 이 비율 — sweep과 무관하게 고정
const RADIAL_ARC_SEGMENTS = 24; // 휘는 구간을 근사하는 폴리라인 조각 수
const RADIAL_SHAPE_WIDTH_RATIO = 0.11; // 도형 밑동 폭(가장 굵은 부분) = size × 이 비율
const RADIAL_TIP_TAPER_START = 0.6; // 전체 길이 중 이 비율 지점부터 폭이 점점 좁아짐(그 전까지는 폭 유지)
const RADIAL_FILL_COLOR = '#F2A03D'; // 도형 색 — 단색(자리표시자, 나중에 원하는 색으로 교체 가능)
const RADIAL_OUTLINE_COLOR = '#111'; // 검은 테두리 — 4번(뒤틀림) 그래픽과 볼드한 톤을 맞춤
const RADIAL_OUTLINE_WEIGHT_RATIO = 0.02; // 테두리 굵기 = size × 이 비율
const RADIAL_CENTER_DOT_RATIO = 0.1; // 중심 흰 점 지름 = radius × 이 비율

// 길이 진행률(tFrac 0~1)에 따른 폭 배수 — RADIAL_TIP_TAPER_START까지는
// 1(최대 폭 유지), 그 뒤로는 끝(1)에서 0이 되도록 선형으로 좁아짐.
function radialTaperFactor(tFrac) {
  if (tFrac < RADIAL_TIP_TAPER_START) return 1;
  const local = (tFrac - RADIAL_TIP_TAPER_START) / (1 - RADIAL_TIP_TAPER_START);
  return 1 - local;
}

function drawRadialBurstFlower(g, cx, cy, size, errorA, errorB) {
  const radius = size * RADIAL_RADIUS_RATIO;

  // 개수를 정수로 딱 끊어서 정하면(Math.round) 슬라이더를 움직여도
  // 한동안 아무 변화가 없다가 갑자기 도형이 하나 늘어나 보인다. 대신
  // 다음 도형을 미리 그려두고 폭을 0→최대로 서서히 키워서(fade in)
  // 계단이지만 눈에는 유기적으로 자라나는 것처럼 보이게 한다.
  const rawCount = map(errorA, 0, 1, RADIAL_LINE_COUNT_MIN, RADIAL_LINE_COUNT_MAX);
  const fullCount = Math.max(1, Math.floor(rawCount));
  const fadeAmount = rawCount - fullCount; // 0(안 보임)~1(완전히 자람)
  const lineCount = fadeAmount > 0 ? fullCount + 1 : fullCount;

  const spread = map(errorB, 0, 1, RADIAL_SPREAD_MIN, RADIAL_SPREAD_MAX);
  const taper = map(errorA, 0, 1, 0, RADIAL_TAPER_MAX_RATIO);
  const sweep = map(errorB, 0, 1, 0, RADIAL_SWEEP_MAX);
  const maxWidth = size * RADIAL_SHAPE_WIDTH_RATIO;
  const outlineWeight = Math.max(1, size * RADIAL_OUTLINE_WEIGHT_RATIO);

  g.push();
  g.translate(cx, cy);
  g.stroke(RADIAL_OUTLINE_COLOR);
  g.strokeWeight(outlineWeight);
  g.strokeJoin(ROUND);
  g.fill(RADIAL_FILL_COLOR);

  for (let p = 0; p < RADIAL_PETAL_COUNT; p++) {
    const baseAngle = -HALF_PI + (TWO_PI * p) / RADIAL_PETAL_COUNT;

    for (let k = 0; k < lineCount; k++) {
      const t = lineCount > 1 ? k / (lineCount - 1) : 0.5;
      const lineAngle = baseAngle + (t - 0.5) * 2 * spread;
      const lenRatio = 1 - Math.abs(t - 0.5) * taper;
      const len = radius * lenRatio; // 중심선 길이 — 직선일 때의 뻗는 거리와 같음

      const isFadingLine = k === lineCount - 1 && lineCount > fullCount;
      const widthScale = isFadingLine ? fadeAmount : 1;

      // 훅 중심선 좌표 계산 (방안 1+2와 동일한 방식) — 앞부분은 직선,
      // 뒷부분은 반지름 고정 원호. 이후 중심에서 가장 먼 점이 정확히
      // len이 되도록 전체를 스케일 조정해서 sweep과 무관하게 꽃이
      // 뻗는 최대 거리를 일정하게 유지한다.
      const straightLen = len * RADIAL_HOOK_START_RATIO;
      const hookRadius = len * RADIAL_HOOK_RADIUS_RATIO;
      const straightX = cos(lineAngle) * straightLen;
      const straightY = sin(lineAngle) * straightLen;

      const center = [
        [0, 0],
        [straightX, straightY],
      ];

      if (Math.abs(sweep) < 1e-4) {
        center.push([cos(lineAngle) * len, sin(lineAngle) * len]);
      } else {
        const circleCx = straightX + hookRadius * cos(lineAngle + HALF_PI);
        const circleCy = straightY + hookRadius * sin(lineAngle + HALF_PI);
        const alpha0 = lineAngle - HALF_PI;
        for (let seg = 1; seg <= RADIAL_ARC_SEGMENTS; seg++) {
          const alpha = alpha0 + (seg / RADIAL_ARC_SEGMENTS) * sweep;
          center.push([circleCx + hookRadius * cos(alpha), circleCy + hookRadius * sin(alpha)]);
        }
      }

      let maxDist = 0;
      for (const [x, y] of center) {
        const d = Math.hypot(x, y);
        if (d > maxDist) maxDist = d;
      }
      const scale = maxDist > 0 ? len / maxDist : 1;
      const scaled = center.map(([x, y]) => [x * scale, y * scale]);

      // 중심선을 따라 좌우로 폭만큼 offset해서 리본(닫힌 도형) 생성.
      // 각 점의 접선 방향(앞뒤 이웃 점 차이)에 수직인 방향으로 민다.
      const n = scaled.length;
      const left = [];
      const right = [];
      for (let i = 0; i < n; i++) {
        const [x, y] = scaled[i];
        const prev = scaled[Math.max(0, i - 1)];
        const next = scaled[Math.min(n - 1, i + 1)];
        const tx = next[0] - prev[0];
        const ty = next[1] - prev[1];
        const tlen = Math.hypot(tx, ty) || 1;
        const nx = -ty / tlen;
        const ny = tx / tlen;
        const w = (maxWidth * widthScale * radialTaperFactor(i / (n - 1))) / 2;
        left.push([x + nx * w, y + ny * w]);
        right.push([x - nx * w, y - ny * w]);
      }

      g.beginShape();
      for (const [x, y] of left) g.vertex(x, y);
      for (let i = n - 1; i >= 0; i--) g.vertex(right[i][0], right[i][1]);
      g.endShape(CLOSE);
    }
  }

  g.fill('#fff');
  g.ellipse(0, 0, radius * RADIAL_CENTER_DOT_RATIO, radius * RADIAL_CENTER_DOT_RATIO);
  g.pop();
}
*/

// [현재 버전 — 얇은 단색 호 하나, 뾰족한 끝 없이 직선으로 딱 끝남]
// errorB가 만드는 훅(직선 구간 + 원호로 마는 부분) 형태는 그대로 두고,
// 볼드한 굵기/검은 테두리/뾰족한 끝 처리는 전부 제거했다. errorA는
// 지금 이 함수에서 아직 안 쓴다 — 나중에 "중심에서 가까워졌다
// 멀어졌다 하는 원형"으로 다시 설계할 예정이라 자리만 비워둔 상태.
const RADIAL_PETAL_COUNT = 10;
const RADIAL_RADIUS_RATIO = 0.5; // 꽃 전체 반경 = size × 이 비율 (캔버스를 꽉 채움)
const RADIAL_SWEEP_MAX = 4.5; // errorB = 1 일 때 도는 총 각도(라디안, 약 258°) — errorB = 0이면 0(직선)
const RADIAL_HOOK_START_RATIO = 0.55; // 길이 중 이 비율까지는 직선 유지, 그 뒤부터만 휨
const RADIAL_HOOK_RADIUS_RATIO = 0.35; // 훅 고리의 반지름 = radius × 이 비율 — sweep과 무관하게 고정
const RADIAL_ARC_SEGMENTS = 24; // 휘는 구간을 근사하는 폴리라인 조각 수
// 호(선) 색상 — 웜/쿨 같은 계열 제한 없이 색조 전체를 오차율에 따라
// 넓게 사용한다(단조로움 방지). 채도·명도는 고정 기준값에서 색조별
// 지각 밝기 차이만 보정.
const RADIAL_HUE_MIN = 0; // errorScore = 0 일 때 기준 색조 (빨강)
const RADIAL_HUE_MAX = 300; // errorScore = 1 일 때 기준 색조 (보라) — 360까지 다 채우면 양 끝이 빨강으로 겹쳐 보이므로 여유를 둠
const RADIAL_DOT_HUE_OFFSET = 150; // 원 색조 = 선 색조 + 이 값 — 항상 선과 구분되도록 고정 오프셋
const RADIAL_LINE_SAT = 75; // 채도(%) — 오차율과 무관하게 고정
const RADIAL_LINE_BRI = 95; // 명도(%) 기준값 — 실제로는 색조에 따라 아래 보정폭만큼 흔들림
const RADIAL_LINE_BRI_COMPENSATION = 10; // 색조별 지각 밝기 보정 폭 (전 색조를 다 지나가므로 기존보다 넉넉하게)
const RADIAL_STROKE_WEIGHT_RATIO = 0.1; // 호 굵기 = size × 이 비율 (볼드하지 않은 일반 두께)
const RADIAL_CENTER_DOT_RATIO = 0.1; // 중심 흰 점 지름 = radius × 이 비율

// errorA가 제어하는 방사형 원 — 8개가 중심 둘레에 균등 배치되고,
// errorA = 0이면 중심 흰 점 뒤에 거의 숨을 만큼 가까이 모이고,
// errorA = 1에 가까울수록 바깥으로 점점 퍼져나간다.
// 색상은 호(선)와 같은 전체 색조 범위를 쓰되, RADIAL_DOT_HUE_OFFSET만큼
// 어긋난 색조를 써서 선과는 항상 구분되도록 한다.
const RADIAL_DOT_COUNT = 8;
const RADIAL_DOT_MIN_DIST_RATIO = 0.03; // errorA = 0 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_MAX_DIST_RATIO = 0.9; // errorA = 1 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_SIZE_RATIO = 0.35; // 원 하나의 지름 = radius × 이 비율
const RADIAL_DOT_SAT = 80; // 채도(%) — 오차율과 무관하게 고정
const RADIAL_DOT_BRI = 88; // 명도(%) 기준값 — 실제로는 색조에 따라 아래 보정폭만큼 흔들림
const RADIAL_DOT_BRI_COMPENSATION = 12; // 색조별 지각 밝기 보정 폭

// lineAngleOffset/dotAngleOffset: 순전히 장식용 회전 애니메이션을 위한
// 선택 인자(기본 0). errorA/errorB로 정해지는 모양·색·거리에는 전혀
// 영향을 주지 않고, 이미 계산된 각도에 더해져서 그룹 전체를 그대로
// 회전시키기만 한다(호 그룹과 점 그룹을 서로 다른 값으로 넣으면 각자
// 다른 속도로 돌릴 수 있음).
function drawRadialBurstFlower(g, cx, cy, size, errorA, errorB, lineAngleOffset = 0, dotAngleOffset = 0) {
  const radius = size * RADIAL_RADIUS_RATIO;
  const sweep = map(errorB, 0, 1, 0, RADIAL_SWEEP_MAX);
  const weight = Math.max(1, size * RADIAL_STROKE_WEIGHT_RATIO);

  // 오차율(A/B 평균) → 선의 색조가 전체 색상환을 넓게 오간다(웜/쿨 구분 없음).
  // 채도는 고정, 명도는 색조별 지각 밝기 차이를 보정해서 "느껴지는" 톤이
  // 비슷하게 유지되도록 한다.
  const errorScore = (errorA + errorB) / 2;
  const lineHue = map(errorScore, 0, 1, RADIAL_HUE_MIN, RADIAL_HUE_MAX);
  const lineBri = perceptualBrightness(lineHue, RADIAL_LINE_BRI, RADIAL_LINE_BRI_COMPENSATION);
  const strokeCol = g.color(lineHue, RADIAL_LINE_SAT, lineBri);

  g.push();
  g.translate(cx, cy);
  g.stroke(strokeCol);
  g.strokeWeight(weight);
  g.strokeCap(SQUARE); // 뾰족한 끝 없이 직선으로 딱 끝남
  g.strokeJoin(ROUND); // 휘는 구간의 잘게 쪼갠 조각들이 매끈하게 이어지도록
  g.noFill();

  for (let p = 0; p < RADIAL_PETAL_COUNT; p++) {
    const lineAngle = -HALF_PI + (TWO_PI * p) / RADIAL_PETAL_COUNT + lineAngleOffset;
    const len = radius;

    // 지팡이처럼 말리는 호 — 길이의 앞부분(RADIAL_HOOK_START_RATIO까지)은
    // 직선으로 뻗고, 나머지에서 반지름 고정(RADIAL_HOOK_RADIUS_RATIO)
    // 원호를 그린다. 이후 중심에서 가장 먼 점이 정확히 len이 되도록
    // 전체를 스케일 조정해서, sweep(errorB)이 얼마든 꽃이 뻗는 최대
    // 거리는 항상 일정하게 유지하고 휘어지는 모양만 달라지게 한다.
    const straightLen = len * RADIAL_HOOK_START_RATIO;
    const hookRadius = len * RADIAL_HOOK_RADIUS_RATIO;
    const straightX = cos(lineAngle) * straightLen;
    const straightY = sin(lineAngle) * straightLen;

    const points = [
      [0, 0],
      [straightX, straightY],
    ];

    if (Math.abs(sweep) < 1e-4) {
      points.push([cos(lineAngle) * len, sin(lineAngle) * len]);
    } else {
      const circleCx = straightX + hookRadius * cos(lineAngle + HALF_PI);
      const circleCy = straightY + hookRadius * sin(lineAngle + HALF_PI);
      const alpha0 = lineAngle - HALF_PI;
      for (let seg = 1; seg <= RADIAL_ARC_SEGMENTS; seg++) {
        const alpha = alpha0 + (seg / RADIAL_ARC_SEGMENTS) * sweep;
        points.push([circleCx + hookRadius * cos(alpha), circleCy + hookRadius * sin(alpha)]);
      }
    }

    let maxDist = 0;
    for (const [x, y] of points) {
      const d = Math.hypot(x, y);
      if (d > maxDist) maxDist = d;
    }
    const scale = maxDist > 0 ? len / maxDist : 1;

    g.beginShape();
    for (const [x, y] of points) g.vertex(x * scale, y * scale);
    g.endShape();
  }

  // errorA가 제어하는 방사형 원 8개 — 중심 흰 점보다 먼저 그려서,
  // errorA가 작을 땐 흰 점 뒤로 거의 가려지게 한다.
  const dotDist = map(errorA, 0, 1, RADIAL_DOT_MIN_DIST_RATIO, RADIAL_DOT_MAX_DIST_RATIO) * radius;
  const dotSize = radius * RADIAL_DOT_SIZE_RATIO;
  const dotHue = (lineHue + RADIAL_DOT_HUE_OFFSET) % 360;
  const dotBri = perceptualBrightness(dotHue, RADIAL_DOT_BRI, RADIAL_DOT_BRI_COMPENSATION);
  const dotCol = g.color(dotHue, RADIAL_DOT_SAT, dotBri);
  g.noStroke();
  g.fill(dotCol);
  for (let d = 0; d < RADIAL_DOT_COUNT; d++) {
    const dotAngle = -HALF_PI + (TWO_PI * d) / RADIAL_DOT_COUNT + dotAngleOffset;
    g.ellipse(cos(dotAngle) * dotDist, sin(dotAngle) * dotDist, dotSize, dotSize);
  }

  g.fill('#fff');
  g.ellipse(0, 0, radius * RADIAL_CENTER_DOT_RATIO, radius * RADIAL_CENTER_DOT_RATIO);
  g.pop();
}

// ── 섹션 4: 베지어 뒤틀림 꽃잎 ─────────────────────────────────
//
// 베지어 곡선으로 그린 꽃잎 10장이 각자 옆으로 뒤틀리는 꽃. 홀수/짝수
// 꽃잎이 반대 방향으로 뒤틀려서 바람개비처럼 도는 느낌을 준다(무작위가
// 아니라 인덱스 홀짝에 따른 규칙적인 패턴). 노이즈 없이 errorA/errorB
// 만으로 결정되는 순수 함수.
//
//   errorA(=u) → 꽃잎 끝/뿌리의 폭(좁고 뾰족함 ↔ 넓고 둥긂, 서로 독립적)
//   errorB(=o) → 꽃잎이 옆으로 뒤틀리는 강도. 홀/짝 꽃잎이 반대 방향.
//
// g: 그릴 대상 — 메인 캔버스(전역 p5, 즉 window)이거나
//    createGraphics()로 만든 개별 버퍼(p5.Graphics).
//
const TWIST_PETAL_COUNT = 10;
const TWIST_RADIUS_RATIO = 0.5; // 꽃 전체 반경(=꽃잎 길이) = size × 이 비율 (캔버스를 꽉 채움)
const PETAL_TIP_WIDTH_MIN_RATIO = 0.04; // errorA = 0 일 때 꽃잎 끝 반폭 (반경 대비)
const PETAL_TIP_WIDTH_MAX_RATIO = 0.55; // errorA = 1 일 때 꽃잎 끝 반폭 (반경 대비)
const PETAL_ROOT_WIDTH_MIN_RATIO = 0.06; // errorA = 0 일 때 꽃잎 뿌리 반폭 (반경 대비)
const PETAL_ROOT_WIDTH_MAX_RATIO = 0.32; // errorA = 1 일 때 꽃잎 뿌리 반폭 (반경 대비)
// 끝 폭과 뿌리 폭은 서로 비례하지 않고 각자 독립적으로 변한다 — errorA가 작을 땐
// 뿌리가 끝보다 넓고(둥근 방울 느낌), errorA가 클수록 끝이 뿌리보다 넓어진다(활짝 핀 느낌).
const PETAL_TWIST_MAX_RATIO = 0.6; // errorB = 1 일 때 옆으로 밀리는 최대 폭 (반경 대비)
// 꽃잎 색상 — 오차율과 무관하게 항상 고정 2색. 베지어 뒤틀림을 더
// 강하게 받는 잎(홀수 인덱스, dir=-1, 자기 자신과 꼬일 수 있는 쪽)과
// 상대적으로 통통하게 유지되는 잎(짝수 인덱스, dir=+1)을 각각 다른
// 색으로 구분한다.
const TWIST_PETAL_COLOR_TWISTED = '#ffed87'; // 베지어를 더 많이 타는 잎(홀수 인덱스)
const TWIST_PETAL_COLOR_PLUMP = '#f06b77'; // 통통하게 유지되는 잎(짝수 인덱스)
const TWIST_STROKE_COLOR = '#111'; // 꽃잎 테두리 — 볼드한 느낌을 주는 굵은 검은 선
const TWIST_STROKE_WEIGHT_RATIO = 0.025; // 테두리 굵기 = size × 이 비율
const TWIST_CENTER_DOT_COLOR = '#9ac2ff'; // 중심 봉우리 색
const TWIST_CENTER_DOT_RATIO = 0.26; // 중심 점 지름 = radius × 이 비율

// twistedAngleOffset/plumpAngleOffset: 순전히 장식용 회전 애니메이션을
// 위한 선택 인자(기본 0). errorA/errorB로 정해지는 모양·색에는 영향을
// 주지 않는다. 이미 색으로도 구분해둔 두 잎 그룹 — 베지어를 더 많이
// 타는 잎(홀수 인덱스, TWIST_PETAL_COLOR_TWISTED)과 통통한 잎(짝수
// 인덱스, TWIST_PETAL_COLOR_PLUMP) — 을 서로 다른 값으로 넣으면 방사형의
// 호/점 그룹처럼 각자 다른 속도로 돌릴 수 있다.
function drawTwistedBezierFlower(g, cx, cy, size, errorA, errorB, twistedAngleOffset = 0, plumpAngleOffset = 0) {
  const radius = size * TWIST_RADIUS_RATIO;
  const tipHalf = radius * map(errorA, 0, 1, PETAL_TIP_WIDTH_MIN_RATIO, PETAL_TIP_WIDTH_MAX_RATIO);
  const rootHalf = radius * map(errorA, 0, 1, PETAL_ROOT_WIDTH_MIN_RATIO, PETAL_ROOT_WIDTH_MAX_RATIO);
  const twistMag = radius * map(errorB, 0, 1, 0, PETAL_TWIST_MAX_RATIO);
  const strokeW = Math.max(1, size * TWIST_STROKE_WEIGHT_RATIO);

  g.strokeJoin(ROUND); // 꽃잎 윤곽선이 꺾이는 부분을 뾰족하지 않고 둥글게

  // 뒤틀림이 심하면 베지어 곡선이 자기 자신과 교차하면서 꼬인 모양이
  // 나오는데(의도한 모습), 그게 맨 위(나중에 그려짐)에 있으면 도드라져
  // 보인다. 짝수 인덱스(dir=+1)는 안 꼬이는 쪽이라 나중에(위에) 그려서
  // 홀수 인덱스(dir=-1, 꼬일 수 있는 쪽)를 자연스럽게 덮게 한다.
  const drawOrder = [];
  for (let i = 1; i < TWIST_PETAL_COUNT; i += 2) drawOrder.push(i);
  for (let i = 0; i < TWIST_PETAL_COUNT; i += 2) drawOrder.push(i);

  for (const i of drawOrder) {
    const dir = i % 2 === 0 ? 1 : -1;
    const angleOffset = dir === -1 ? twistedAngleOffset : plumpAngleOffset;
    const angle = -HALF_PI + (TWO_PI * i) / TWIST_PETAL_COUNT + angleOffset;
    const twist = twistMag * dir;

    g.push();
    g.translate(cx, cy);
    g.rotate(angle);

    // 꽃잎 외곽 — 팁(0, -radius)은 중심선에 고정하고 베지어 제어점만
    // 뒤틀림만큼 옆으로 밀어서, 리본이 비틀리듯 몸통만 휘어 보이게 한다.
    // 단색 채움 + 굵은 검은 테두리로 볼드한 느낌을 준다.
    g.stroke(TWIST_STROKE_COLOR);
    g.strokeWeight(strokeW);
    g.fill(dir === -1 ? TWIST_PETAL_COLOR_TWISTED : TWIST_PETAL_COLOR_PLUMP);
    g.beginShape();
    g.vertex(0, 0);
    g.bezierVertex(
      rootHalf + twist,
      -radius * 0.28,
      tipHalf + twist * 0.5,
      -radius * 0.72,
      0,
      -radius
    );
    g.bezierVertex(
      -tipHalf - twist * 0.5,
      -radius * 0.72,
      -rootHalf - twist,
      -radius * 0.28,
      0,
      0
    );
    g.endShape(CLOSE);

    g.pop();
  }

  // 중심 봉우리 — 채움은 TWIST_CENTER_DOT_COLOR, 꽃잎과 같은 굵은 검은 테두리로 통일
  g.stroke(TWIST_STROKE_COLOR);
  g.strokeWeight(strokeW);
  g.fill(TWIST_CENTER_DOT_COLOR);
  g.ellipse(cx, cy, radius * TWIST_CENTER_DOT_RATIO, radius * TWIST_CENTER_DOT_RATIO);
}

// ── 섹션 5(가칭): 물고기 ────────────────────────────────────────
//
// 플랫 컬러의 각진 아이콘 스타일 — 테두리 없이 순수 색 블록으로만
// 구성. 몸통은 마름모(kite) 윤곽선 네 변인데, errorA가 커질수록 그
// 변들이 직선(각짐)에서 바깥으로 부푼 곡선(둥긂)으로 바뀌고 동시에
// 몸도 더 길쭉해진다(각지고 넓적함↔둥글고 홀쭉함을 함께 오감).
// errorB → 꼬리지느러미가 벌어지는 정도인데, 각도만 벌어지는 게
// 아니라 길이도 같이 늘어나서(0=짧고 뾰족한 스파이크, 1=길고 활짝
// 벌어진 부채꼴) 변화가 훨씬 크게 느껴지게 했다. 몸통은 앞/뒤 두 톤
// (색조가 다른 두 색)으로 나뉘어 보이는데, 마름모의 위/아래 꼭짓점을
// 공유하는 앞쪽 절반만 다른 색으로 덮어 그려서 이음매 없이 두 톤이
// 나뉜다(윤곽선이 곡선이어도 두 절반이 같은 곡선 계산을 공유해서 딱
// 맞음). 노이즈 없이 errorA/errorB만으로 계산되는 순수 함수.
//
const FISH_BODY_LENGTH_MIN_RATIO = 0.5; // errorA = 0 일 때 몸통 길이(가로) = size × 이 비율
const FISH_BODY_LENGTH_MAX_RATIO = 1.0; // errorA = 1 일 때 몸통 길이
const FISH_BODY_HEIGHT_MIN_RATIO = 0.62; // errorA = 0 일 때 몸통 높이(세로) = size × 이 비율
const FISH_BODY_HEIGHT_MAX_RATIO = 0.22; // errorA = 1 일 때 몸통 높이 — 길이와 반대로 줄어들어 넓적한 몸↔홀쭉한 몸 대비를 만듦
const FISH_BODY_ROUNDNESS_MIN = 0; // errorA = 0 일 때 윤곽선 부풀기 정도 — 0이면 완전히 직선(각진 마름모)
const FISH_BODY_ROUNDNESS_MAX = 0.7; // errorA = 1 일 때 윤곽선 부풀기 정도 — 변 길이 대비 바깥으로 부푸는 비율
const FISH_TAIL_LENGTH_MIN_RATIO = 0.22; // errorB = 0 일 때 꼬리 길이 = 몸통 길이 × 이 비율 — 짧고 뾰족
const FISH_TAIL_LENGTH_MAX_RATIO = 0.75; // errorB = 1 일 때 꼬리 길이 — 길고 활짝
const FISH_TAIL_SPREAD_MIN_DEG = 6; // errorB = 0 일 때 꼬리 열림각(도) — 거의 뾰족한 스파이크
const FISH_TAIL_SPREAD_MAX_DEG = 72; // errorB = 1 일 때 꼬리 열림각(도) — 활짝 부채꼴
const FISH_FIN_SIZE_RATIO = 0.16; // 배지느러미 크기(고정 장식) = 몸통 높이 × 이 비율
const FISH_EYE_RATIO = 0.11; // 눈 지름 = size × 이 비율
const FISH_HUE_MIN = 0; // errorScore = 0 일 때 앞쪽 색조
const FISH_HUE_MAX = 300; // errorScore = 1 일 때 앞쪽 색조 — 360까지 채우면 양 끝이 겹쳐 보이므로 여유를 둠
const FISH_BACK_HUE_OFFSET = 30; // 뒤쪽(꼬리 포함) 색조 = 앞쪽 색조 + 이 값
const FISH_SAT = 85; // 채도(%) — 오차율과 무관하게 고정
const FISH_BRI = 92; // 명도(%) 기준값 — 실제로는 색조에 따라 아래 보정폭만큼 흔들림
const FISH_BRI_COMPENSATION = 10; // 색조별 지각 밝기 보정 폭

// 두 점을 잇는 변을 곧게(roundAmount=0) 또는 바깥으로 부풀린 곡선으로
// 그린다 — g.vertex(x1,y1)을 먼저 호출해둔 상태에서 이어서 쓴다.
function fishBulgeEdge(g, x1, y1, x2, y2, roundAmount) {
  if (roundAmount <= 0) {
    g.vertex(x2, y2);
    return;
  }
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  let nx = -(y2 - y1);
  let ny = x2 - x1;
  const nlen = Math.hypot(nx, ny) || 1;
  nx /= nlen;
  ny /= nlen;
  if (nx * mx + ny * my < 0) {
    nx = -nx;
    ny = -ny;
  }
  const segLen = Math.hypot(x2 - x1, y2 - y1);
  const offset = segLen * roundAmount * 0.5;
  const cx = mx + nx * offset;
  const cy = my + ny * offset;
  g.bezierVertex(cx, cy, cx, cy, x2, y2);
}

function drawFish(g, cx, cy, size, errorA, errorB) {
  const bodyLen = size * map(errorA, 0, 1, FISH_BODY_LENGTH_MIN_RATIO, FISH_BODY_LENGTH_MAX_RATIO);
  const bodyH = size * map(errorA, 0, 1, FISH_BODY_HEIGHT_MIN_RATIO, FISH_BODY_HEIGHT_MAX_RATIO);
  const halfH = bodyH / 2;
  const roundAmount = map(errorA, 0, 1, FISH_BODY_ROUNDNESS_MIN, FISH_BODY_ROUNDNESS_MAX);
  const tailLen = bodyLen * map(errorB, 0, 1, FISH_TAIL_LENGTH_MIN_RATIO, FISH_TAIL_LENGTH_MAX_RATIO);
  const spreadRad = radians(map(errorB, 0, 1, FISH_TAIL_SPREAD_MIN_DEG, FISH_TAIL_SPREAD_MAX_DEG));

  const errorScore = (errorA + errorB) / 2;
  const frontHue = map(errorScore, 0, 1, FISH_HUE_MIN, FISH_HUE_MAX);
  const backHue = (frontHue + FISH_BACK_HUE_OFFSET) % 360;
  const frontBri = perceptualBrightness(frontHue, FISH_BRI, FISH_BRI_COMPENSATION);
  const backBri = perceptualBrightness(backHue, FISH_BRI, FISH_BRI_COMPENSATION);
  const frontCol = g.color(frontHue, FISH_SAT, frontBri);
  const backCol = g.color(backHue, FISH_SAT, backBri);

  // 머리는 오른쪽(+x), 꼬리는 왼쪽(-x) 방향
  const frontX = bodyLen / 2;
  const backX = -bodyLen / 2;

  g.push();
  g.translate(cx, cy);
  g.noStroke();

  // 꼬리지느러미 — 몸통보다 먼저 그려서 뒤에 자연스럽게 깔림
  const tipX = backX - tailLen;
  const upY = -Math.sin(spreadRad / 2) * tailLen;
  const downY = Math.sin(spreadRad / 2) * tailLen;
  g.fill(backCol);
  g.beginShape();
  g.vertex(backX, 0);
  g.vertex(tipX, upY);
  g.vertex(tipX, downY);
  g.endShape(CLOSE);

  // 몸통 — 마름모 윤곽선(네 변, roundAmount만큼 바깥으로 부풂)을 뒤쪽
  // 색으로 채운 뒤, 앞쪽 절반(위/아래 꼭짓점을 공유하는 절반)만 같은
  // 곡선 계산을 재사용해 다른 색으로 겹쳐 그려서 두 톤으로 나뉘어 보이게 한다.
  g.fill(backCol);
  g.beginShape();
  g.vertex(frontX, 0);
  fishBulgeEdge(g, frontX, 0, 0, -halfH, roundAmount);
  fishBulgeEdge(g, 0, -halfH, backX, 0, roundAmount);
  fishBulgeEdge(g, backX, 0, 0, halfH, roundAmount);
  fishBulgeEdge(g, 0, halfH, frontX, 0, roundAmount);
  g.endShape(CLOSE);

  g.fill(frontCol);
  g.beginShape();
  g.vertex(frontX, 0);
  fishBulgeEdge(g, frontX, 0, 0, -halfH, roundAmount);
  g.vertex(0, halfH);
  fishBulgeEdge(g, 0, halfH, frontX, 0, roundAmount);
  g.endShape(CLOSE);

  // 배지느러미 — 작은 삼각형 하나(고정 장식, 몸통 크기에 비례만 함)
  const finSize = bodyH * FISH_FIN_SIZE_RATIO;
  g.fill(backCol);
  g.beginShape();
  g.vertex(-finSize * 0.5, halfH);
  g.vertex(finSize * 0.5, halfH);
  g.vertex(0, halfH + finSize);
  g.endShape(CLOSE);

  // 눈
  const eyeX = frontX * 0.45;
  const eyeSize = size * FISH_EYE_RATIO;
  g.fill('#fff');
  g.ellipse(eyeX, -halfH * 0.18, eyeSize, eyeSize);
  g.fill('#111');
  g.ellipse(eyeX, -halfH * 0.18, eyeSize * 0.5, eyeSize * 0.5);

  g.pop();
}
