/* ============================================================
   Signature Archive — sketch.js
   ------------------------------------------------------------
   errorA/errorB는 data/qr_error_data.json에 담긴 실제 추출
   데이터를 그대로 쓴다 — 키(qr_clean_NNN)의 번호가 QR 이미지 번호와
   동일해 1:1로 매칭된다. ITEM_COUNT는 이 데이터 개수로 정해진다(현재
   184). 그래픽 생성 로직은 shared/core.js를 About 페이지와 공유한다.

   각 데이터는 1~ITEM_COUNT번 번호(제출 순서)를 갖는다. 탭으로 정렬
   기준을 바꿔도 이 번호와 그래픽 자체는 그대로이고, 배치 순서만 바뀐다.

   오브젝트 종류 탭:
     1 bloom(방사형) — 방사형 다발 꽃잎. core.js의 drawRadialBurstFlowerDev
       (두 번째 선이 좌우반전으로 마는 모양)를 쓴다. burst 탭과 마찬가지로
       탭에 들어올 때 폭죽처럼 터지는 등장 애니메이션이 한 번 재생되고(아래
       "폭죽 등장 애니메이션"), 끝나면 정적으로 멈춘다. 회전 애니메이션은
       삭제됨.
     2 burst(방사형 스포크) — core.js의 drawRadialSpokeDots
       (중심에서 뻗는 선분 두 세트 + 끝점 원).
       아이템마다 색 시드(colorSeed)를 한 번 뽑아 고정한다. 배경은 bloom과
       동일하게 검게. 탭에 들어올 때 폭죽처럼 터지는 등장 애니메이션이
       한 번 재생되고(아래 "폭죽 등장 애니메이션"), 끝나면 정적으로 멈춘다.

   등장 애니메이션 — 탭 버튼(또는 그 탭에서 정렬 변경, 첫 로드)을 누르면
   buildGridView(true)가 첫 렌더 시점을 t=0(burstStart)으로 잡고, 같은
   자리에서 assignBurstDelays()가 아이템별 지연(item.burstDelay)을 새로
   배정한다 — 그래서 탭을 누를 때마다 등장 순서가 달라진다.

   두 탭은 이름대로 성격이 다르다(상수 정의부의 표 참고). BURST는 사건,
   BLOOM은 과정이다.
     · burst(스포크) — drawRadialSpokeDots에 세트별 길이 배율(outerGrow/
       innerGrow, perSpokeBurst=false)을 넘긴다. 0(중심에 뭉침)→1(제 크기)로
       easeOutExpo(확 퍼졌다가 감속), 밖지름 세트가 먼저·안지름 세트가
       SPOKE_BURST_SET_DELAY만큼 늦게 시작. 지연은 완전 랜덤이라 184개가
       동시다발로 흩뿌려진다. 세트 전체가 한 덩어리로 움직인다 — 상세
       박스(아래 "상세 박스 등장 애니메이션")는 이와 다른 방식.
     · bloom(방사형) — drawRadialBurstFlowerDev에 scale 배율을 둘로 나눠
       넘긴다. dotGrow = 중심에서 멀어지는 원(먼저), lineGrow = 선분(호) +
       그 끝을 따라가는 원(RADIAL_BURST_SET_DELAY만큼 늦게). 각각 중심 기준
       0→1 로 easeOutCubic(완만하게 자람). 지연이 격자 배치 순서에 비례해서
       한쪽에서부터 쓸려 지나가듯 열린다(그래픽 자체는 안 건드리고 캔버스
       변형만).

   상세 박스 등장 애니메이션 — burst(스포크) 탭에서만, 자동 전환으로 QR
   면 → 그래픽 면으로 뒤집힐 때 재생된다(showDetailStage()). 그리드와 달리
   drawRadialSpokeDots를 perSpokeBurst=true로 불러, 세트가 한 덩어리로
   커지지 않고 core.js(buildRadialSpokeGeometry)가 선분마다 개별 랜덤
   시작 시점(RADIAL_SPOKE_BURST_STAGGER_RATIO)을 뽑아 각자 다른 타이밍에
   0(중심에 뭉침)→1(제 크기)로 퍼진다. 두 모드 모두 선분당 rnd() 소비량이
   같아, 애니메이션이 끝난 뒤의 형태는 그리드에서 본 것과 항상 동일하다.
   bloom(방사형) 탭은 상세 박스에서도 정지 프레임 그대로(기존 동작).

   보기 방식 탭 (오브젝트 종류와 무관하게 적용):
     수집순   — id(1~ITEM_COUNT) 순서 그대로 배치.
     오차율순 — (errorA + errorB) / 2 오름차순(적은 것 → 많은 것)으로 배치.

   두 탭 모두 실제 CSS Grid(grid-template-columns: repeat(auto-fill,
   minmax(...)))로 구현되어 있어 열 수는 브라우저가 화면 너비에 맞춰
   자동으로 정한다. 아이템마다 독립된 <canvas>를 하나씩 담는다.
   ============================================================ */

let ITEM_COUNT = 0; // qrErrorData 로딩 후 그 개수로 정해진다(setup 참고)
const CELL_PADDING_RATIO = 0.03; // 칸 안에서 그래픽이 차지하는 여백 비율(그리드 썸네일 + burst 탭 상세 박스)

// bloom(방사형) 탭 상세 박스 전용 그래픽 크기(캔버스 대비 비율). burst(스포크)은
// CELL_PADDING_RATIO 그대로 써서 캔버스의 94%를 채우는데, bloom은 그보다 커
// 보인다는 피드백으로 상세 박스에서만 더 줄인다(그리드 썸네일은 그대로).
const DETAIL_RADIAL_SIZE_RATIO = 0.85;

/* 두 탭의 등장 애니메이션 — 이름이 곧 성격이다.
   BURST는 사건이고 BLOOM은 과정이다. 터짐은 한순간에 끝나고 피어남은
   시간이 걸린다. 아래 상수와 easing이 그 한 문장을 숫자로 옮긴 것이라,
   값을 만질 때도 이 대비가 유지되는지를 기준으로 보면 된다.

                  BURST(스포크)        BLOOM(방사형)
     지속 시간     0.35초 (짧게)        0.9초 (길게)
     easing        easeOutExpo          easeOutCubic
                   (확 튀고 급감속)     (완만하게 자람)
     아이템 지연   0~0.5초 완전 랜덤    격자 순서를 따라가는 물결
     세트 순서     밖 → 안              점 → 선
     인상          동시에 흩뿌려짐      한쪽에서부터 천천히 열림       */

// ── BLOOM(방사형) ──
// 중심-거리 원이 먼저 자리를 잡고, 그 뒤로 호가 펼쳐진다(점 → 선). 원래는
// 반대 순서였는데, 바깥으로 터져 나가는 대신 안에서부터 열리는 쪽이 개화에
// 가까워서 뒤집었다. easing도 easeOutExpo에서 바꿨다 — expo는 첫 프레임에
// 이미 절반 넘게 커져 버려서 "자란다"가 아니라 "튀어나온다"로 읽힌다.
const RADIAL_BURST_DURATION = 0.9; // 한 그룹이 0→제 크기까지 걸리는 시간(초)
const RADIAL_BURST_SET_DELAY = 0.22; // 중심-거리 원 시작 후 선분이 시작되기까지 지연(초)
// 아이템 지연은 랜덤이 아니라 격자 배치 순서에 비례한다(assignBurstDelays).
// 첫 칸이 0, 마지막 칸이 이 값 — 좌상단에서 우하단으로 쓸려 지나가듯 열린다.
const RADIAL_BURST_STAGGER_MAX = 1.1;
// 다만 순수 비례만 쓰면 줄이 자로 잰 듯 맞아떨어져 기계적으로 보인다.
// 칸마다 이 폭 안에서 흐트러뜨려 물결의 가장자리를 풀어준다.
//
// 이 값이 물결 간격보다 충분히 커야 한다. 184칸을 STAGGER_MAX에 나누면
// 이웃 칸 사이는 1.1/183 ≒ 0.006초뿐이라, 흔들림이 작으면 한 줄이 통째로
// 동시에 열리는 것처럼 보인다. 아래 값이면 이웃끼리 수십 칸 분량으로
// 뒤섞이면서도 전체가 흘러가는 방향은 그대로 남는다.
const RADIAL_BURST_STAGGER_JITTER = 0.45;
// 시작 시점만 어긋내면 여전히 "같은 속도로 자라는 것들이 시차를 두고
// 나온다"로 보인다. 그래서 자라는 속도 자체도 칸마다 다르게 준다 —
// 각 아이템의 지속 시간이 DURATION × (1 ± 이 비율) 안에서 뽑힌다.
// 개체마다 제 속도로 열려야 한 덩어리로 안 읽힌다.
const RADIAL_BURST_DURATION_VARY = 0.3;

// ── BURST(방사형 스포크) ──
// 각 선분 세트가 길이 0(중심에 뭉침)에서 제 크기로 easeOutExpo(빠르게
// 확 퍼졌다가 감속)로 커지고, 밖지름 세트가 먼저·안지름 세트가
// SPOKE_BURST_SET_DELAY 만큼 늦게 시작한다.
const SPOKE_BURST_DURATION = 0.35; // 한 세트가 0→제 크기까지 걸리는 시간(초)
const SPOKE_BURST_SET_DELAY = 0.12; // 밖지름 세트 시작 후 안지름 세트가 시작되기까지 지연(초)
const SPOKE_BURST_STAGGER_MAX = 0.5; // 아이템마다 0~이 값(초) 사이의 랜덤 지연을 줘서 동시에 안 터지게 함

// 첫 화면에 뜨는 탭. index.html에서 .active가 붙어 있는 첫 버튼의
// data-shape 값과 반드시 같아야 한다 — 다르면 버튼은 1번이 켜져 있는데
// 그래픽은 다른 탭 것이 그려진다.
//
// 아래 주석들은 두 세트를 탭 번호가 아니라 이름으로 부른다. 번호는
// index.html의 버튼 순서를 바꾸면 따라 바뀌지만 이름은 그대로라, 순서를
// 손볼 때마다 주석을 고칠 일이 없다.
//   burst = 'radial-spokes' (중심에서 뻗는 직선 선분 두 겹)
//   bloom = 'radial'        (말리는 호 + 중심에서 멀어지는 원)
let currentShape = 'radial-spokes'; // 'radial' | 'radial-spokes'
let sortMode = 'collected'; // 'collected' | 'error'

let radialItems = [];
let spokeItems = [];

// data/qr_error_data.json에서 읽은 실제 데이터. { n, errorA, errorB } 를
// n(QR 번호) 오름차순으로 정렬해서 담아둔다. loadErrorData()가 채운다.
let qrErrorData = [];

// 등장(폭죽) 애니메이션 시작 시각(초). null이면 애니메이션 중이 아님(정적).
// bloom(방사형)·burst(스포크) 탭이 공유한다.
let burstStart = null;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// BURST용 — 시작하자마자 확 튀고 급격히 감속한다.
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
// BLOOM용 — expo보다 시작이 훨씬 완만해서 "자란다"에 가깝게 읽힌다.
// 1을 넘지 않는 곡선이라 셀 밖으로 잘릴 걱정도 없다(easeOutBack 같은
// 탄성 곡선은 scale에 쓰면 bloom이 칸을 꽉 채우고 있어 잘린다).
const easeOutCubic = (t) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));

// bloom(방사형) — 아이템별 지연(itemDelay)과 지속 시간(itemDuration)을
// 반영한 현재 scale 배율.
//   dot  : 중심에서 멀어지는 errorA-거리 원 (먼저 자리를 잡는다)
//   line : 선분(호) + 그 끝을 따라가는 원 (RADIAL_BURST_SET_DELAY 만큼 늦게)
// itemDuration은 assignBurstDelays()가 칸마다 다르게 뽑아둔 값이라, 시작
// 시점뿐 아니라 열리는 속도까지 개체마다 다르다.
function radialGrowFactors(elapsedSec, itemDelay = 0, itemDuration = RADIAL_BURST_DURATION) {
  if (burstStart === null) return { line: 1, dot: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  const d = itemDuration || RADIAL_BURST_DURATION;
  return {
    dot: easeOutCubic(clamp01(t / d)),
    line: easeOutCubic(clamp01((t - RADIAL_BURST_SET_DELAY) / d)),
  };
}

// burst(스포크) — 경과 시간과 아이템별 랜덤 지연(itemDelay)에서 밖지름/안지름
// 세트의 현재 길이 배율을 구한다. itemDelay 만큼 이 아이템의 t=0 이 밀린다.
// 그리드 진입 애니메이션 전용 — 세트 전체가 한 덩어리로 0→1 easeOutExpo
// (core.js에 perSpokeBurst=false로 넘겨 그대로 최종 배율로 쓰임). 상세
// 박스 전용 애니메이션은 drawDetailFrame이 따로 계산한다.
function spokeGrowFactors(elapsedSec, itemDelay = 0) {
  if (burstStart === null) return { outer: 1, inner: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  return {
    outer: easeOutExpo(clamp01(t / SPOKE_BURST_DURATION)),
    inner: easeOutExpo(clamp01((t - SPOKE_BURST_SET_DELAY) / SPOKE_BURST_DURATION)),
  };
}

// 수집순/오차율순 모드에서 셀마다 만든 p5.Graphics 버퍼와, 등장 애니메이션
// 프레임을 다시 그리는 데 필요한 정보(아이템·중심좌표·크기)를 함께 들고
// 있는다. 재빌드 시 정리용으로도 쓰인다.
let gridCells = [];
// 리사이즈·탭 전환이 겹칠 때 오래된 빌드 결과가 뒤늦게 그려지는 것을 막는 토큰
let gridBuildToken = 0;

// qrErrorData 실측값은 대부분 낮은 구간에 몰려있고 소수의 극단치가 범위를
// 넓게 늘려놓은 형태라(특히 unfilledRate — 중앙값이 전체 폭의 7% 지점),
// min-max로 최소~최대만 0~1로 펴면 그 쏠림이 그대로 남아 다수가 여전히
// 좁은 구간에 압축된다. 대신 퍼센타일(순위) 정규화를 쓴다 — 값의 절대
// 크기가 아니라 184명 중 몇 번째로 큰지(순위)만으로 0~1에 고르게 배치하므로
// 극단치 크기와 무관하게 전 구간을 고르게 쓰게 된다. 동점은 평균 순위로
// 묶어 처리(순서를 임의로 가르지 않음).
function normalizeErrorAxis(values) {
  const n = values.length;
  if (n <= 1) return values.map(() => 0);

  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const avgRank = (i + j) / 2; // 동점 구간(i..j)은 순위를 평균내 공유
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  return ranks.map((r) => r / (n - 1));
}

// 탭1·탭2 색 고정용 시드 솔트 — item.id에 더해서 makeRadialSpokeRng에
// 넘기는 값. 이 값을 바꾸면 모든 아이템의 색이 한꺼번에 다시 뽑힌다
// (같은 값을 유지하는 한 새로고침해도 항상 동일한 색).
const COLOR_SEED_SALT = 819842174;

// 전체 회전 고정용 시드 솔트 — 색과 같은 방식이되 솔트를 달리해서, 같은
// id라도 색과 회전이 서로 다른 난수열에서 나오게 한다(같은 솔트를 쓰면
// 색이 비슷한 아이템끼리 각도까지 몰린다).
//
// [왜 오차 데이터가 아니라 id인가]
// 회전은 오차가 아니다 — 누가 종이를 어느 방향으로 놓고 그렸는지는 잘
// 그렸는지와 무관한, 그 개체만의 우연이다. errorA/errorB에 걸면 오차율순
// 정렬에서 격자 전체가 한 방향으로 도는 다이얼처럼 보여, 정렬 순서를 한 번
// 더 그리는 꼴이 된다. 그래서 색과 같은 층(= id 기반 고정 난수)에 둔다.
//
// [왜 매번 뽑는 random()이 아닌가]
// buildGridView()는 탭 전환·정렬 변경·가로폭 리사이즈마다 다시 도는데,
// 그때마다 새로 뽑으면 184개가 전부 다른 각도로 튄다. 게다가 그리드와 상세
// 박스가 같은 모양이어야 한다는 보장(core.js buildRadialSpokeGeometry 주석)도
// 깨진다. 시드 고정이면 언제 몇 번을 다시 그려도 같은 값이 나온다.
const ROTATION_SEED_SALT = 573910284;

// radial은 형태가 errorA/errorB만으로 결정되므로 아이템 생성 로직을
// 공유한다. qrErrorData(실제 데이터, setup에서 로딩 완료 후 호출)의
// n을 그대로 id로 써서 QR 번호와 1:1로 맞추고, errorA/errorB는 각각
// 축별로 정규화한 값을 쓴다.
//
// rotation(0~2π)도 여기서 만든다 — 두 탭이 이 함수를 공유하므로 같은 번호의
// QR은 burst에서든 bloom에서든 같은 각도로 놓인다(한 개체 = 한 방향).
function generateFlowerItems() {
  const normA = normalizeErrorAxis(qrErrorData.map((d) => d.errorA));
  const normB = normalizeErrorAxis(qrErrorData.map((d) => d.errorB));

  return qrErrorData.map((d, i) => ({
    id: d.n,
    errorA: normA[i],
    errorB: normB[i],
    errorScore: (normA[i] + normB[i]) / 2,
    // 형태·색과 완전히 분리된 전용 RNG에서 한 번만 뽑는다. core.js의
    // 형태용 rnd()를 건드리면 소비 순서가 밀려 184개 형태가 전부 달라진다.
    rotation: makeRadialSpokeRng(d.n + ROTATION_SEED_SALT)() * TWO_PI,
  }));
}

// bloom(방사형) 전용 — generateFlowerItems()에 선·점·선 끝 원 색을
// 더한다. 선·점 색은 오차 데이터와 무관하게 core.js의 pickRadialColors()
// 로 뽑고(팔레트 안에서 선·점이 겹치지 않게), 선 끝을 따라가는 원
// (tipColor)은 그 둘과 겹치지 않는 색을 팔레트에서 하나 더 뽑는다
// (drawRadialBurstFlowerDev용). item.id로 만든 로컬 RNG를 써서 새로고침
// 해도 같은 id는 항상 같은 색이 나오도록 고정한다.
function generateRadialItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    const rnd = makeRadialSpokeRng(item.id + COLOR_SEED_SALT);
    const { lineColor, dotColor } = pickRadialColors(rnd);
    item.lineColor = lineColor;
    item.dotColor = dotColor;
    const tipOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== lineColor && c !== dotColor);
    item.tipColor = tipOptions[Math.floor(rnd() * tipOptions.length)];
    item.burstDelay = 0; // 실제 값은 애니메이션을 재생할 때마다 assignBurstDelays()가 채운다
  });
  return list;
}

// burst(방사형 스포크) 전용 — generateFlowerItems()에 색 시드만 더한다.
// drawRadialSpokeDots는 형태를 core.js의 고정 시드로, 색(선분 두 세트·
// 끝점 원)을 이 colorSeed로 뽑는다. colorSeed를 item.id로 고정해서
// 새로고침해도 같은 id는 항상 같은 색이 나오게 한다.
function generateSpokeItems() {
  const list = generateFlowerItems();
  list.forEach((item) => {
    item.colorSeed = item.id + COLOR_SEED_SALT;
    item.burstDelay = 0; // 실제 값은 애니메이션을 재생할 때마다 assignBurstDelays()가 채운다
  });
  return list;
}

function currentItems() {
  if (currentShape === 'radial-spokes') return spokeItems;
  return radialItems;
}

// 현재 sortMode('collected' | 'error')에 따라 그릴 순서(currentItems() 인덱스 목록)를 반환
function getDisplayOrder() {
  const items = currentItems();
  const order = items.map((_, i) => i);
  if (sortMode === 'error') {
    order.sort((a, b) => items[a].errorScore - items[b].errorScore);
  }
  return order;
}

// 아이템 하나를 g 위 (cx, cy)에 size로 그린다. grow는 등장(폭죽)
// 애니메이션용 — burst(스포크)은 { outer, inner } 길이 배율, bloom(방사형)은
// { line, dot } scale 배율. null이면 제 크기(정적). perSpokeBurst는
// burst(스포크)에만 해당 — false(기본, 그리드)면 grow.outer/inner를 세트
// 전체의 최종 배율로, true(상세 박스)면 세트 공통 경과(0~1, 선형)로 보고
// core.js가 선분마다 개별 랜덤 지연을 준다.
//
// 전체 회전(item.rotation)은 캔버스를 통째로 돌려서 적용한다 — core.js의
// 그리기 함수는 손대지 않는다. 두 그래픽 모두 원점(중심)에서 뻗어 나가는
// 형태라 중심을 기준으로 한 강체 회전이고, 원점에서 가장 먼 거리가 변하지
// 않으므로 bloom의 자동 맞춤(잘림 방지 스케일)이나 셀 밖으로 삐져나오는
// 문제도 생기지 않는다. 같은 이유로 회전을 넣어도 기존 형태·색은 그대로다.
function drawItem(item, g, cx, cy, size, grow = null, perSpokeBurst = false) {
  g.push();
  g.translate(cx, cy);
  g.rotate(item.rotation || 0);

  if (currentShape === 'radial-spokes') {
    // grow.outer/grow.inner — perSpokeBurst에 따라 최종 배율 또는 선형
    // 경과, 둘 중 무엇이든 core.js가 그대로 받아 처리한다.
    const og = grow ? grow.outer : 1;
    const ig = grow ? grow.inner : 1;
    // 위에서 이미 중심으로 옮겨 놨으므로 여기서는 원점(0, 0)에 그린다.
    drawRadialSpokeDots(g, 0, 0, size, item.errorA, item.errorB, item.colorSeed, og, ig, perSpokeBurst);
    g.pop();
    return;
  }
  // bloom(방사형) — 선분(+끝 원)과 중심-거리 원을 각각 다른 배율로 넘겨
  // 순차 등장시킨다.
  const lg = grow ? grow.line : 1;
  const dg = grow ? grow.dot : 1;
  drawRadialBurstFlowerDev(
    g,
    0,
    0,
    size,
    item.errorA,
    item.errorB,
    item.lineColor,
    item.dotColor,
    item.tipColor,
    true,
    // lineAngleOffset / dotAngleOffset — 회전은 위 g.rotate()가 통째로
    // 맡으므로 여기서는 0으로 둔다. 이 둘을 서로 다르게 주면 호와 점이
    // 따로 도는 것처럼 보여 '배치'가 아니라 '움직임'으로 읽힌다.
    0,
    0,
    lg,
    dg
  );
  g.pop();
}

// 등장 애니메이션을 재생할 때마다(= buildGridView(true)) 아이템별 지연을
// 새로 배정한다.
//
// [왜 아이템 생성 시점이 아니라 여기인가]
// 예전에는 generateRadialItems/generateSpokeItems에서 한 번만 뽑았는데, 그
// 둘은 setup()에서 딱 한 번 돌기 때문에 새로고침해야만 순서가 바뀌었다.
// 페이지 안에서는 탭을 아무리 눌러도 184개가 늘 같은 순서로 등장했다.
// 여기서 뽑으면 탭 전환·정렬 변경마다 새로 흩어진다. 리사이즈는 burst 없이
// 부르므로(windowResized) 영향받지 않는다 — 화면을 돌렸다고 다시 터지면
// 곤란하다.
//
// [이래도 되는 이유]
// burstDelay는 등장 순서만 정하고 형태·색·회전에는 관여하지 않는다.
// 애니메이션이 끝나면 모든 아이템이 똑같이 grow=1에 도달하므로 최종 화면은
// 항상 같다. 색·회전이 시드로 고정된 것과 모순이 아니다 — 그쪽은 '그 개체가
// 무엇인지'라 남아야 하고, 지연은 '어떻게 등장했는지'라 지나가면 그만이다.
//
// order: 화면에 놓이는 순서(getDisplayOrder()의 결과) → items 인덱스.
// 정렬 모드가 바뀌면 이 배열도 바뀌므로 물결 방향이 자동으로 따라간다.
function assignBurstDelays(order) {
  const items = currentItems();

  if (currentShape === 'radial-spokes') {
    // BURST — 완전 랜덤. 184개가 제각각 터져 동시다발로 흩뿌려진다.
    order.forEach((idx) => {
      items[idx].burstDelay = random(0, SPOKE_BURST_STAGGER_MAX);
    });
    return;
  }

  // BLOOM — 격자 순서에 비례하는 물결. 첫 칸이 0, 마지막 칸이 STAGGER_MAX라
  // 좌상단에서 우하단으로 쓸려 지나가듯 열린다. 거기에 두 가지를 더한다.
  //   1) 시작 시점 흔들림(JITTER) — 이웃 칸끼리 뒤섞여 한 줄이 통째로
  //      열리는 것처럼 보이지 않게 한다.
  //   2) 지속 시간 편차(DURATION_VARY) — 칸마다 자라는 속도가 달라서,
  //      같은 순간에 시작한 둘도 서로 다른 시점에 다 자란다.
  // 1번만 있으면 "같은 속도로 자라는 것들이 시차를 두고 나오는" 느낌이라
  // 여전히 한 덩어리로 읽힌다. 둘을 같이 써야 개체마다 제 속도로 열린다.
  const n = order.length;
  order.forEach((idx, pos) => {
    const wave = n > 1 ? (pos / (n - 1)) * RADIAL_BURST_STAGGER_MAX : 0;
    items[idx].burstDelay = wave + random(0, RADIAL_BURST_STAGGER_JITTER);
    items[idx].burstDuration =
      RADIAL_BURST_DURATION * random(1 - RADIAL_BURST_DURATION_VARY, 1 + RADIAL_BURST_DURATION_VARY);
  });
}

// 셀별로 만들어뒀던 p5.Graphics 버퍼를 전부 폐기
function clearGridCells() {
  gridCells.forEach(({ gfx }) => gfx.remove());
  gridCells = [];
}

// gridCells에 등록된 모든 셀을 현재 등장 애니메이션 진행도에 맞춰 다시
// 그린다. errorA/errorB로 정해지는 그래픽 자체의 모양은 건드리지 않고,
// 스포크는 선분 길이 배율, 방사형은 캔버스 scale 만 시간에 따라 바꾼다.
function renderGridFrame(elapsedSec) {
  const bursting = burstStart !== null;

  gridCells.forEach(({ gfx, item, cellSize, size }) => {
    gfx.background(0, 0, 0);
    // 아이템마다 지연(burstDelay)이 달라 서로 다른 시점에 등장한다.
    let grow = null;
    if (bursting && currentShape === 'radial-spokes') {
      grow = spokeGrowFactors(elapsedSec, item.burstDelay);
    } else if (bursting) {
      // bloom·ring이 같은 타이밍(RADIAL_BURST_*)을 공유한다.
      grow = radialGrowFactors(elapsedSec, item.burstDelay, item.burstDuration);
    }
    drawItem(item, gfx, cellSize / 2, cellSize / 2, size, grow);
  });
}

// ── 수집순 / 오차율순: 실제 CSS Grid ────────────────────────
//
// 열 수는 이 함수가 아니라 CSS의 auto-fill/minmax가 화면 너비를 보고
// 정한다. 여기서는 (1) 아이템 수만큼 빈 셀 div를 만들어 넣고,
// (2) 브라우저가 레이아웃을 확정한 다음 프레임에 각 셀의 실제 크기를
// 읽어 그 크기의 p5.Graphics를 만들어 셀 안에 넣는다. 그 뒤로는 매
// 프레임 draw()가 renderGridFrame()을 호출해서 등장 애니메이션이 끝날
// 때까지 계속 다시 그린다.
//
// burst=true 로 부르면(1·2번 탭 버튼 클릭, 그 탭에서 정렬 변경, 첫 로드)
// 첫 렌더 시점을 기준으로 폭죽 등장 애니메이션을 시작한다. 리사이즈는
// burst 없이 부른다.
//
function buildGridView(burst = false) {
  const holder = document.getElementById('canvas-holder');
  clearGridCells();
  holder.innerHTML = '';
  burstStart = null; // 새 빌드 시 일단 정적으로; 아래 첫 렌더에서 필요하면 켠다

  const order = getDisplayOrder();
  const items = currentItems();
  const myToken = ++gridBuildToken;

  // 애니메이션을 재생하는 호출일 때만 지연을 새로 배정한다. 리사이즈(burst
  // 없이 부름)에서는 손대지 않으므로, 진행 중이던 애니메이션의 순서가
  // 중간에 뒤바뀌지 않는다.
  if (burst) assignBurstDelays(order);

  const frag = document.createDocumentFragment();
  const cellEls = [];
  for (let i = 0; i < order.length; i++) {
    const cell = document.createElement('div');
    cell.className = 'archive-cell';
    cell.dataset.itemId = items[order[i]].id;
    frag.appendChild(cell);
    cellEls.push(cell);
  }
  holder.appendChild(frag);

  requestAnimationFrame(() => {
    if (myToken !== gridBuildToken) return; // 그 사이 새 빌드가 시작됐으면 이 결과는 버림

    if (burst) {
      burstStart = millis() / 1000; // t=0 을 첫 렌더에 맞춘다
    }

    const density = Math.min(window.devicePixelRatio || 1, 2);

    cellEls.forEach((cellEl, i) => {
      const rect = cellEl.getBoundingClientRect();
      const cellSize = Math.max(1, Math.round(rect.width));
      const pad = cellSize * CELL_PADDING_RATIO;
      const size = cellSize - pad * 2;

      const gfx = createGraphics(cellSize, cellSize);
      gfx.pixelDensity(density);
      gfx.colorMode(HSB, 360, 100, 100);

      // createGraphics()의 캔버스는 기본이 display:none(원래 오프스크린 버퍼용)이라
      // DOM에 직접 붙여 보여주려면 켜줘야 한다.
      gfx.canvas.style.display = 'block';
      cellEl.appendChild(gfx.canvas);
      gridCells.push({ gfx, item: items[order[i]], cellSize, size });
    });

    renderGridFrame(millis() / 1000); // 첫 프레임을 즉시 한 번 그려서 애니메이션 시작 전에도 바로 보이게
  });
}

// ── 그래픽 클릭 → 상세 오버레이(QR + 이름) ─────────────────────
//
// qrErrorData의 id가 실제 QR 번호이자 itemId이므로 QR 이미지도 같은
// 번호로 그대로 대응된다(1:1). ITEM_COUNT와 QR_IMAGE_COUNT가 항상
// 같은 수(현재 184)라 아래 모듈러 순환은 사실상 항등함수로 동작하지만,
// 혹시 둘의 개수가 어긋나는 경우를 대비해 남겨둔다.
//
const QR_IMAGE_COUNT = 184; // images/qr/qr_final_001.jpg ~ qr_final_184.jpg

// data/qr_error_data.json 에서 실제 errorA(unfilledRate)/
// errorB(overflowRate) 데이터를 읽어 n(QR 번호) 오름차순으로 정렬해
// qrErrorData에 채운다. setup()에서 완료를 기다린 뒤 아이템을 만든다.
function loadErrorData() {
  return fetch('../data/qr_error_data.json')
    .then((res) => res.json())
    .then((obj) => {
      const arr = Object.entries(obj)
        .map(([key, row]) => {
          const m = String(key).match(/(\d+)$/);
          if (!m) return null;
          return { n: Number(m[1]), errorA: row.unfilledRate, errorB: row.overflowRate };
        })
        .filter(Boolean)
        .sort((a, b) => a.n - b.n);
      qrErrorData = arr;
    })
    .catch(() => {
      qrErrorData = [];
    });
}

// data/qr_name.json 에서 qr 번호 → 이름 매핑을 읽어둔다.
// 이미지와 동일하게 QR_IMAGE_COUNT 장을 기준으로 순환하므로 1~184 번만 쓴다.
// '스캔여부' 항목은 사용하지 않는다. 로딩 전/이름 미정 항목은 '익명' 으로 표시.
let qrNames = {}; // { 1: '정솔하', 2: '통대창탕후루', ... }

// [수집 순번 표시] 상세 오버레이에 "No.n"(왼쪽)·이름(오른쪽)을 나눠 붙일지
// 여부. 추후 필요 없어지면 이 줄만 false로 바꾸면 번호 표기 이전 상태
// (가운데 정렬된 이름만)로 그대로 돌아간다 — style.css의 ".detail-box
// p.has-number" 블록과 세트이니 완전히 지울 땐 그 블록도 함께 지운다.
const SHOW_QR_NUMBER_PREFIX = false;

function loadQrNames() {
  fetch('../data/qr_name.json')
    .then((res) => res.json())
    .then((list) => {
      list.forEach((row) => {
        const m = String(row.qr_nnn || '').match(/(\d+)$/);
        if (!m) return;
        const n = Number(m[1]);
        if (n >= 1 && n <= QR_IMAGE_COUNT && row['이름']) qrNames[n] = row['이름'];
      });
    })
    .catch(() => {});
}

// itemId(1..ITEM_COUNT) 를 QR 번호(1..QR_IMAGE_COUNT)로 순환시켜 준다.
function qrIndexOf(itemId) {
  return ((Number(itemId) - 1) % QR_IMAGE_COUNT) + 1;
}

function qrImagePath(itemId) {
  const n = qrIndexOf(itemId);
  return `images/qr/qr_final_${String(n).padStart(3, '0')}.jpg`;
}

// 상세 오버레이가 < , > 로 순회할 id 목록과 현재 위치. 오버레이를 열 때
// 그 시점의 정렬 순서(getDisplayOrder)를 그대로 담아두고, 버튼으로
// 앞뒤(끝에서 순환)로 이동한다.
let detailOrderIds = [];
let detailPos = 0;

// 현재 탭·정렬 기준의 표시 순서를 itemId 배열로 반환
function currentOrderedIds() {
  const items = currentItems();
  return getDisplayOrder().map((idx) => items[idx].id);
}

function itemById(id) {
  return currentItems().find((it) => it.id === Number(id));
}

// 상세 박스 안에 그려두는 그래픽 오브젝트 버퍼. 열 때마다 새로 만들고
// 닫을 때/다음 항목으로 넘어갈 때 폐기한다.
let detailGfx = null;
// 자동 전환 때마다 카드를 같은 방향으로 180도씩 돌린다(누적 각도).
// 360의 배수면 그래픽 면, 360k+180이면 QR 면. 여는 시점은 그래픽 면.
let detailFlipAngle = 0;

// burst(스포크) 탭에서만: 상세 박스 그래픽에도 그리드와 같은 폭죽 등장
// 애니메이션을 준다. QR 면일 때는 'collapsed'(중심에 뭉쳐 대기),
// showDetailStage('graphic')으로 그래픽 면이 드러나는 순간 'running'으로
// 전환해 재생하고, 다시 QR 면으로 돌아가면 다음 재생을 위해 'collapsed'로
// 되돌린다. bloom(방사형) 탭은 항상 'none'(정지 프레임)으로, 기존 동작 그대로.
let detailAnimPhase = 'none'; // 'none' | 'collapsed' | 'running'
let detailBurstStart = null; // 'running' 시작 시각(초). 그리드의 burstStart와 별개.
let detailRenderInfo = null; // { g, item, cx, cy, size } — 애니메이션 프레임마다 다시 그리는 데 필요

// 상세 박스 안에 해당 아이템의 그래픽 오브젝트를 새 p5.Graphics 버퍼에 만든다.
function renderDetailGraphic(itemId) {
  const holder = document.getElementById('detail-graphic');
  if (detailGfx) {
    detailGfx.remove();
    detailGfx = null;
  }
  holder.innerHTML = '';

  const item = itemById(itemId);
  detailRenderInfo = null;
  if (!item) return;

  const R = 520; // 렌더 해상도(표시는 CSS가 박스 폭에 맞춰 축소) — 표시 크기보다
  // 이미 넉넉해서 pixelDensity를 기기 배율까지 올릴 필요가 없다. burst(스포크) 탭은
  // 뒤집히는 CSS 트랜지션과 동시에 이 캔버스를 매 프레임 다시 그리므로, 배율을
  // 올리면(예: 최대 1040×1040) 프레임당 그릴 픽셀이 늘어 트랜지션과 메인 스레드를
  // 다투다 가끔 미세하게 끊기는 원인이 된다 — 1로 고정해 그 비용을 줄인다.
  const density = 1;
  const g = createGraphics(R, R);
  g.pixelDensity(density);
  g.colorMode(HSB, 360, 100, 100);
  // p5는 캔버스에 인라인 width/height(px)를 박아서 박스를 초과한다.
  // 컨테이너(#detail-media, QR 이미지와 동일 영역)에 꽉 맞도록 덮어쓴다.
  g.canvas.style.display = 'block';
  g.canvas.style.width = '100%';
  g.canvas.style.height = '100%';

  const size =
    currentShape === 'radial' ? R * DETAIL_RADIAL_SIZE_RATIO : R - R * CELL_PADDING_RATIO * 2;
  detailRenderInfo = { g, item, cx: R / 2, cy: R / 2, size };

  // burst(스포크) 탭은 QR 면부터 보이므로 그래픽은 일단 중심에 뭉친 채
  // 대기, bloom(방사형) 탭은 기존처럼 바로 정지 프레임으로.
  detailAnimPhase = currentShape === 'radial-spokes' ? 'collapsed' : 'none';
  detailBurstStart = null;
  drawDetailFrame();

  holder.appendChild(g.canvas);
  detailGfx = g;
}

// detailRenderInfo · detailAnimPhase 에 맞춰 상세 박스 그래픽을 한 프레임 그린다.
function drawDetailFrame() {
  if (!detailRenderInfo) return;
  const { g, item, cx, cy, size } = detailRenderInfo;
  g.background(0, 0, 100); // 상세 박스 안에서는 탭 1·2 모두 흰 배경으로 통일

  // 상세 박스는 그리드와 다른 애니메이션 방식(perSpokeBurst=true) — 선분별
  // 개별 지연·easeOutExpo는 core.js의 buildRadialSpokeGeometry가 처리하므로,
  // 여기서는 선형(미가공) 진행도만 넘긴다.
  let grow = null;
  if (detailAnimPhase === 'collapsed') {
    grow = { outer: 0, inner: 0 }; // 중심에 뭉쳐 대기(아직 안 보이는 면)
  } else if (detailAnimPhase === 'running' && detailBurstStart !== null) {
    const t = millis() / 1000 - detailBurstStart;
    grow = {
      outer: clamp01(t / SPOKE_BURST_DURATION),
      inner: clamp01((t - SPOKE_BURST_SET_DELAY) / SPOKE_BURST_DURATION),
    };
  }
  drawItem(item, g, cx, cy, size, grow, true);
}

// 누적 각도를 카드에 적용한다. data-stage 는 참고용(현재 보이는 면).
function applyDetailFlip() {
  const media = document.getElementById('detail-media');
  media.dataset.stage = (detailFlipAngle / 180) % 2 === 0 ? 'graphic' : 'qr';
  document.getElementById('detail-flipper').style.transform = `rotateY(${detailFlipAngle}deg)`;
}

// 그래픽 면으로 즉시 맞춘다(오버레이 열 때/항목 이동 시). 트랜지션을 잠깐
// 꺼서 플립 애니메이션 없이 곧바로 그래픽 면이 보이게 한다 — 안 그러면
// 이전 항목의 QR이 잠깐 보였다가 그래픽으로 넘어가는 잔상이 생긴다.
function resetDetailFlip() {
  const flipper = document.getElementById('detail-flipper');
  flipper.style.transition = 'none';
  detailFlipAngle = 0; // 그래픽 면
  applyDetailFlip();
  flipper.offsetHeight; // 리플로우 강제 → 이후 전환부터 다시 트랜지션 적용
  flipper.style.transition = '';

  // burst(스포크) 탭: 그래픽 면이 바로 보이는 시점이므로 폭죽 등장 애니메이션을
  // 즉시 재생한다.
  if (currentShape === 'radial-spokes' && detailRenderInfo) {
    detailAnimPhase = 'running';
    detailBurstStart = millis() / 1000;
  }
}

// #detail-flipper의 CSS transition(transform 0.6s)과 맞춰둔 값 — 그래픽
// 면이 화면에서 사라지는 시점을 이 트랜지션이 끝난 뒤로 미루는 데 쓴다.
const DETAIL_FLIP_TRANSITION_MS = 600;

// 카드를 지정한 면(stage: 'graphic' | 'qr')으로 맞춘다. 이미 그 면이면
// 아무것도 하지 않는다 — 자동 전환 타이머가 매번 호출하므로.
function showDetailStage(stage) {
  const showingGraphic = (detailFlipAngle / 180) % 2 === 0;
  const wantGraphic = stage === 'graphic';
  if (showingGraphic === wantGraphic) return;

  const flipAngleAtCall = detailFlipAngle; // 아래 지연 콜백에서 중간에 또 안 바뀌었는지 확인용
  detailFlipAngle += 180;
  applyDetailFlip();

  // burst(스포크) 탭에서만: 그래픽 면으로 넘어가는 순간 폭죽 등장 애니메이션을
  // 재생하고, QR 면으로 돌아가면 다음 재생을 위해 다시 중심에 뭉쳐둔다.
  if (currentShape === 'radial-spokes' && detailRenderInfo) {
    if (wantGraphic) {
      detailAnimPhase = 'running';
      detailBurstStart = millis() / 1000;
    } else {
      // QR로 넘어갈 때: 여기서 바로 'collapsed'로 그려버리면 카드가 채 돌기도
      // 전에 그래픽이 순간 사라져 보인다(플립 중엔 backface-visibility로
      // 어차피 안 보이므로, 다 그려진 그래픽을 그대로 둔 채 회전만 시킨다).
      // 회전이 끝난 뒤에야 다음 재생을 위해 중심으로 되돌린다.
      setTimeout(() => {
        if (detailFlipAngle !== flipAngleAtCall + 180) return; // 그사이 다시 바뀌었으면 손대지 않음
        detailAnimPhase = 'collapsed';
        detailBurstStart = null;
        drawDetailFrame();
      }, DETAIL_FLIP_TRANSITION_MS);
    }
  }
}

// 그래픽 → 2초 뒤 QR → 2초 뒤 그래픽 ... 오버레이가 열려 있는 동안 계속
// 반복한다. 항목을 바꾸거나(fillDetail) 오버레이를 닫으면(closeDetailOverlay)
// stopDetailAutoCycle()로 멈추고, 새 항목을 열 때 다시 그래픽부터 시작한다.
const DETAIL_AUTO_STAGE_MS = 2200;
let detailAutoTimer = null;

function stopDetailAutoCycle() {
  if (detailAutoTimer !== null) {
    clearTimeout(detailAutoTimer);
    detailAutoTimer = null;
  }
}

function scheduleDetailAutoStage(stage) {
  detailAutoTimer = setTimeout(() => {
    showDetailStage(stage);
    scheduleDetailAutoStage(stage === 'qr' ? 'graphic' : 'qr');
  }, DETAIL_AUTO_STAGE_MS);
}

// resetDetailFlip()이 이미 그래픽 면으로 맞춰둔 상태에서 시작 — 2초 뒤
// QR로 전환하는 타이머만 걸면 된다.
function startDetailAutoCycle() {
  stopDetailAutoCycle();
  scheduleDetailAutoStage('qr');
}

// itemId 하나로 오버레이 내용을 채운다 — 그래픽 오브젝트를 먼저 보여주고
// (stage='graphic'), 이름은 채우고 QR 이미지는 로드를 미리 시작해둔다
// (그래픽이 보이는 2초 동안 백그라운드에서 받아지므로 QR로 전환될 때
// 지연 없이 바로 보인다). 열고 닫기는 안 건드림.
function fillDetail(itemId) {
  const n = qrIndexOf(itemId);
  document.getElementById('detail-qr').src = qrImagePath(itemId);
  const displayName = qrNames[n] || '익명';
  const nameEl = document.getElementById('detail-name');
  // [수집 순번 표시] SHOW_QR_NUMBER_PREFIX 참고 — 지울 땐 이 if/else 블록을
  // else 쪽 한 줄(nameEl.textContent = displayName;)로 바꾸면 원래대로 돌아간다.
  if (SHOW_QR_NUMBER_PREFIX) {
    nameEl.classList.add('has-number');
    nameEl.textContent = '';
    const noSpan = document.createElement('span');
    noSpan.className = 'detail-no';
    noSpan.textContent = `No.${n}`;
    const personSpan = document.createElement('span');
    personSpan.className = 'detail-person';
    personSpan.textContent = displayName;
    nameEl.append(noSpan, personSpan);
  } else {
    nameEl.classList.remove('has-number');
    nameEl.textContent = displayName;
  }
  renderDetailGraphic(itemId);
  resetDetailFlip(); // 그래픽 면부터 시작
  startDetailAutoCycle(); // 그래픽 → 2초 후 QR → 2초 후 그래픽 ... 자동 반복
  updateDetailNavButtons();
}

// 넘어가기 전엔 브라우저 캐시에 없어 로드 지연(이전 QR이 잠깐 보임)이
// 생기므로, 열 때/이동할 때마다 양옆(이전·다음) QR 이미지를 미리
// 백그라운드에서 받아둔다. 한 번 받은 경로는 다시 요청하지 않는다.
// 양 끝(첫/마지막 항목)에서는 순환하지 않으므로 없는 쪽은 건너뛴다.
const preloadedQrPaths = new Set();
function preloadQr(itemId) {
  const path = qrImagePath(itemId);
  if (preloadedQrPaths.has(path)) return;
  preloadedQrPaths.add(path);
  new Image().src = path;
}
function preloadDetailNeighbors() {
  if (!detailOrderIds.length) return;
  if (detailPos + 1 < detailOrderIds.length) preloadQr(detailOrderIds[detailPos + 1]);
  if (detailPos - 1 >= 0) preloadQr(detailOrderIds[detailPos - 1]);
}

// 첫 항목이면 이전(<) 버튼을, 마지막 항목이면 다음(>) 버튼을 숨겨서
// 양 끝에서 순환하지 않고 멈춘 것처럼 보이게 한다.
function updateDetailNavButtons() {
  const atFirst = detailPos <= 0;
  const atLast = detailPos >= detailOrderIds.length - 1;
  document.getElementById('detail-prev').style.display = atFirst ? 'none' : '';
  document.getElementById('detail-next').style.display = atLast ? 'none' : '';
}

function openDetailOverlay(itemId) {
  detailOrderIds = currentOrderedIds();
  detailPos = detailOrderIds.indexOf(Number(itemId));
  if (detailPos < 0) detailPos = 0;
  fillDetail(itemId);
  document.getElementById('detail-overlay').classList.add('open');
  lockBodyScroll();
  preloadDetailNeighbors();
}

// ── 배경 스크롤 잠금 ────────────────────────────────────────
// 상세 오버레이가 열린 동안 뒤 그리드가 같이 밀리지 않도록 막는다.
//
// [왜 body에 position:fixed + overflow:hidden 을 쓰지 않는가]
// 예전에는 그 방식이었는데, 문서가 스크롤 불가 상태가 되면서 두 가지가
// 따라왔다.
//   1) 오른쪽 스크롤바가 통째로 사라진다. 여닫을 때마다 슬라이더가
//      깜빡이고, 데스크탑에서는 그만큼 레이아웃 폭까지 출렁인다.
//   2) 문서 스크롤이 0으로 떨어져 #control-bars 의 position:sticky 가
//      풀린다. 그걸 되돌리려고 --scroll-lock-top 으로 역보정을 거는
//      군더더기가 필요했다.
// 문서는 스크롤 가능한 상태로 그냥 두고 입력만 막으면 둘 다 생기지 않는다.
// 터치는 style.css 의 #detail-overlay.open{touch-action:none} 이 맡고
// (shared/menu.css 커튼과 같은 방식), 여기서는 휠과 스크롤 키를 막는다.

function blockScrollEvent(e) {
  e.preventDefault();
}

function lockBodyScroll() {
  document.body.classList.add('detail-open');
  // passive:false 로 등록해야 preventDefault 가 먹는다. 브라우저는
  // wheel/touchmove 를 기본적으로 passive 로 잡는다.
  window.addEventListener('wheel', blockScrollEvent, { passive: false });
  window.addEventListener('touchmove', blockScrollEvent, { passive: false });
}

function unlockBodyScroll() {
  if (!document.body.classList.contains('detail-open')) return;
  document.body.classList.remove('detail-open');
  window.removeEventListener('wheel', blockScrollEvent);
  window.removeEventListener('touchmove', blockScrollEvent);
}

// dir: -1(이전) | +1(다음). 목록 양 끝(첫/마지막)에서는 반대편으로
// 순환하지 않고 멈춘다 — 버튼도 updateDetailNavButtons()로 숨겨지지만,
// 키보드 방향키 입력에 대비해 여기서도 범위를 벗어나면 그대로 무시한다.
function stepDetail(dir) {
  if (!detailOrderIds.length) return;
  const next = detailPos + dir;
  if (next < 0 || next >= detailOrderIds.length) return;
  detailPos = next;
  fillDetail(detailOrderIds[detailPos]);
  preloadDetailNeighbors();
}

function closeDetailOverlay() {
  stopDetailAutoCycle(); // 페이지(오버레이)를 벗어나면 자동 전환도 멈춘다
  document.getElementById('detail-overlay').classList.remove('open');
  unlockBodyScroll();
  if (detailGfx) {
    detailGfx.remove();
    detailGfx = null;
  }
  detailRenderInfo = null;
  detailAnimPhase = 'none';
  detailBurstStart = null;
}

// ── p5 setup ────────────────────────────────────────────────
// errorA/errorB가 실제 데이터(qrErrorData)로 결정되므로, 그 로딩이 끝날
// 때까지 기다렸다가 아이템을 만들고 그리드를 처음 빌드한다. 그 사이에도
// 이벤트 리스너는 먼저 걸어둬 UI 자체는 바로 반응하도록 한다.
async function setup() {
  // 이 스케치는 그리드 셀마다 createGraphics()로 따로 그리므로 메인 캔버스가
  // 필요 없다. 명시하지 않으면 p5가 100x100 기본 캔버스를 body 끝에 붙이는데,
  // 예전에는 body의 overflow:hidden에 가려 안 보였지만 문서 스크롤로 바뀐
  // 지금은 페이지 맨 아래에 빈 100px이 딸려 붙는다.
  noCanvas();

  colorMode(HSB, 360, 100, 100);
  frameRate(30); // 등장 애니메이션용 — 아이템이 많아 매 프레임 다시 그리는 비용을 아낌

  loadQrNames(); // qr 번호 → 이름 매핑을 비동기로 읽어둔다(클릭 시점에만 필요)

  const shapeButtons = document.querySelectorAll('.shape-btn');
  shapeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      shapeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentShape = btn.dataset.shape;
      buildGridView(true); // 1·2번 탭이면 폭죽 등장 애니메이션 시작
    });
  });

  const modeButtons = document.querySelectorAll('.mode-btn');
  modeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      modeButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      sortMode = btn.dataset.mode;
      buildGridView(true); // 1·2번 탭에선 정렬 변경 때도 폭죽 애니메이션 재생
    });
  });

  // 셀은 buildGridView()가 매번 새로 만들지만 #canvas-holder 자체는 그대로이므로
  // 위임(delegation)으로 한 번만 걸어둔다.
  document.getElementById('canvas-holder').addEventListener('click', (e) => {
    const cell = e.target.closest('.archive-cell');
    if (!cell) return;
    openDetailOverlay(cell.dataset.itemId);
  });

  // 박스 밖 어두운 배경을 클릭하면 닫힘
  document.getElementById('detail-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'detail-overlay') closeDetailOverlay();
  });

  // < , > 버튼 — 이전/다음 사람의 이미지로. 버튼 클릭이 배경 닫기로
  // 번지지 않도록 stopPropagation.
  document.getElementById('detail-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    stepDetail(-1);
  });
  document.getElementById('detail-next').addEventListener('click', (e) => {
    e.stopPropagation();
    stepDetail(1);
  });

  // 키보드 ← / → 로도 이동(오버레이가 열려 있을 때만), Esc 로 닫기.
  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('detail-overlay').classList.contains('open')) return;
    if (e.key === 'ArrowLeft') stepDetail(-1);
    else if (e.key === 'ArrowRight') stepDetail(1);
    else if (e.key === 'Escape') closeDetailOverlay();
    // 스페이스·PageUp/Down·Home/End·위아래 방향키로도 뒤가 밀리지 않게 한다.
    // 휠·터치만 막으면 키보드로는 그대로 스크롤된다.
    else if ([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(e.key))
      e.preventDefault();
  });

  await loadErrorData(); // 실제 errorA/errorB 데이터를 기다린 뒤 아이템 생성
  ITEM_COUNT = qrErrorData.length;
  radialItems = generateRadialItems();
  spokeItems = generateSpokeItems();

  buildGridView(true); // 첫 로드에도 첫 탭 폭죽 등장 애니메이션 재생
}

// 화면 회전/리사이즈 시 열 수·셀 크기가 바뀔 수 있으므로 다시 빌드
// 셀 크기는 가로폭에만 좌우된다(높이는 aspect-ratio 1:1). 그리고 iOS
// 사파리는 스크롤할 때 툴바가 접혔다 펴지면서 높이만 계속 바뀌는데, 그때마다
// 그리드를 통째로 다시 만들면 비용이 크고 화면도 깜빡인다. 그래서 폭이
// 실제로 달라졌을 때만 다시 빌드한다.
let lastGridWidth = window.innerWidth;

function windowResized() {
  if (window.innerWidth === lastGridWidth) return;
  lastGridWidth = window.innerWidth;
  buildGridView();
}

// 애니메이션 루프 — 그리드(두 탭 모두)와 상세 박스(burst 탭) 모두 평소엔
// 정적이고, 각자의 폭죽 등장 애니메이션이 진행 중일 때만 매 프레임 다시
// 그리다가 끝나면 멈춘다.
function draw() {
  const nowSec = millis() / 1000;

  if (gridCells.length > 0 && burstStart !== null) {
    renderGridFrame(nowSec);

    // 가장 늦게 시작하는 아이템(STAGGER_MAX)까지 다 커지면 종료.
    // bloom은 물결 지연 위에 JITTER가 얹히고 지속 시간도 칸마다 다르므로,
    // 가장 늦게 시작해서 가장 느리게 자라는 최악의 조합을 기준으로 잡는다 —
    // 빼먹으면 마지막 칸 몇 개가 다 자라기 전에 루프가 멈춘다.
    let total = 0;
    if (currentShape !== 'radial-spokes') {
      total =
        RADIAL_BURST_STAGGER_MAX +
        RADIAL_BURST_STAGGER_JITTER +
        RADIAL_BURST_SET_DELAY +
        RADIAL_BURST_DURATION * (1 + RADIAL_BURST_DURATION_VARY);
    } else {
      total = SPOKE_BURST_STAGGER_MAX + SPOKE_BURST_SET_DELAY + SPOKE_BURST_DURATION;
    }
    if (nowSec - burstStart >= total) {
      burstStart = null; // 애니메이션 종료 → 이후 정적
    }
  }

  if (detailAnimPhase === 'running' && detailBurstStart !== null) {
    drawDetailFrame();
    if (nowSec - detailBurstStart >= SPOKE_BURST_SET_DELAY + SPOKE_BURST_DURATION) {
      detailAnimPhase = 'none'; // 애니메이션 종료 → 이후 정적(제 크기)
      detailBurstStart = null;
      drawDetailFrame(); // 제 크기로 마지막 프레임 확정
    }
  }
}
