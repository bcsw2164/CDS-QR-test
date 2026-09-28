/* ============================================================
   archive — 보류한 그래픽 실험 (ring / tile)
   ------------------------------------------------------------
   bloom을 burst와 다른 방향으로 디벨롭하려고 만들었던 두 안이다. 지금은
   아카이브에서 빼두었고, 이 파일은 어디에서도 불러오지 않는다. 다시 볼
   때를 대비해 코드만 그대로 보관한다.

     ring — burst가 각도(θ)를 나눈다면 이쪽은 반지름(r)을 나눈다. 동심원이
            여러 겹 쌓이고, unfilledRate는 링을 끊고 overflowRate는 링
            간격을 뭉치게 한다. 선 굵기는 모든 개체가 동일하다.
            item.rotation은 회전이 아니라 '중심이 어긋나는 방향'으로 쓴다.
     tile — 레퍼런스(색면 격자 위의 과녁) 방향. 칸끼리 맞붙어 격자 전체가
            한 장면이 된다. unfilledRate는 과녁의 겹을 배경색으로 빼고,
            overflowRate는 과녁을 칸보다 크게 만들어 모서리에서 자른다.

   ── 다시 켜는 법 ────────────────────────────────────────────
   1) archive/index.html 의 .shape-row 안에 버튼을 넣는다.
        <button class="shape-btn" data-shape="rings">ring</button>
        <button class="shape-btn" data-shape="tile">tile</button>
      탭이 늘면 style.css 의 .shape-btn font-size 를 낮춰야 한다.
   2) archive/index.html 에서 sketch.js 보다 먼저 이 파일을 불러온다.
        <script src="experiments.js"></script>
   3) archive/sketch.js 에 아래를 되돌린다.
        · let ringItems = []; / let tileItems = [];
        · setup(): ringItems = generateRingItems();
                   tileItems = generateTileItems();
        · currentItems(): if (currentShape === 'rings') return ringItems;
                          if (currentShape === 'tile')  return tileItems;
        · drawItem(): 아래 [drawItem 분기] 주석의 코드를 g.rotate 바로 뒤에
          넣고, 회전 조건을 다음으로 바꾼다.
            if (currentShape !== 'rings' && currentShape !== 'tile')
              g.rotate(item.rotation || 0);
        · buildGridView(): holder.classList.toggle('tile-mode',
                             currentShape === 'tile');
   4) archive/style.css 에 tile 전용 규칙을 되돌린다.
        #canvas-holder.tile-mode {
          gap: 0;
          padding: 0;
          padding-bottom: env(safe-area-inset-bottom);
        }

   이 파일의 함수들은 shared/core.js 의 makeRadialSpokeRng·
   RADIAL_COLOR_PALETTE 와 archive/sketch.js 의 clamp01·easeOutCubic·
   generateFlowerItems 에 기대고 있다. 되살릴 때 로드 순서를 확인할 것.
   ============================================================ */

// ring 전용 — 색 시드만 있으면 되고, 형태·편심은 colorSeed와 rotation에서
// 나온다. burst와 같은 구조라 생성 로직도 같다.
function generateRingItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    item.colorSeed = item.id + COLOR_SEED_SALT;
    item.burstDelay = 0; // 실제 값은 애니메이션을 재생할 때마다 assignBurstDelays()가 채운다
  });
  return list;
}

// tile 전용 — ring과 마찬가지로 색 시드 하나만 있으면 된다.
function generateTileItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    item.colorSeed = item.id + COLOR_SEED_SALT;
    item.burstDelay = 0; // 실제 값은 애니메이션을 재생할 때마다 assignBurstDelays()가 채운다
  });
  return list;
}


/* ══ tile — 색면 격자 위의 과녁 ══════════════════════════════
   레퍼런스 2·3·4번의 방향이다. 앞의 셋과 전제가 하나 다르다 — burst·bloom·
   ring은 '검은 바탕에 놓인 독립된 오브젝트'지만, 이쪽은 칸이 서로 맞붙어
   격자 전체가 한 장면이 된다. 그래서 이 탭일 때만 셀 간격을 0으로 붙이고
   (#canvas-holder.tile-mode) 그래픽이 칸을 여백 없이 꽉 채운다.

   [데이터를 어떻게 읽는가]
     unfilledRate(errorA) — 과녁의 링이 군데군데 배경색으로 빠진다. 칠해야
                            할 자리가 안 칠해진 상태가 그대로 보인다.
     overflowRate(errorB) — 과녁이 칸보다 커져서 모서리가 잘린다. 칸 경계를
                            넘어 번진 것이 문자 그대로 '칸을 넘는' 형태가
                            된다. 캔버스가 곧 칸이라 따로 자를 필요 없이
                            저절로 잘린다.

   [한계 — 미리 적어둔다]
   칸 하나가 배경 + 동심원 몇 겹뿐이라 앞의 셋만큼 정보를 담지 못한다.
   그래서 그래픽을 눌러 크게 보는 상세 화면에서 얻는 것이 적다. 대신
   184칸이 한 화면에 깔렸을 때의 밀도는 가장 강하다. 개체를 보여주는
   아카이브로 갈지, 전체를 보여주는 화면으로 갈지에 따라 평가가 갈린다. */

const TILE_RING_MIN = 2; // 과녁의 겹 수 하한
const TILE_RING_MAX = 4; // 상한 — 개수는 colorSeed가 정한다
const TILE_BASE_MIN = 0.58; // 과녁 지름 = 칸 한 변 × 이 비율 (개체마다 다름)
const TILE_BASE_MAX = 0.92;
const TILE_OVERFLOW_MAX = 0.75; // errorB=1 일 때 지름이 커지는 추가 비율(칸을 넘어 잘린다)
const TILE_DROP_MAX = 0.7; // errorA=1 일 때 링이 배경색으로 빠질 최대 확률

// full: 칸 한 변(캔버스 전체). drawItem이 중심으로 translate 해둔 상태라
// 배경은 [-full/2, full/2] 범위를 채운다.
function drawTileTarget(g, full, errorA, errorB, colorSeed, grow = 1) {
  const rnd = makeRadialSpokeRng(colorSeed);
  const half = full / 2;

  const pool = RADIAL_COLOR_PALETTE.slice();
  const bg = pool.splice(Math.floor(rnd() * pool.length), 1)[0];

  // 배경 — 칸을 여백 없이 채운다. 옆 칸과 맞붙어 색면 격자가 된다.
  g.noStroke();
  g.fill(bg);
  g.rect(-half, -half, full, full);

  const rings = Math.round(lerp(TILE_RING_MIN, TILE_RING_MAX, rnd()));
  const baseD = full * lerp(TILE_BASE_MIN, TILE_BASE_MAX, rnd());
  // errorB — 칸보다 커지면 캔버스 경계에서 저절로 잘린다.
  const d = baseD * (1 + errorB * TILE_OVERFLOW_MAX) * easeOutCubic(clamp01(grow));

  // 링 색은 배경을 뺀 나머지에서 고른다. 이웃한 두 겹이 같은 색이면
  // 경계가 사라져 한 덩어리로 보이므로 직전 색도 제외한다.
  let prev = bg;
  for (let k = 0; k < rings; k++) {
    const rOuter = (d / 2) * (1 - k / rings);
    const dropRoll = rnd();
    const options = pool.filter((c) => c !== prev);
    const picked = options[Math.floor(rnd() * options.length)];

    // errorA — 이 겹이 통째로 배경색이 되어 '안 칠해진' 자리로 남는다.
    const col = dropRoll < errorA * TILE_DROP_MAX ? bg : picked;
    g.fill(col);
    g.ellipse(0, 0, rOuter * 2, rOuter * 2);
    prev = col;
  }
}

/* ══ ring — 동심원 ═══════════════════════════════════════════
   burst/bloom이 '중심에서 균등 각도로 바깥을 향해' 뻗는다면, 이쪽은
   '중심을 둘러싸고 반지름 방향으로 쌓인다'. 같은 극좌표를 쓰지만 burst가
   θ를 나누고 이쪽은 r을 나누므로, 두 조직 원리가 정확히 직교한다 —
   썸네일 크기에서도 방사선과 동심원은 즉시 갈린다.

   [데이터를 어떻게 읽는가]
   손으로 베낄 때 실제로 일어나는 일을 그대로 옮겼다. 은유가 아니다.
     unfilledRate(errorA) — 잉크가 모자란 상태. 링이 가늘어지고 군데군데
                            끊긴다.
     overflowRate(errorB) — 잉크가 번진 상태. 링이 두꺼워져 이웃 링과
                            붙어 뭉갠다. 끝까지 가면 검은 덩어리가 된다.
   두 축이 서로 다른 속성(끊김 / 굵기)을 맡으므로 한 그래픽 안에서 둘 다
   읽힌다. 한쪽이 다른 쪽을 상쇄해 밋밋해지지 않는다.

   [item.rotation의 용도 변경]
   동심원은 돌려도 똑같이 보여서 회전값이 무의미해진다. 버리지 않고 '중심이
   어긋나는 방향'으로 쓴다 — 안쪽 링부터 바깥쪽으로 갈수록 그 방향으로
   조금씩 밀린다. 개체마다 고정된 값이라는 성격은 그대로다.              */

const RING_COUNT_MIN = 3; // 한 그래픽의 링 개수 하한
const RING_COUNT_MAX = 14; // 상한 — 개수는 colorSeed가 정한다(개체의 정체성)
// 선 굵기는 모든 그래픽이 똑같이 쓴다 — 오차에 따라 굵기가 달라지면 어떤
// 개체는 뭉툭하고 어떤 개체는 실낱같아서 184개가 한 세트로 안 읽힌다.
// R 대비 비율이라 썸네일에서든 상세 박스에서든 같은 인상으로 보인다.
const RING_WEIGHT_RATIO = 0.07;
// errorB(번짐)는 굵기 대신 '간격'을 맡는다. 0이면 등간격으로 차분하게
// 깔리고, 1에 가까울수록 어떤 링들은 거의 붙어 뭉치고 어떤 구간은 휑하게
// 벌어진다 — 굵기를 건드리지 않고도 번져서 겹친 인상이 나온다.
const RING_GAP_JITTER_MIN = 0.25; // errorB=0 일 때 간격 불균등 정도
const RING_GAP_JITTER_MAX = 1.5; // errorB=1 일 때(1을 넘으면 붙는 링이 생긴다)
const RING_BREAK_MAX = 0.5; // errorA=1 일 때 한 링에서 끊겨 사라지는 호의 최대 비율
const RING_ECC_MAX = 0.13; // 가장 바깥 링의 중심 어긋남 = R × 이 비율
const RING_CENTER_DOT_CHANCE = 0.45; // 가운데 점이 찍힐 확률

// (0,0)이 중심인 좌표계에 그린다. drawItem이 translate/rotate를 이미 해뒀지만,
// 동심원은 회전이 무의미하므로 편심 방향만 eccAngle로 따로 받는다.
// grow(0~1) — 안쪽 링부터 바깥으로 차례차례 퍼져 나오는 등장 진행도.
function drawConcentricRings(g, size, errorA, errorB, colorSeed, eccAngle, grow = 1) {
  const rnd = makeRadialSpokeRng(colorSeed);
  const R = size / 2;

  const count = Math.round(lerp(RING_COUNT_MIN, RING_COUNT_MAX, rnd()));

  // 색 — 팔레트에서 서로 다른 3색만 골라 링마다 배정한다. 5색을 다 쓰면
  // 한 그래픽 안이 산만해져 동심 구조가 안 읽힌다.
  const pool = RADIAL_COLOR_PALETTE.slice();
  const picks = [];
  for (let i = 0; i < 3; i++) {
    picks.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  }

  // 링 간격 — 누적 증가분을 랜덤으로 뽑은 뒤 정규화한다. 불균등한 정도를
  // errorB가 키우므로, 번짐이 심한 개체일수록 몰려 붙은 구간과 휑하게
  // 벌어진 구간이 한 그래픽 안에서 극단적으로 갈린다.
  const jitter = lerp(RING_GAP_JITTER_MIN, RING_GAP_JITTER_MAX, errorB);
  const steps = [];
  let sum = 0;
  for (let i = 0; i < count; i++) {
    const inc = 1 + (rnd() * 2 - 1) * jitter;
    // 하한을 두껍게 잡지 않아야 링끼리 거의 붙는 구간이 생긴다.
    sum += Math.max(0.08, inc);
    steps.push(sum);
  }

  // 모든 개체가 같은 굵기를 쓴다. 1px 아래로는 안 내려가게 바닥을 둔다 —
  // 작은 썸네일에서 선이 사라져 버리는 것을 막는다.
  const weight = Math.max(1, R * RING_WEIGHT_RATIO);
  const ecc = R * RING_ECC_MAX;
  const ex = Math.cos(eccAngle);
  const ey = Math.sin(eccAngle);

  // 잘림 방지 — 가장 바깥 링의 반지름 + 편심 + 굵기 절반이 R을 넘지 않게
  // 전체를 줄인다. 굵기까지 계산에 넣어야 두꺼울 때 테두리가 안 잘린다.
  const fit = (R - weight / 2) / (R + ecc);

  const breakRatio = errorA * RING_BREAK_MAX;

  g.noFill();
  g.strokeCap(SQUARE); // 끊긴 자리가 둥글게 뭉개지지 않도록
  g.strokeWeight(weight);

  for (let i = 0; i < count; i++) {
    // 안쪽 링부터 순서대로 퍼져 나온다. 이미 다 나온 링은 local=1.
    const local = clamp01(grow * count - i);
    if (local <= 0) continue;

    const rBase = (steps[i] / sum) * R * fit;
    const r = rBase * easeOutCubic(local);
    const t = count > 1 ? i / (count - 1) : 0; // 안(0) → 밖(1)
    const cx = ex * ecc * t * fit;
    const cy = ey * ecc * t * fit;

    g.stroke(picks[Math.floor(rnd() * picks.length)]);

    // 끊김 — 링마다 1~3군데가 빠진다. errorA가 0이면 통짜 원으로 그려서
    // 이어붙인 자리에 생기는 이음매를 피한다.
    const gapCount = 1 + Math.floor(rnd() * 3);
    const gapStart = rnd() * TWO_PI;
    if (breakRatio < 0.01) {
      g.ellipse(cx, cy, r * 2, r * 2);
      continue;
    }
    const gap = (breakRatio * TWO_PI) / gapCount;
    const seg = TWO_PI / gapCount - gap;
    for (let k = 0; k < gapCount; k++) {
      const a0 = gapStart + k * (TWO_PI / gapCount);
      // OPEN을 명시한다 — 생략하면 p5가 부채꼴로 닫아 중심까지 선이 그어진다.
      g.arc(cx, cy, r * 2, r * 2, a0, a0 + seg, OPEN);
    }
  }

  // 가운데 점 — 1번 참고 이미지처럼 일부에만 찍힌다. 동심원의 중심을
  // 분명히 해줘서 구조가 한눈에 읽힌다.
  if (rnd() < RING_CENTER_DOT_CHANCE && grow > 0.15) {
    g.noStroke();
    g.fill(picks[0]);
    const d = R * 0.08 * easeOutCubic(clamp01(grow * 2));
    g.ellipse(0, 0, d, d);
  }
}


/* ── [drawItem 분기] ───────────────────────────────────────
   archive/sketch.js 의 drawItem() 안, g.push()/g.translate() 직후에 넣는다.

  if (currentShape === 'tile') {
    // cx는 캔버스 가로의 절반이므로 cx*2가 칸 한 변이다. 다른 그래픽과 달리
    // CELL_PADDING_RATIO를 뺀 size가 아니라 칸 전체를 쓴다 — 여백이 있으면
    // 옆 칸과 맞붙지 않아 색면 격자가 되지 않는다.
    drawTileTarget(g, cx * 2, item.errorA, item.errorB, item.colorSeed, grow ? grow.line : 1);
    g.pop();
    return;
  }

  if (currentShape === 'rings') {
    // bloom과 같은 타이밍을 쓰되(grow.line), 스케일이 아니라 '몇 번째 링까지
    // 나왔는가'로 해석한다 — 안쪽부터 바깥으로 파문처럼 번져 나온다.
    const p = grow ? grow.line : 1;
    drawConcentricRings(g, size, item.errorA, item.errorB, item.colorSeed, item.rotation || 0, p);
    g.pop();
    return;
  }
   ─────────────────────────────────────────────────────────── */
