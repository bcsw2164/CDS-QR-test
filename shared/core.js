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

// ── 섹션 3 dev 공용 상수 ───────────────────────────────────
// 원래 overview "방사형 v2" 셀과 공유하던 값 — v2 셀과 그 전용 코드
// (drawRadialBurstFlowerV2 / hookArcPoints / strokeHookArc)는 삭제됐고,
// 지금은 아래 drawRadialBurstFlowerDev("방사형" 셀)에서만 쓴다.
const RADIAL_V2_ARC_COUNT_MIN = 6; // errorA = 0 일 때 방사형선 개수
const RADIAL_V2_ARC_COUNT_MAX = 14; // errorA = 1 일 때 방사형선 개수
const RADIAL_V2_LAYER_RADIUS_RATIO = 0.7; // 두 번째(짧은) 선 길이 = 원래 선 길이 × 이 비율

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

// ── 섹션 3 스포크: 방사형 선분 + 끝점 원 (overview "방사형 스포크") ──
//
// 중심점 한 곳에서 바깥으로 뻗는 방사형 선분(spoke)과 각 선분 끝의
// 원(dot)으로만 이루어진 정적 심볼. 선분은 두 세트다:
//   · 밖지름 세트 — 바깥쪽 선분, N개
//   · 안지름 세트 — 안쪽 선분, N개(밖지름 선분 사이에 반 칸 어긋나 배치)
// 노이즈 대신 고정 시드(RADIAL_SPOKE_SEED) 기반이라, 같은 errorA/errorB
// 값이면 색 배정·지터까지 항상 동일한 형태가 재현된다.
//
// 오차율 순으로 나열했을 때 errorA/errorB 가 클수록·작을수록 형태가
// 한 방향으로 또렷하게 달라지도록, "큰 흐름"은 변수가 잡고 랜덤은 잔결만
// 담당한다.
//
//   errorA → 밖지름 층과 안지름 층이 얼마나 벌어지는지(편차의 크기).
//            두 층의 중심 반지름을 R×MID 에서 대칭으로 밀고 당긴다.
//            · errorA ≈ 0 : 두 층이 거의 겹쳐 하나의 고른 방사형(별)처럼
//            · errorA ≈ 1 : 밖지름은 바깥, 안지름은 중심 가까이로 크게 갈라짐
//            각 선분이 자기 층 중심에서 ±LEN_JITTER 만큼 벗어나는 건 랜덤
//            (선분마다 길이가 조금씩 다르되, 벌어짐의 큰 폭은 errorA 가 지배).
//   errorB → 각 선분의 좌우 이동량.
//            · errorB = 0 : 지터 0 → 완전히 균등한 기하학적 별(* 모양)
//            · errorB ↑   : 각 선분이 정위치에서 좌우로 크게 흔들린다(1에
//              가까우면 이웃 칸을 넘어설 만큼). 이동 폭과 방향은 선분마다
//              랜덤이지만, 그 최대치는 errorB 가 정한다.
//   색   → RADIAL_COLOR_PALETTE(5색) 중 무작위 배정(colorSeed 고정).
//          · 밖지름 선분 = 전부 같은 색 하나, 안지름 선분 = 그와 다른 색 하나
//          · 끝점 원 = 위 두 선분 색을 뺀 나머지 3색에서 원마다 개별 랜덤
//
// 전체 크기는 errorA/errorB 와 무관하게 항상 일정하다(잘림 방지 스케일
// 없음) — 밖지름 최대치도 캔버스 안에 안전하게 들어오는 값으로 고정.
//
const RADIAL_SPOKE_SEED = 20240906; // 이 값을 바꾸면 길이·지터·배색 패턴 전체가 달라진다
const RADIAL_SPOKE_COUNT = 12; // 한 세트(밖지름/안지름)당 선분 개수
const RADIAL_SPOKE_MID_RATIO = 0.5; // 두 층의 기준(가운데) 반지름 = R × 이 비율
const RADIAL_SPOKE_SEPARATION_MIN = 0.05; // errorA=0 일 때 두 층 중심 간 거리 = R × 이 비율
const RADIAL_SPOKE_SEPARATION_MAX = 0.72; // errorA=1 일 때 두 층 중심 간 거리
const RADIAL_SPOKE_LEN_JITTER = 0.08; // 선분마다 자기 층 중심에서 ± 이 비율(R) 안에서 랜덤하게 길이 편차
const RADIAL_SPOKE_ANGLE_JITTER = 1.6; // errorB=1 일 때 선분 최대 이동폭 = (선분 간격 각도) × 이 비율 (1보다 크면 이웃 칸을 넘어설 수 있음)
const RADIAL_SPOKE_ANGLE_RANGE_MIN = 0.2; // 선분별 이동폭 랜덤 하한(위 최대치 대비 — 선분마다 흔들리는 폭도 제각각)
const RADIAL_SPOKE_WEIGHT_RATIO = 0.028; // 선분 굵기 = size × 이 비율
const RADIAL_SPOKE_DOT_RATIO = 0.15; // 끝점 원 지름 = R × 이 비율

// mulberry32 — 시드 하나로 결정적인 0~1 난수열을 만드는 작은 PRNG.
// p5의 전역 random()/randomSeed()를 쓰면 이 함수가 전역 난수 상태를
// 리셋해서 generateErrorData()·rerollRadialColors() 같은 다른 곳의
// 난수까지 고정돼 버리므로(= [랜덤 생성]이 한 번만 먹는 버그), 여기서는
// 전역을 전혀 건드리지 않는 로컬 RNG를 쓴다.
function makeRadialSpokeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// size 기준으로 선분 두 세트의 각도·길이·색, 굵기, 끝점 원 크기를 계산해서
// 반환한다(그리지 않음). 모든 선분은 원점(0,0)에서 시작한다.
// 형태(각도·길이·지터)는 고정 시드(RADIAL_SPOKE_SEED)라 errorA/errorB 가
// 같으면 항상 동일하고, 색만 별도 colorSeed 를 따른다 — 호출부에서
// [랜덤 생성] 때만 새 colorSeed 를 넘기면 슬라이더·리사이즈에는 색이
// 안 바뀌고 버튼에만 바뀐다. colorSeed 를 안 주면 형태 시드와 동일.
//
// outerGrow/innerGrow (기본 1) — 밖지름·안지름 세트의 선분 길이에 각각
// 곱하는 배율. 폭죽처럼 터지는 등장 애니메이션에서 0(중심에 뭉침)→1(제
// 크기)로 따로 키우려고 archive 에서 넘긴다. RNG 소비량에는 영향이 없어
// (길이 계산 마지막에 곱하기만 함) 색·지터·각도는 배율과 무관하게 고정.
function buildRadialSpokeGeometry(
  size,
  errorA,
  errorB,
  colorSeed = RADIAL_SPOKE_SEED,
  outerGrow = 1,
  innerGrow = 1
) {
  const rnd = makeRadialSpokeRng(RADIAL_SPOKE_SEED);
  const colorRnd = makeRadialSpokeRng(colorSeed);
  const R = size * RADIAL_RADIUS_RATIO;
  const step = TWO_PI / RADIAL_SPOKE_COUNT;
  const jitterMax = errorB * step * RADIAL_SPOKE_ANGLE_JITTER;

  // errorA — 두 층 중심 반지름을 MID 에서 대칭으로 벌린다(편차의 큰 폭).
  const separation = lerp(RADIAL_SPOKE_SEPARATION_MIN, RADIAL_SPOKE_SEPARATION_MAX, errorA);
  const outerCenter = RADIAL_SPOKE_MID_RATIO + separation / 2;
  const innerCenter = RADIAL_SPOKE_MID_RATIO - separation / 2;

  const pick = (pool) => pool[Math.floor(colorRnd() * pool.length)];

  // 색 배정 순서:
  //  1) 밖지름 선분 색 — 팔레트 5색 중 하나
  //  2) 안지름 선분 색 — 밖지름 색을 뺀 4색 중 하나(두 세트 색은 절대 안 겹침)
  //  3) 끝점 원 색 — 위 두 선분 색을 뺀 나머지 3색 중에서 원마다 개별 랜덤
  const outerLineColor = pick(RADIAL_COLOR_PALETTE);
  const innerLineColor = pick(RADIAL_COLOR_PALETTE.filter((c) => c !== outerLineColor));
  const dotOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== outerLineColor && c !== innerLineColor);

  // 세트 하나당 선분 색은 lineColor 로 통일, 끝점 원은 dotOptions 에서
  // 원마다 랜덤. centerRatio 는 이 층의 중심 반지름 비율(errorA 로 결정),
  // 각 선분 길이는 거기서 ±LEN_JITTER 안에서만 랜덤(잔결). baseOffset 은
  // 세트 전체를 반 칸 돌리는 값(안지름 세트를 밖지름 선분 사이에 끼움).
  const makeSet = (centerRatio, baseOffset, lineColor, grow) => {
    const arr = [];
    for (let i = 0; i < RADIAL_SPOKE_COUNT; i++) {
      const len = R * (centerRatio + (rnd() * 2 - 1) * RADIAL_SPOKE_LEN_JITTER) * grow;
      const base = -HALF_PI + (i + baseOffset) * step;
      // 이 선분이 흔들릴 수 있는 최대 폭도 선분마다 랜덤(RANGE_MIN~1),
      // 그 안에서 실제 좌우 이동은 또 랜덤. errorB=0 이면 전부 0.
      const spokeJitter = jitterMax * lerp(RADIAL_SPOKE_ANGLE_RANGE_MIN, 1, rnd());
      const angle = base + (rnd() * 2 - 1) * spokeJitter;
      // grow 는 이 세트의 등장 배율(0~1). 그릴 때 grow<=0 이면 통째로 건너뛰어
      // 아무것도 안 보이게 하고, 끝점 원 크기도 grow 에 비례시킨다.
      arr.push({ angle, len, lineColor, dotColor: pick(dotOptions), grow });
    }
    return arr;
  };

  const spokes = [
    ...makeSet(outerCenter, 0, outerLineColor, outerGrow),
    ...makeSet(innerCenter, 0.5, innerLineColor, innerGrow),
  ];
  const weight = Math.max(1, size * RADIAL_SPOKE_WEIGHT_RATIO);
  const dotSize = R * RADIAL_SPOKE_DOT_RATIO;
  return { spokes, weight, dotSize };
}

// ── 섹션 4: 수채화 번짐 덩어리 (overview "수채화") ──
//
// 방사형 스포크가 "밖지름/안지름 두 층의 반지름이 벌어지며" 유기적인
// 형태를 만든 것과 같은 원리다. 다만 여기서는 보이지 않는 점(윤곽선
// 표본)을 훨씬 촘촘하게(BLOB_CONTOUR_STEPS) 깔고, 살짝 크기·위치가
// 어긋난 반투명 덩어리 레이어를 여러 장(BLOB_LAYERS) multiply 로 겹쳐
// 쌓아서, 개별 점이 아니라 하나의 수채화처럼 번지는 덩어리로 보이게
// 한다. 안쪽은 모든 레이어가 겹쳐 진하고 가장자리는 큰 레이어만 닿아
// 옅게 → 물감이 번진 듯한 명암이 저절로 생긴다.
//
// 덩어리 윤곽의 "성격"(혹이 몇 개고 어느 방향이 튀어나오는지)은
// shapeSeed 를 따른다 — 호출부에서 [랜덤 생성] 때 새 shapeSeed 를 넘기면
// 매번 다른 덩어리 모양이 나오고, 슬라이더·리사이즈에는 유지된다.
// shapeSeed 를 안 주면 BLOB_SEED 로 고정(재현 가능). 색은 별도 colorSeed.
//
//   errorA → 정원에서 얼마나 벗어나는지(편차의 크기). 0 이면 완벽한
//            원, 1 에 가까울수록 윤곽 각 지점의 편차가 커진다. 편차는
//            둘레 노드(8~18개)마다 방향·세기가 제각각인 랜덤값을 매끈
//            하게 이은 것이라(사인 하모닉이 아님), 특정한 대칭 형태로
//            뭉치지 않고 지점마다 불규칙하게 달라진다 — errorB 가 만드는
//            정점 잔결과 성격이 같고, 스케일만 더 크다. 어느 노드가
//            얼마나 튀는지는 shapeSeed 가 정하고 errorA 는 세기만 키운다.
//   errorB → 윤곽의 고주파 거칠기(가장자리가 삐죽삐죽 터지는 정도)와
//            레이어별 번짐 흔들림. 0 이면 매끈한 덩어리, 1 이면
//            사방으로 튀는 거친 수채 얼룩.
//   색     → 아래 BLOB_USE_MULTIPLY 로 두 방식 중 선택.
//            · true  — multiply 블렌드. 팔레트 5색 중 2색만 골라 레이어·
//              알갱이마다 두 색 사이를 보간. 겹칠수록 어두워져 물감처럼
//              깊이가 생기지만, 색을 많이 섞으면 탁해지므로 2색 고정.
//            · false — 일반(source-over) 블렌드. 팔레트 5색을 다 쓴다:
//              레이어마다 대표색 1개(BLOB_DOMINANT_RATIO 확률) 또는
//              나머지 팔레트에서 랜덤 accent. 겹쳐도 안 탁해지는 대신
//              multiply 같은 자동 명암이 없어서, 안쪽 레이어를 더
//              불투명하게(BLOB_LAYER_ALPHA × 스케일 보정) 만들어 깊이를
//              낸다. multiply 처럼 겹을 많이 쌓을 필요가 없어 레이어 수
//              (BLOB_LAYERS)를 절반으로 줄인다.
//
// 전체 크기는 errorA/errorB 와 무관하게 항상 캔버스에 꽉 맞는다 —
// 실제 윤곽 최대 반지름을 재서 size/2 에 맞춰 스케일(fitR)하기 때문.
//
const BLOB_USE_MULTIPLY = false; // true = multiply·2색, false = 일반 블렌드·팔레트 5색
const BLOB_RADIUS_RATIO = 0.5; // 목표 반지름 = size × 이 비율 (fitScale 기준)
const BLOB_CONTOUR_STEPS = 144; // 윤곽선 각도 분할 수(보이지 않는 점)
const BLOB_LAYERS = BLOB_USE_MULTIPLY ? 26 : 13; // 겹쳐 쌓는 반투명 덩어리 레이어 수
const BLOB_LAYER_ALPHA = BLOB_USE_MULTIPLY ? 0.07 : 0.16; // 레이어 한 장 채움 투명도(0~1)
const BLOB_DOMINANT_RATIO = 0.62; // (일반 블렌드) 레이어가 대표색을 쓸 확률 — 나머지는 팔레트 랜덤
const BLOB_SPECKLE_COUNT = BLOB_USE_MULTIPLY ? 240 : 170; // 번짐 알갱이 점 개수
const BLOB_SPECKLE_ALPHA = BLOB_USE_MULTIPLY ? 0.1 : 0.14; // 알갱이 한 개 투명도(0~1)
const BLOB_LOBE_MIN = 0.0; // errorA=0 일 때 윤곽 편차 → 완벽한 원
const BLOB_LOBE_MAX = 0.52; // errorA=1 일 때 윤곽 편차의 큰 폭
const BLOB_RAGGED_MIN = 0.0; // errorB=0 일 때 고주파(삐죽삐죽) 진폭
const BLOB_RAGGED_MAX = 0.26; // errorB=1 일 때 고주파 진폭
const BLOB_LOBE_NODES_MIN = 8; // errorA 편차를 만드는 둘레 노드 최소 개수(시드마다 랜덤)
const BLOB_LOBE_NODES_MAX = 18; // 노드 최대 개수 — 많을수록 굴곡이 잘게 불규칙
const BLOB_SEED = 20240906; // shapeSeed 를 안 넘겼을 때 쓰는 기본(재현용) 시드

// 캣멀롬 스플라인 보간 — 노드 4개(p0..p3) 사이 t(0~1) 지점 값을 매끈하게
// 잇는다. 사인 하모닉과 달리 "몇 번 파동"이라는 규칙이 없어서, 노드마다
// 제각각인 랜덤 편차가 특정한 대칭 형태로 뭉치지 않고 불규칙하게 이어진다.
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

// 각도별 윤곽 반지름 배열(1 을 기준으로 한 배수)을 계산한다.
//
//   errorA 편차(lobeAmp) — 둘레를 nodeCount(8~18)개로 나눠, 노드마다
//     방향·세기가 전부 제각각인 랜덤 편차를 두고 캣멀롬으로 매끈하게
//     보간한다. 사인 하모닉("N번 파동")이 아니라서 3-로브 트레포일 같은
//     "특정한 형태"로 뭉치지 않고, 크고 작은 굴곡이 둘레를 따라 불규칙
//     하게 섞인다 — errorB(삐죽삐죽)가 만드는 편차처럼 지점마다 편차가
//     크다. 다만 errorB 는 정점 단위 잔결, 이쪽은 그보다 큰 스케일의
//     매끈한 굴곡.
//   errorB 편차(raggedAmp) — 각도마다 랜덤값을 한 번 이웃 평균해서 살짝
//     이은 것(삐죽삐죽한 가장자리).
//
// seed·errorA·errorB 가 같으면 항상 같은 윤곽.
function buildBlobContour(steps, seed, lobeAmp, raggedAmp) {
  const rnd = makeRadialSpokeRng(seed);

  // errorA 편차용 둘레 노드 — 편차 방향(부호)·세기(0.15~1.0 배)를 노드마다
  // 따로 뽑아, 어떤 구간은 크게 튀어나오고 어떤 구간은 거의 안 움직인다.
  const nodeCount =
    BLOB_LOBE_NODES_MIN + Math.floor(rnd() * (BLOB_LOBE_NODES_MAX - BLOB_LOBE_NODES_MIN + 1));
  const nodes = [];
  for (let k = 0; k < nodeCount; k++) {
    nodes.push((rnd() * 2 - 1) * (0.15 + rnd() * 0.85));
  }

  // errorB 편차용 정점 단위 잔결 — 랜덤값 이웃 평균 1회.
  const raw = [];
  for (let i = 0; i < steps; i++) raw.push(rnd() * 2 - 1);
  const spikes = raw.map((v, i) => {
    const a = raw[(i - 1 + steps) % steps];
    const b = raw[(i + 1) % steps];
    return (a + v * 2 + b) / 4;
  });

  const radii = [];
  for (let i = 0; i < steps; i++) {
    const f = (i / steps) * nodeCount;
    const j = Math.floor(f);
    const frac = f - j;
    const p0 = nodes[(j - 1 + nodeCount) % nodeCount];
    const p1 = nodes[j % nodeCount];
    const p2 = nodes[(j + 1) % nodeCount];
    const p3 = nodes[(j + 2) % nodeCount];
    const lobe = catmullRom(p0, p1, p2, p3, frac); // 대략 -1~1 (오버슈트 가능)
    radii.push(Math.max(0.15, 1 + lobe * lobeAmp + spikes[i] * raggedAmp));
  }
  return radii;
}

// showPoints = true 면 반투명 덩어리 대신, 그 덩어리를 이루는 "보이지
// 않는 점"(레이어별 윤곽 정점 26×144개 + 번짐 알갱이 중심 240개)을
// 전부 작은 점으로 찍어 보여준다. multiply·blur 없이 크리스프하게 그리되,
// 점 하나하나는 옅은 알파라 겹치는 곳일수록 진해져 덩어리의 밀도 분포가
// 그대로 드러난다. 형태 계산(레이어 스케일·회전·드리프트·지터·RNG 소비
// 순서)은 일반 렌더와 완전히 동일하다.
function drawWatercolorBlob(
  g,
  cx,
  cy,
  size,
  errorA,
  errorB,
  colorSeed = BLOB_SEED,
  showPoints = false,
  shapeSeed = BLOB_SEED
) {
  const lobeAmp = lerp(BLOB_LOBE_MIN, BLOB_LOBE_MAX, errorA);
  const raggedAmp = lerp(BLOB_RAGGED_MIN, BLOB_RAGGED_MAX, errorB);
  const steps = BLOB_CONTOUR_STEPS;
  const radii = buildBlobContour(steps, shapeSeed, lobeAmp, raggedAmp);

  // 잘림 방지 — 실제 윤곽 최대 반지름 배수와 레이어 최대 확대(1.08)를
  // 감안해서, 덩어리가 정확히 size/2 안에 들어오도록 기준 반지름을 정한다.
  const maxContour = Math.max(...radii);
  const fitR = (size * BLOB_RADIUS_RATIO) / (maxContour * 1.08);
  const jitter = size * 0.012; // 레이어별 윤곽 흔들림(번짐)
  const drift = size * 0.02 * (0.4 + errorB * 0.6); // 레이어별 위치 어긋남

  // 색 — BLOB_USE_MULTIPLY 에 따라 두 방식.
  //   multiply : 팔레트에서 서로 다른 2색(cA/cB) 보간
  //   일반     : 대표색 1개(dominantHex) + 나머지 팔레트에서 랜덤 accent
  const colorRnd = makeRadialSpokeRng(colorSeed);
  let cA, cB, dominantHex;
  if (BLOB_USE_MULTIPLY) {
    const ci = Math.floor(colorRnd() * RADIAL_COLOR_PALETTE.length);
    let cj = Math.floor(colorRnd() * (RADIAL_COLOR_PALETTE.length - 1));
    if (cj >= ci) cj += 1;
    cA = g.color(RADIAL_COLOR_PALETTE[ci]);
    cB = g.color(RADIAL_COLOR_PALETTE[cj]);
  } else {
    dominantHex = RADIAL_COLOR_PALETTE[Math.floor(colorRnd() * RADIAL_COLOR_PALETTE.length)];
  }
  // 레이어/알갱이 색 하나를 뽑는다. r, r2 는 그 요소의 RNG 값 두 개.
  const pickBlobColor = (r, r2) =>
    BLOB_USE_MULTIPLY
      ? g.lerpColor(cA, cB, r)
      : g.color(
          r < BLOB_DOMINANT_RATIO
            ? dominantHex
            : RADIAL_COLOR_PALETTE[Math.floor(r2 * RADIAL_COLOR_PALETTE.length)]
        );

  g.push();
  g.translate(cx, cy);
  g.noStroke();

  const ctx = g.drawingContext;
  ctx.save();
  if (!showPoints) {
    if (BLOB_USE_MULTIPLY) ctx.globalCompositeOperation = 'multiply'; // 겹칠수록 진해지는 물감 혼합
    ctx.filter = `blur(${Math.max(0.5, size * 0.006)}px)`; // 부드러운 번짐 가장자리
  }
  const ptD = Math.max(1, size * 0.007); // showPoints 모드의 점 지름

  for (let L = 0; L < BLOB_LAYERS; L++) {
    const lr = makeRadialSpokeRng((colorSeed ^ 0x9e3779b9) + L * 0x85ebca6b);
    // 대부분 작게, 일부만 크게 → 안쪽이 진하고 바깥은 옅게 쌓인다.
    const layerScale = 0.5 + 0.58 * Math.pow(lr(), 0.7); // 0.5 ~ 1.08
    const rot = (lr() * 2 - 1) * 0.2;
    const ox = (lr() * 2 - 1) * drift;
    const oy = (lr() * 2 - 1) * drift;

    const jr = [];
    for (let i = 0; i < steps; i++) {
      jr.push(fitR * layerScale * radii[i] + (lr() * 2 - 1) * jitter);
    }

    const layerColor = pickBlobColor(lr(), lr());
    // multiply : 레이어마다 알파를 무작위로 흔든다.
    // 일반     : 안쪽(작은 layerScale) 레이어일수록 불투명 → 자동 명암 대체.
    const layerAlpha = BLOB_USE_MULTIPLY
      ? BLOB_LAYER_ALPHA * (0.6 + lr() * 0.8)
      : BLOB_LAYER_ALPHA * map(layerScale, 0.5, 1.08, 1.3, 0.5);

    if (showPoints) {
      // 이 레이어의 윤곽 정점 144개를 점으로 찍는다.
      g.noStroke();
      g.fill(layerColor);
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < steps; i++) {
        const th = (i / steps) * TWO_PI + rot;
        g.ellipse(Math.cos(th) * jr[i] + ox, Math.sin(th) * jr[i] + oy, ptD, ptD);
      }
      continue;
    }

    ctx.globalAlpha = layerAlpha;
    g.fill(layerColor);
    g.beginShape();
    for (let i = -1; i <= steps + 1; i++) {
      const idx = ((i % steps) + steps) % steps;
      const th = (idx / steps) * TWO_PI + rot;
      g.curveVertex(Math.cos(th) * jr[idx] + ox, Math.sin(th) * jr[idx] + oy);
    }
    g.endShape(CLOSE);
  }

  // 번짐 알갱이 — 가장자리에 몰리게(바깥 비율 편향) 뿌려서, 물감이
  // 종이에 스며 튄 잔결을 만든다. 일부는 윤곽 밖으로도 살짝 튄다.
  const sp = makeRadialSpokeRng(colorSeed + 0x77777);
  if (!showPoints) ctx.filter = `blur(${Math.max(0.5, size * 0.003)}px)`;
  for (let s = 0; s < BLOB_SPECKLE_COUNT; s++) {
    const th = sp() * TWO_PI;
    const idx = Math.floor((th / TWO_PI) * steps) % steps;
    const edge = fitR * radii[idx];
    const frac = 0.15 + Math.pow(sp(), 0.5) * 1.05; // 0.15 ~ 1.2 (바깥 편향)
    const rr = edge * frac;
    const big = Math.pow(sp(), 3); // 큰 알갱이는 드물게
    const d = showPoints ? ptD : size * (0.004 + big * 0.02);
    ctx.globalAlpha = showPoints ? 0.55 : BLOB_SPECKLE_ALPHA * (0.5 + sp() * 0.9);
    g.fill(pickBlobColor(sp(), sp()));
    g.ellipse(Math.cos(th) * rr, Math.sin(th) * rr, d, d);
  }

  ctx.restore();
  g.pop();
}

// ── 섹션 5: 암술 있는 수채화 꽃 (overview "수채화 꽃") ──
//
// 유기적인 꽃잎 덩어리(petal) 위에, 겹치지 않는 다른 팔레트 색의 작은
// 암술 덩어리(pistil)를 그대로 얹는다. multiply 가 아니라 source-over
// 라서 아래 꽃잎 색과 섞이지 않고 위에 또렷하게 올라간다. 첨부
// 레퍼런스(보라/초록 꽃)처럼 꽃잎은 가장자리가 번지고 중앙이 진하며,
// 중심에 짙은 암술이 박혀 있다. 윤곽은 drawWatercolorBlob 과 같은
// buildBlobContour 를 쓴다.
//
//   errorA → 꽃잎 윤곽의 일그러짐 정도. 0 이면 거의 원, 1 이면 크게
//            울퉁불퉁해진다(buildBlobContour 의 lobeAmp).
//   errorB → 암술이 중심에서 벗어난 거리. 0 이면 정중앙, 1 이면 꽃잎
//            가장자리 가까이까지 치우친다. 벗어나는 방향은 shapeSeed.
//   색     → RADIAL_COLOR_PALETTE 5색 중 서로 다른 2색(꽃잎색·암술색).
//            둘 다 colorSeed 를 따르고, 암술이 항상 위에 올라간다.
//
// 전체 크기는 errorA/errorB 와 무관하게 캔버스에 꽉 맞는다 — 꽃잎 최대
// 반경과 (암술 이동 + 암술 반경) 중 큰 쪽을 size/2 에 맞춰 스케일한다.
//
const FLOWER_PETAL_RATIO = 0.5; // 꽃잎 목표 반지름 = size × 이 비율(fit 기준)
const FLOWER_PETAL_LAYERS = 9; // 꽃잎 반투명 겹 수(전부 같은 꽃잎색)
const FLOWER_PETAL_ALPHA = 0.2; // 꽃잎 한 겹 알파(source-over)
const FLOWER_PISTIL_RATIO = 0.32; // 암술 반지름 = 꽃잎 기준 반지름 × 이 비율
const FLOWER_PISTIL_LAYERS = 3; // 암술 겹 수
const FLOWER_PISTIL_ALPHA = 0.6; // 암술 한 겹 알파(거의 불투명하게 얹힘)
const FLOWER_LOBE_MIN = 0.04; // errorA=0 일 때 꽃잎 일그러짐
const FLOWER_LOBE_MAX = 0.5; // errorA=1 일 때 꽃잎 일그러짐
const FLOWER_OFFSET_MAX_LOWA = 0.34; // errorB=1·errorA=0 일 때 암술 이동(꽃잎 R 비율) — 암술이 커진 만큼 축소
const FLOWER_OFFSET_MAX_HIGHA = 0.18; // errorA=1(일그러짐 큼)이면 최대 이동을 줄여 꽃잎 밖으로 빠지지 않게
const FLOWER_SPECKLE_COUNT = 70; // 꽃잎 가장자리 번짐 알갱이 수

// 유기적 덩어리 하나를 반투명 겹으로 쌓아 그린다(전부 같은 색, source-over).
// 안쪽(작은 스케일) 겹일수록 불투명 → 중앙이 진하고 가장자리는 옅게.
function paintOrganicBlob(g, ctx, steps, contour, baseR, cx0, cy0, hex, layers, alpha, seedBase, scaleLo, scaleHi) {
  for (let L = 0; L < layers; L++) {
    const lr = makeRadialSpokeRng(seedBase + L * 0x85ebca6b);
    const ls = scaleLo + (scaleHi - scaleLo) * Math.pow(lr(), 0.7);
    const rot = (lr() * 2 - 1) * 0.25;
    const jx = (lr() * 2 - 1) * baseR * 0.03;
    const jy = (lr() * 2 - 1) * baseR * 0.03;
    const jr = [];
    for (let i = 0; i < steps; i++) jr.push(baseR * ls * contour[i] + (lr() * 2 - 1) * baseR * 0.02);
    ctx.globalAlpha = alpha * map(ls, scaleLo, scaleHi, 1.3, 0.5);
    g.fill(hex);
    g.beginShape();
    for (let i = -1; i <= steps + 1; i++) {
      const idx = ((i % steps) + steps) % steps;
      const th = (idx / steps) * TWO_PI + rot;
      g.curveVertex(cx0 + Math.cos(th) * jr[idx] + jx, cy0 + Math.sin(th) * jr[idx] + jy);
    }
    g.endShape(CLOSE);
  }
}

function drawPistilFlower(g, cx, cy, size, errorA, errorB, colorSeed = BLOB_SEED, shapeSeed = BLOB_SEED) {
  const steps = BLOB_CONTOUR_STEPS;
  const lobeAmp = lerp(FLOWER_LOBE_MIN, FLOWER_LOBE_MAX, errorA);
  const petal = buildBlobContour(steps, shapeSeed, lobeAmp, lerp(0.02, 0.16, errorA));
  const pistil = buildBlobContour(steps, (shapeSeed ^ 0x5bd1e995) >>> 0, 0.22, 0.06);

  // 암술 이동 — 방향은 shapeSeed 고정, 거리는 errorB. 일그러짐이 크면
  // 꽃잎 오목한 쪽으로 빠져나갈 수 있어 최대 이동을 줄인다.
  const dirRnd = makeRadialSpokeRng((shapeSeed + 0x1234) >>> 0);
  const offAngle = dirRnd() * TWO_PI;
  const offMaxRatio = errorB * lerp(FLOWER_OFFSET_MAX_LOWA, FLOWER_OFFSET_MAX_HIGHA, errorA);

  // 잘림 방지 스케일
  const petalMax = Math.max(...petal);
  const pistilMax = Math.max(...pistil);
  const petalExtent = petalMax * 1.06;
  const pistilExtent = offMaxRatio + FLOWER_PISTIL_RATIO * pistilMax * 1.06;
  const R = (size * FLOWER_PETAL_RATIO) / Math.max(petalExtent, pistilExtent);

  const offDist = offMaxRatio * R;
  const px = Math.cos(offAngle) * offDist;
  const py = Math.sin(offAngle) * offDist;

  // 색 — 팔레트에서 서로 다른 2색(꽃잎색·암술색)
  const colorRnd = makeRadialSpokeRng(colorSeed);
  const fi = Math.floor(colorRnd() * RADIAL_COLOR_PALETTE.length);
  let si = Math.floor(colorRnd() * (RADIAL_COLOR_PALETTE.length - 1));
  if (si >= fi) si += 1;
  const petalHex = RADIAL_COLOR_PALETTE[fi];
  const pistilHex = RADIAL_COLOR_PALETTE[si];

  g.push();
  g.translate(cx, cy);
  g.noStroke();
  const ctx = g.drawingContext;
  ctx.save();
  // multiply 안 씀 — 암술이 꽃잎 위에 색 그대로 올라간다.
  ctx.filter = `blur(${Math.max(0.5, size * 0.006)}px)`;

  // 꽃잎
  paintOrganicBlob(g, ctx, steps, petal, R, 0, 0, petalHex, FLOWER_PETAL_LAYERS, FLOWER_PETAL_ALPHA, (colorSeed ^ 0x9e3779b9) >>> 0, 0.62, 1.05);

  // 꽃잎 가장자리 번짐 알갱이
  const sp = makeRadialSpokeRng((colorSeed + 0x77777) >>> 0);
  ctx.filter = `blur(${Math.max(0.5, size * 0.003)}px)`;
  for (let s = 0; s < FLOWER_SPECKLE_COUNT; s++) {
    const th = sp() * TWO_PI;
    const idx = Math.floor((th / TWO_PI) * steps) % steps;
    const rr = R * petal[idx] * (0.72 + Math.pow(sp(), 0.5) * 0.46);
    const d = size * (0.004 + Math.pow(sp(), 3) * 0.016);
    ctx.globalAlpha = FLOWER_PETAL_ALPHA * (0.4 + sp() * 0.7);
    g.fill(petalHex);
    g.ellipse(Math.cos(th) * rr, Math.sin(th) * rr, d, d);
  }

  // 암술 — 위에 그대로
  ctx.filter = `blur(${Math.max(0.5, size * 0.004)}px)`;
  paintOrganicBlob(g, ctx, steps, pistil, R * FLOWER_PISTIL_RATIO, px, py, pistilHex, FLOWER_PISTIL_LAYERS, FLOWER_PISTIL_ALPHA, (colorSeed ^ 0x2545f491) >>> 0, 0.7, 1.05);

  ctx.restore();
  g.pop();
}

function drawRadialSpokeDots(g, cx, cy, size, errorA, errorB, colorSeed, outerGrow = 1, innerGrow = 1) {
  // 크기 보정(스케일) 없이 size 그대로 한 번만 계산 — errorA/errorB 를
  // 어떻게 바꿔도 전체 크기는 일정하게 유지된다. outerGrow/innerGrow 는
  // 등장 애니메이션용 세트별 길이 배율(기본 1).
  const shape = buildRadialSpokeGeometry(size, errorA, errorB, colorSeed, outerGrow, innerGrow);

  g.push();
  g.translate(cx, cy);
  g.strokeCap(ROUND);

  // 방사형 선분 — 전부 중앙(0,0)에서 시작. grow<=0(아직 안 터진 세트)은
  // 건너뛴다 — 길이 0 선분이 ROUND 캡 때문에 중앙에 점처럼 남는 것 방지.
  shape.spokes.forEach((s) => {
    if (s.grow <= 0) return;
    g.stroke(s.lineColor);
    g.strokeWeight(shape.weight);
    g.line(0, 0, cos(s.angle) * s.len, sin(s.angle) * s.len);
  });

  // 각 선분 끝의 원 — 크기도 grow 에 비례(터지면서 같이 커짐).
  g.noStroke();
  shape.spokes.forEach((s) => {
    if (s.grow <= 0) return;
    g.fill(s.dotColor);
    const d = shape.dotSize * s.grow;
    g.ellipse(cos(s.angle) * s.len, sin(s.angle) * s.len, d, d);
  });

  g.pop();
}
