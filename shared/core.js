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
