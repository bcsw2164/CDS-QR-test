/* ============================================================
   Signature System — core.js
   ------------------------------------------------------------
   각 슬라이더 단일 생성기 페이지(radial/)와 archive/sketch.js
   (아카이브 그리드)가 공유하는 그래픽 생성 로직. 여기를 고치면
   해당하는 페이지 모두에 반영된다.

   그래픽 구성:
     섹션 3 — 방사형 훅 (drawRadialBurstFlower, radial/)
       errorA → 중심 둘레 원 8개가 중심에서 가까워졌다(0) 멀어졌다(1)
                하는 거리
       errorB → 호가 지팡이처럼 말리는 정도 (0이면 직선, 1이면 크게 말림)

   재현성:
     노이즈 없이 errorA/errorB만으로 계산되는 순수 함수라 시드가
     필요 없다 (같은 입력 → 항상 같은 결과).

   색상:
     방사형 훅 — errorA/errorB와 무관하게 RADIAL_COLOR_PALETTE(5색) 중
     완전히 무작위로 선·점 색을 하나씩 뽑음(pickRadialColors(), 겹치지
     않게 보장). 새 아이템을 생성할 때 한 번만 뽑아 고정해서 쓴다.

   데이터:
     generateErrorData()가 꽃 그래픽의 errorA(u)/errorB(o)를 생성한다.
     지금은 random(0, 1)이고, 나중에 실제 데이터로 교체할 때는 이
     함수만 고치면 radial/ 페이지에 반영된다.

   렌더링 대상(g):
     drawRadialBurstFlower는 첫 인자로 그릴 대상 g를 받는다. 메인
     캔버스에 그릴 때는 window(전역 p5 함수들이 묶여있는 객체)를,
     아카이브 그리드처럼 아이템별 개별 버퍼에 그릴 때는
     createGraphics()로 만든 p5.Graphics 객체를 넘긴다. 두 쪽 다
     동일한 draw API(push/fill/vertex 등)를 가지므로 함수 내부는
     대상이 무엇이든 신경 쓰지 않는다.

   크기 규칙:
     이 파일의 모든 도형 수치는 호출부에서 넘겨받은 size(캔버스/셀
     크기) 대비 비율(XXX_RATIO 상수)로만 계산한다. 픽셀 고정값은 여기
     없음 — 캔버스 크기는 호출하는 sketch.js가 화면에 맞게 정한다.
   ============================================================ */

// hue(0~360)에 따라 사람 눈에 다르게 느껴지는 밝기를 보정한다. 같은
// 명도(B) 숫자라도 노랑 근처(약 60°)는 훨씬 밝아 보이고 파랑 근처
// (약 240°)는 훨씬 어두워 보이는데, 그 반대 방향으로 코사인 곡선을
// 살짝 얹어서 색조가 넓게 움직여도 "느껴지는" 밝기는 비슷하게
// 유지되도록 한다. amplitude가 클수록 보정이 강해진다.
function perceptualBrightness(hue, baseBri, amplitude) {
  const adjusted = baseBri - amplitude * Math.cos(((hue - 60) * Math.PI) / 180);
  return Math.min(100, Math.max(30, adjusted));
}

// ── 데이터 생성 (u = errorA = unfilledRate, o = errorB = overflowRate) ──
//
// 지금은 랜덤 생성. 나중에 실제로 수집된 데이터로 교체할 때는 이 함수
// 하나만 바꾸면 radial/ 그래픽 페이지에 반영된다.
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
// 호(선)·점 색상 — 오차 데이터와 무관하게 고정 팔레트 5색 중에서 완전히
// 무작위로 뽑는다. 선·점은 서로 다른 색이 되도록 pickRadialColors()가
// 보장한다(호출하는 쪽에서 한 번 뽑아 lineColorHex/dotColorHex로 넘김 —
// 매 프레임 다시 뽑으면 리사이즈·슬라이더 조작마다 색이 바뀌어 버리므로
// "새 아이템이 생길 때" 딱 한 번만 뽑아 고정해서 써야 한다).
const RADIAL_COLOR_PALETTE = ['#f299c1', '#fee987', '#7ecaac', '#4d6787', '#f58b6e'];
const RADIAL_STROKE_WEIGHT_RATIO = 0.1; // 호 굵기 = size × 이 비율 (볼드하지 않은 일반 두께)
const RADIAL_CENTER_DOT_RATIO = 0.1; // 중심 흰 점 지름 = radius × 이 비율

// errorA가 제어하는 방사형 원 — 8개가 중심 둘레에 균등 배치되고,
// errorA = 0이면 중심 흰 점 뒤에 거의 숨을 만큼 가까이 모이고,
// errorA = 1에 가까울수록 바깥으로 점점 퍼져나간다.
const RADIAL_DOT_COUNT = 8;
const RADIAL_DOT_MIN_DIST_RATIO = 0.03; // errorA = 0 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_MAX_DIST_RATIO = 0.9; // errorA = 1 일 때 중심으로부터 거리 = radius × 이 비율
const RADIAL_DOT_SIZE_RATIO = 0.35; // 원 하나의 지름 = radius × 이 비율

// RADIAL_COLOR_PALETTE에서 서로 다른 색 2개를 무작위로 뽑는다(선 색,
// 점 색 — 절대 겹치지 않음). 새 아이템/새 세션을 생성할 때 한 번만
// 호출해서 그 결과를 고정해 쓴다.
function pickRadialColors() {
  const i = Math.floor(random(RADIAL_COLOR_PALETTE.length));
  let j = Math.floor(random(RADIAL_COLOR_PALETTE.length - 1));
  if (j >= i) j += 1; // i를 건너뛰어서 j !== i를 보장
  return { lineColor: RADIAL_COLOR_PALETTE[i], dotColor: RADIAL_COLOR_PALETTE[j] };
}

// lineColorHex/dotColorHex: pickRadialColors()로 미리 뽑아둔 고정 색.
// lineAngleOffset/dotAngleOffset: 순전히 장식용 회전 애니메이션을 위한
// 선택 인자(기본 0) — errorA/errorB로 정해지는 모양·거리에는 전혀
// 영향을 주지 않고, 이미 계산된 각도에 더해져서 그룹 전체를 그대로
// 회전시키기만 한다(호 그룹과 점 그룹을 서로 다른 값으로 넣으면 각자
// 다른 속도로 돌릴 수 있음).
function drawRadialBurstFlower(g, cx, cy, size, errorA, errorB, lineColorHex, dotColorHex, lineAngleOffset = 0, dotAngleOffset = 0) {
  const radius = size * RADIAL_RADIUS_RATIO;
  const sweep = map(errorB, 0, 1, 0, RADIAL_SWEEP_MAX);
  const weight = Math.max(1, size * RADIAL_STROKE_WEIGHT_RATIO);

  g.push();
  g.translate(cx, cy);
  g.stroke(lineColorHex);
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
  g.noStroke();
  g.fill(dotColorHex);
  for (let d = 0; d < RADIAL_DOT_COUNT; d++) {
    const dotAngle = -HALF_PI + (TWO_PI * d) / RADIAL_DOT_COUNT + dotAngleOffset;
    g.ellipse(cos(dotAngle) * dotDist, sin(dotAngle) * dotDist, dotSize, dotSize);
  }

  g.fill('#fff');
  g.ellipse(0, 0, radius * RADIAL_CENTER_DOT_RATIO, radius * RADIAL_CENTER_DOT_RATIO);
  g.pop();
}

// ── 섹션 3 v2: 방사형 다발 훅 — 디벨롭 버전 (overview 전용) ───────
//
// 위 drawRadialBurstFlower(v1)의 훅(직선+원호) 알고리즘은 그대로 두고,
// overview/의 "방사형 v2" 셀에서만 쓰는 확장 버전. archive/, radial/은
// 계속 v1을 그대로 쓴다(이 함수는 두 곳에서 호출되지 않음).
//
// v1과 달리 다음 4가지가 errorA로 추가 제어된다:
//   1) 바깥쪽 훅 다발 개수 — 6(errorA=0) ~ 14(errorA=1)개, 반올림
//   2) 훅 선 굵기 — size × 0.04(errorA=0) ~ 0.16(errorA=1)
//   3) 바깥쪽 훅을 두 겹으로: 레이어1(바깥, 기존 반지름)과 레이어2
//      (안쪽, 반지름 고정 70%)를 같은 색으로 겹쳐 그리되, errorA가
//      커질수록 두 레이어 사이 회전 오프셋(최대 PI/개수)이 생겨서
//      어긋나 보인다
//   4) 기존 8개 점을 없애고, 같은 훅 모양이지만 반지름이 훨씬 작고
//      반대 방향으로 마는 안쪽 훅 다발로 대체 — 반지름은 errorA로
//      3%~45%까지 커진다
// errorB(sweep, 마는 정도)는 모든 훅에 동일하게 적용되고(안쪽 훅만
// 부호를 반전해 반대 방향), 중심 흰 점은 v1과 동일하게 마지막에
// 그려서 유지한다.
//
const RADIAL_V2_ARC_COUNT_MIN = 6; // errorA = 0 일 때 바깥쪽 훅 다발 개수
const RADIAL_V2_ARC_COUNT_MAX = 14; // errorA = 1 일 때 바깥쪽 훅 다발 개수
const RADIAL_V2_WEIGHT_MIN_RATIO = 0.04; // errorA = 0 일 때 훅 굵기 = size × 이 비율
const RADIAL_V2_WEIGHT_MAX_RATIO = 0.16; // errorA = 1 일 때 훅 굵기
const RADIAL_V2_LAYER_RADIUS_RATIO = 0.7; // 레이어2(안쪽) 반지름 = 레이어1(바깥) 반지름 × 이 비율(고정, errorA와 무관)
const RADIAL_V2_INNER_RADIUS_MIN_RATIO = 0.03; // errorA = 0 일 때 안쪽 훅(옛 점 자리) 반지름 = 바깥 반지름 × 이 비율
const RADIAL_V2_INNER_RADIUS_MAX_RATIO = 0.45; // errorA = 1 일 때 안쪽 훅 반지름 비율
const RADIAL_V2_INNER_WEIGHT_RATIO = 0.06; // 안쪽 훅 굵기 = size × 이 비율(고정)

// 훅(직선 구간 + 원호로 마는 구간) 하나의 정점 좌표를 계산한다 — 중심
// 에서 가장 먼 점이 항상 정확히 len이 되도록 스케일 보정까지 마친 뒤
// 반환한다. v1 drawRadialBurstFlower 안에 인라인으로 있던 것과 같은
// 계산이지만, v2는 이 로직을 여러 반지름·색으로 반복 재사용해야 해서
// 함수로 뽑아냈다(v1 쪽은 그대로 두고 건드리지 않음).
function hookArcPoints(len, angle, sweepAmt) {
  const straightLen = len * RADIAL_HOOK_START_RATIO;
  const hookRadius = len * RADIAL_HOOK_RADIUS_RATIO;
  const straightX = cos(angle) * straightLen;
  const straightY = sin(angle) * straightLen;

  const points = [
    [0, 0],
    [straightX, straightY],
  ];

  if (Math.abs(sweepAmt) < 1e-4) {
    points.push([cos(angle) * len, sin(angle) * len]);
  } else {
    const circleCx = straightX + hookRadius * cos(angle + HALF_PI);
    const circleCy = straightY + hookRadius * sin(angle + HALF_PI);
    const alpha0 = angle - HALF_PI;
    for (let seg = 1; seg <= RADIAL_ARC_SEGMENTS; seg++) {
      const alpha = alpha0 + (seg / RADIAL_ARC_SEGMENTS) * sweepAmt;
      points.push([circleCx + hookRadius * cos(alpha), circleCy + hookRadius * sin(alpha)]);
    }
  }

  let maxDist = 0;
  for (const [x, y] of points) {
    const d = Math.hypot(x, y);
    if (d > maxDist) maxDist = d;
  }
  const scale = maxDist > 0 ? len / maxDist : 1;
  return points.map(([x, y]) => [x * scale, y * scale]);
}

function strokeHookArc(g, len, angle, sweepAmt) {
  const points = hookArcPoints(len, angle, sweepAmt);
  g.beginShape();
  for (const [x, y] of points) g.vertex(x, y);
  g.endShape();
}

function drawRadialBurstFlowerV2(g, cx, cy, size, errorA, errorB, lineColorHex, dotColorHex) {
  const outerRadius = size * RADIAL_RADIUS_RATIO;
  const sweep = map(errorB, 0, 1, 0, RADIAL_SWEEP_MAX);

  const arcCount = Math.round(map(errorA, 0, 1, RADIAL_V2_ARC_COUNT_MIN, RADIAL_V2_ARC_COUNT_MAX));
  const weight = map(errorA, 0, 1, RADIAL_V2_WEIGHT_MIN_RATIO, RADIAL_V2_WEIGHT_MAX_RATIO) * size;
  const layerRotationOffset = map(errorA, 0, 1, 0, PI / arcCount);
  const innerRadius =
    map(errorA, 0, 1, RADIAL_V2_INNER_RADIUS_MIN_RATIO, RADIAL_V2_INNER_RADIUS_MAX_RATIO) * outerRadius;

  g.push();
  g.translate(cx, cy);
  g.noFill();
  g.strokeCap(SQUARE);
  g.strokeJoin(ROUND);

  // 바깥쪽 두 레이어 — 같은 훅 알고리즘을 반지름만 다르게(레이어1은
  // outerRadius, 레이어2는 그 70%) 두 번 그린다. errorA가 커질수록
  // 레이어2가 레이어1보다 layerRotationOffset만큼 더 돌아가 있어서
  // 두 겹이 서로 어긋나 보인다.
  g.stroke(lineColorHex);
  g.strokeWeight(weight);
  for (let p = 0; p < arcCount; p++) {
    const angle = -HALF_PI + (TWO_PI * p) / arcCount;
    strokeHookArc(g, outerRadius, angle, sweep);
  }
  for (let p = 0; p < arcCount; p++) {
    const angle = -HALF_PI + (TWO_PI * p) / arcCount + layerRotationOffset;
    strokeHookArc(g, outerRadius * RADIAL_V2_LAYER_RADIUS_RATIO, angle, sweep);
  }

  // 안쪽 훅 다발(v1의 8개 점 자리를 대체) — 개수는 v1의 점 개수와 동일
  // (RADIAL_DOT_COUNT)하게 고정, 바깥쪽과 반대 방향으로 말리고(sweep
  // 부호 반전), errorA가 커질수록 반지름이 커져 바깥으로 퍼진다.
  g.stroke(dotColorHex);
  g.strokeWeight(RADIAL_V2_INNER_WEIGHT_RATIO * size);
  for (let d = 0; d < RADIAL_DOT_COUNT; d++) {
    const angle = -HALF_PI + (TWO_PI * d) / RADIAL_DOT_COUNT;
    strokeHookArc(g, innerRadius, angle, -sweep);
  }

  g.noStroke();
  g.fill('#fff');
  g.ellipse(0, 0, outerRadius * RADIAL_CENTER_DOT_RATIO, outerRadius * RADIAL_CENTER_DOT_RATIO);
  g.pop();
}

// ── 섹션 3 dev: 방사형 — 선 끝을 따라가는 원 (overview·archive "방사형") ──
//
// v1(drawRadialBurstFlower)의 훅 알고리즘은 그대로 두고 확장한 디벨롭
// 버전. 최종적으로 mirrorSecondary=true(좌우반전) 모양으로 픽스되어
// overview의 "방사형" 셀과 archive/의 방사형 그리드·줄기형(1a) 둘 다
// 이 함수를 쓴다. radial/과 overview의 "방사형 v2" 셀만 계속 기존
// v1/v2를 그대로 쓰고 이 함수의 영향을 받지 않는다. 디벨롭이 완전히
// 끝나면 이 로직을 drawRadialBurstFlower(v1)에 반영해 radial/까지
// 포함한 공유 버전으로 옮길 예정.
//
// v1과 다른 점:
//   1) 방사형선 개수 — v2와 동일한 범위(6~14개)로 errorA에 비례해
//      늘어난다. 굵기는 v1과 마찬가지로 errorA와 무관하게 고정.
//   1-1) v2처럼 각 방사형선 아래에 반지름만 줄인(v2의 레이어2와 같은
//      비율) 두 번째 선을 겹쳐 그린다 — 시작점 이동 등 작동 방식은
//      원래 선과 동일하되 errorA를 따르고(원래 선은 errorB), 원호가
//      말리는 방향은 mirrorSecondary 인자로 고른다(최종 픽스는 true —
//      선 축 기준 좌우 대칭 반전). 회전 오프셋은 원래 선과 함께 받는다.
//   2) 중심 둘레의 기존 errorA-거리 원(dotColorHex)은 v1과 동일한 거리
//      로직을 유지하되, 개수는 고정 8개 대신 방사형선 개수(arcCount)와
//      동일하게 늘어난다. 그와 별개로 각 선의 바깥쪽 끝점(errorB로 선이
//      휘면 끝점도 같이 움직임)을 따라가는 원을 새로 추가 — 이 원도
//      개수는 항상 arcCount와 같다. 두 원 모두 크기는 기존과 동일
//      (RADIAL_DOT_SIZE_RATIO).
//   3) 끝점 원은 전부 같은 색 하나(tipColorHex)를 쓰되, 방사형선 색
//      (lineColorHex)·중심-거리 원 색(dotColorHex)과 겹치지 않는 색을
//      호출하는 쪽에서 팔레트 중 골라 넘겨준다.
//   4) 선의 시작점 — errorB = 0이면 지금처럼 캔버스 중앙(0,0)에서
//      시작하고, errorB가 1에 가까워질수록 중심에서 멀어진다. 단
//      너무 멀어져(짧아져) 보이지 않도록, 시작점은 훅이 휘기 전
//      직선 구간의 끝(straightLen = radius × RADIAL_HOOK_START_RATIO)
//      까지만 이동한다 — 즉 아무리 짧아져도 원호로 마는 부분은 항상
//      전부 그려진다.
//   5) lineAngleOffset/dotAngleOffset — v1과 같은 용도의 선택 인자
//      (기본 0). archive/의 줄기형(1a) 회전 애니메이션에서 씀.
//   6) 잘림 방지 — 원(중심-거리 원·tip 원)의 반지름뿐 아니라 선 자체의
//      굵기(stroke weight)도 경로보다 half-weight만큼 더 바깥으로 튀어
//      나갈 수 있어서, 손으로 정한 비율만으로는 어떤 조합에서 얼마나
//      튀어나올지 안전하게 보장하기 어렵다. 그래서 매번 (1) 실제 크기
//      기준으로 geometry를 한 번 만들어보고 (선의 모든 정점 + weight/2,
//      원 중심 + dotSize/2 중 원점에서 가장 먼 지점을 측정) → (2) 그
//      최대 거리가 정확히 size/2가 되도록 스케일을 계산해 → (3) 그
//      스케일이 적용된 size로 geometry를 다시 만들어서 그린다. 이렇게
//      "만들어보고 맞춰서 다시 만드는" 방식이라 어떤 errorA/errorB
//      조합에서도, 그리고 나중에 요소가 추가돼도 항상 자동으로 박스에
//      꽉 맞고 절대 넘치지 않는다.
//
// mirrorSecondary/lineAngleOffset/dotAngleOffset을 받아 arcCount개의
// 선(주 선 + 두 번째 선)·tip 위치·중심-거리 원 각도를 계산해서 그대로
// 반환한다(그리지 않음) — drawRadialBurstFlowerDev가 이걸 두 번(측정용
// 1차, 최종 2차) 호출해서 잘림 없이 꽉 차는 크기를 구한다.
function buildRadialDevGeometry(size, errorA, errorB, mirrorSecondary, lineAngleOffset, dotAngleOffset) {
  const radius = size * RADIAL_RADIUS_RATIO;
  const sweep = map(errorB, 0, 1, 0, RADIAL_SWEEP_MAX);
  const weight = Math.max(1, size * RADIAL_STROKE_WEIGHT_RATIO);
  const arcCount = Math.round(map(errorA, 0, 1, RADIAL_V2_ARC_COUNT_MIN, RADIAL_V2_ARC_COUNT_MAX));
  const dotSize = radius * RADIAL_DOT_SIZE_RATIO;
  const startDistMax = radius * RADIAL_HOOK_START_RATIO;
  const startDist = map(errorB, 0, 1, 0, startDistMax);
  const secondaryLen = radius * RADIAL_V2_LAYER_RADIUS_RATIO;
  const secondarySweep = map(errorA, 0, 1, 0, RADIAL_SWEEP_MAX);
  const secondaryStartDist = map(errorA, 0, 1, 0, secondaryLen * RADIAL_HOOK_START_RATIO);
  const dotDist = map(errorA, 0, 1, RADIAL_DOT_MIN_DIST_RATIO, RADIAL_DOT_MAX_DIST_RATIO) * radius;

  const lines = [];
  const secondaries = [];
  const tips = [];
  const dotAngles = [];
  for (let p = 0; p < arcCount; p++) {
    const angle = -HALF_PI + (TWO_PI * p) / arcCount + lineAngleOffset;
    const secondaryPoints = hookArcPointsFromStart(
      secondaryLen,
      angle,
      secondarySweep,
      secondaryStartDist,
      mirrorSecondary
    );
    const points = hookArcPointsFromStart(radius, angle, sweep, startDist);
    lines.push(points);
    secondaries.push(secondaryPoints);
    tips.push(points[points.length - 1]);
    dotAngles.push(-HALF_PI + (TWO_PI * p) / arcCount + dotAngleOffset);
  }

  return { arcCount, weight, dotSize, lines, secondaries, tips, dotDist, dotAngles };
}

// hookArcPoints와 같은 계산이지만 시작점을 (0,0)이 아니라 중심선을 따라
// startDist만큼 옮긴 지점에서 시작한다(선 끝을 향한 방향·모양은 동일).
// mirror = true면 호가 휘어지는 원의 중심을 반대쪽(angle - HALF_PI)에
// 두고 도는 방향도 맞춰 반전해서, 시작점·직선 구간은 그대로 둔 채
// 원호가 말리는 방향만 선 축 기준 좌우 대칭이 되게 한다. (sweepAmt의
// 부호만 뒤집으면 원이 도는 방향만 바뀔 뿐, 휘는 쪽 자체는 그대로라서
// 진짜 좌우 반전이 되지 않는다 — 원 중심 오프셋 방향도 같이 바꿔야 함.)
function hookArcPointsFromStart(len, angle, sweepAmt, startDist, mirror = false) {
  const straightLen = len * RADIAL_HOOK_START_RATIO;
  const hookRadius = len * RADIAL_HOOK_RADIUS_RATIO;
  const straightX = cos(angle) * straightLen;
  const straightY = sin(angle) * straightLen;

  const points = [
    [cos(angle) * startDist, sin(angle) * startDist],
    [straightX, straightY],
  ];

  if (Math.abs(sweepAmt) < 1e-4) {
    points.push([cos(angle) * len, sin(angle) * len]);
  } else {
    const offsetAngle = mirror ? angle - HALF_PI : angle + HALF_PI;
    const alpha0 = mirror ? angle + HALF_PI : angle - HALF_PI;
    const effSweep = mirror ? -sweepAmt : sweepAmt;
    const circleCx = straightX + hookRadius * cos(offsetAngle);
    const circleCy = straightY + hookRadius * sin(offsetAngle);
    for (let seg = 1; seg <= RADIAL_ARC_SEGMENTS; seg++) {
      const alpha = alpha0 + (seg / RADIAL_ARC_SEGMENTS) * effSweep;
      points.push([circleCx + hookRadius * cos(alpha), circleCy + hookRadius * sin(alpha)]);
    }
  }

  let maxDist = 0;
  for (const [x, y] of points) {
    const d = Math.hypot(x, y);
    if (d > maxDist) maxDist = d;
  }
  const scale = maxDist > 0 ? len / maxDist : 1;
  return points.map(([x, y]) => [x * scale, y * scale]);
}

function drawRadialBurstFlowerDev(
  g,
  cx,
  cy,
  size,
  errorA,
  errorB,
  lineColorHex,
  dotColorHex,
  tipColorHex,
  mirrorSecondary = true,
  lineAngleOffset = 0,
  dotAngleOffset = 0
) {
  // 1차 패스(측정용) — size 그대로 geometry를 만들어서, 선의 모든
  // 정점(+weight/2)과 원 중심(+dotSize/2) 중 원점에서 가장 먼 지점을
  // 구한다.
  const probe = buildRadialDevGeometry(size, errorA, errorB, mirrorSecondary, lineAngleOffset, dotAngleOffset);
  let maxExtent = 0;
  const consider = (dist, margin) => {
    const extent = dist + margin;
    if (extent > maxExtent) maxExtent = extent;
  };
  probe.lines.forEach((pts) => pts.forEach(([x, y]) => consider(Math.hypot(x, y), probe.weight / 2)));
  probe.secondaries.forEach((pts) => pts.forEach(([x, y]) => consider(Math.hypot(x, y), probe.weight / 2)));
  probe.tips.forEach(([x, y]) => consider(Math.hypot(x, y), probe.dotSize / 2));
  consider(probe.dotDist, probe.dotSize / 2);

  // 2차 패스(최종) — 그 최대 도달 거리가 정확히 size/2가 되도록 크기를
  // 다시 스케일해서 geometry를 새로 만든다. 이렇게 하면 이 errorA/errorB
  // 조합에서 실제로 필요한 만큼만 줄이거나 키워서, 항상 박스에 꽉 차고
  // 절대 넘치지 않는다.
  const fitScale = maxExtent > 0 ? size / 2 / maxExtent : 1;
  const shape = buildRadialDevGeometry(
    size * fitScale,
    errorA,
    errorB,
    mirrorSecondary,
    lineAngleOffset,
    dotAngleOffset
  );

  g.push();
  g.translate(cx, cy);
  g.stroke(lineColorHex);
  g.strokeWeight(shape.weight);
  g.strokeCap(SQUARE);
  g.strokeJoin(ROUND);
  g.noFill();

  for (let p = 0; p < shape.arcCount; p++) {
    // 두 번째(짧은) 선을 먼저 그려서 원래 선 아래에 깔리게 한다.
    g.beginShape();
    for (const [x, y] of shape.secondaries[p]) g.vertex(x, y);
    g.endShape();

    g.beginShape();
    for (const [x, y] of shape.lines[p]) g.vertex(x, y);
    g.endShape();
  }

  // 기존 errorA-거리 원 — 개수는 방사형선과 함께 늘어나도록 arcCount에
  // 맞춘다.
  g.noStroke();
  g.fill(dotColorHex);
  shape.dotAngles.forEach((dotAngle) => {
    g.ellipse(cos(dotAngle) * shape.dotDist, sin(dotAngle) * shape.dotDist, shape.dotSize, shape.dotSize);
  });

  // 선 끝을 따라가는 새 원 — 위 두 색과 겹치지 않는 별도 색 하나로 통일
  g.fill(tipColorHex);
  shape.tips.forEach(([x, y]) => {
    g.ellipse(x, y, shape.dotSize, shape.dotSize);
  });

  g.pop();
}
