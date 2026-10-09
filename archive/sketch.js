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
       세트 지연만큼 늦게 시작. 등장 순서는 배치와 무관한 완전 랜덤이고,
       한 프레임 간격의 슬롯에 SPOKE_BURST_PER_FRAME개씩 담아서 한 프레임에
       그보다 많이 터지지 않는다. 전체 길이는 SPOKE_BURST_TOTAL로 고정 —
       매번 같은 시간에 시작하고 끝난다(assignSpokeBurstDelays). 세트 전체가
       한 덩어리로 움직인다 — 상세 박스(아래 "상세 박스 등장 애니메이션")는
       이와 다른 방식.
     · bloom(방사형) — scale과 함께 회전도 애니메이션된다. 조금 돌아간
       자리에서 시작해 제 각도까지 되돌아오며 멎는다
       (RADIAL_BURST_SPIN_MIN/MAX). scale과 타임라인은 같고 감속 곡선만
       약하게 쓴다(RADIAL_BURST_SPIN_EASE) — 회전은 초반 속도가 다 보여야
       도는 것으로 읽힌다. 아래는 scale 쪽 설명.
     · bloom(방사형) — drawRadialBurstFlowerDev에 scale 배율을 둘로 나눠
       넘긴다. dotGrow = 중심에서 멀어지는 원(먼저), lineGrow = 선분(호) +
       그 끝을 따라가는 원(RADIAL_BURST_SET_DELAY만큼 늦게). 각각 중심 기준
       0→1 로 감속하며 자람(RADIAL_BURST_SCALE_EASE). 지연이 격자 배치
       순서에 비례해서
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
// 자라면서 같이 돌다가 제자리에서 멎는 각도(라디안). 0에서 시작해 커지는
// 게 아니라, 이만큼 돌아간 자리에서 시작해 제 각도(item.rotation +
// 그룹별 오프셋)로 되돌아오며 멎는다 — 그래야 끝 모습이 정적 상태와
// 똑같아진다(배치는 '그 개체가 무엇인지'라 애니메이션이 바꿔선 안 된다).
//
// [왜 한 바퀴씩 돌리지 않는가]
// bloom은 사건이 아니라 과정이다. 크게 돌리면 '던져진 것'으로 읽혀
// burst 쪽 성격이 된다. 꽃잎이 벌어지며 비틀리는 정도까지만 준다.
// 칸마다 이 범위에서 크기를, 방향(좌/우)은 반반으로 뽑는다.
// 참고: HALF_PI ≒ 1.571(90도), PI ≒ 3.142(180도), TWO_PI ≒ 6.283(한 바퀴).
const RADIAL_BURST_SPIN_MIN = 0.6; // ≒ 34도
const RADIAL_BURST_SPIN_MAX = 1.8; // ≒ 103도
// 회전에 쓰는 감속 곡선의 세기(남은 각도 = (1-t)^이 값).
// scale의 easeOutCubic(=3)을 회전에도 쓰면 첫 10%에 회전의 27%가 끝나버려
// 보이기 시작할 땐 거의 멎어 있고, 1(=선형)이면 끝까지 등속으로 돌아
// 기계적으로 보인다. 그 사이 값을 쓴다 — 초반에 돌고 있다는 게 전달될
// 만큼은 남겨두고, 끝은 부드럽게 멎는다.
//   1 = 선형 · 2 = easeOutQuad · 3 = easeOutCubic(scale과 동일)
const RADIAL_BURST_SPIN_EASE = 2;
// scale에 쓰는 감속 곡선의 세기(현재 크기 = 1 - (1-t)^이 값).
// 3(easeOutCubic)이면 t=0에서의 속도가 평균의 3배라, 첫 0.1초에 벌써
// 30%까지 커진다 — 중심에서 조금 나왔다가 확 튀어나오는 것처럼 읽힌다.
// 값을 낮추면 시작 속도가 평균에 가까워져 주어진 시간 안에서 고르게
// 자란다. bloom은 사건이 아니라 과정이라 이쪽이 맞다.
//   1 = 선형(등속) · 2 = easeOutQuad · 3 = easeOutCubic(예전 값)
const RADIAL_BURST_SCALE_EASE = 1.7;

// ── BURST(방사형 스포크) ──
// 각 선분 세트가 길이 0(중심에 뭉침)에서 제 크기로 easeOutExpo(빠르게
// 확 퍼졌다가 감속)로 커지고, 밖지름 세트가 먼저·안지름 세트가
// SPOKE_BURST_SET_DELAY 만큼 늦게 시작한다.
const SPOKE_BURST_DURATION = 0.35; // 한 세트가 0→제 크기까지 걸리는 시간(초)
const SPOKE_BURST_SET_DELAY = 0.12; // 밖지름 세트 시작 후 안지름 세트가 시작되기까지 지연(초)
const SPOKE_BURST_STAGGER_MAX = 0.5; // (상세 박스 전용으로만 남음) 아이템별 랜덤 지연의 상한

// 그리드 등장 — 한 프레임에 최대 3개까지만 터진다.
//
// [왜 프레임 격자인가]
// 지연을 구간 안에서 자유롭게 뽑으면 값은 전부 달라도 한 프레임(1/60초)
// 안에 여러 개가 묶여 '동시에' 보인다. 예전에는 한 프레임에 15개까지 같이
// 터졌다. 그래서 지연을 자유롭게 뽑지 않고, 한 프레임 간격의 슬롯을 만들어
// 슬롯마다 정해진 개수만 담는다. 동시 발생 수가 확률이 아니라 구조적으로
// 상한을 갖는다.
//
// [왜 1개가 아니라 3개인가]
// 184개를 한 프레임에 하나씩 떼어 놓으려면 퍼지는 구간만 183프레임 ≈
// 3.05초가 필요해서 전체가 3.8초까지 늘어난다 — burst는 사건이라 그만큼
// 끌면 성격이 깨진다. 슬롯당 3개면 필요한 프레임이 1/3(62프레임 ≈ 1.02초)로
// 줄고, 한 프레임에 3개는 눈으로 구분되지 않는다. 동시 발생 수와 전체
// 길이는 맞바꾸는 관계라서, 길이를 더 줄이려면 이 값을 올리는 수밖에 없다.
//   1개 → 3.8초 · 2개 → 2.25초 · 3개 → 1.75초 · 4개 → 1.5초
const SPOKE_BURST_SLOT = 1 / 60; // 슬롯 간격의 하한 = 60fps 한 프레임
const SPOKE_BURST_PER_FRAME = 3; // 한 슬롯(=한 프레임)에 담는 아이템 수의 상한
const SPOKE_BURST_TOTAL = 1.75; // 전체 등장 애니메이션 길이(초) — 항상 이 값
const SPOKE_BURST_DURATION_VARY = 0.35; // 아이템별 지속 시간 편차(DURATION × 1±이 값)
const SPOKE_BURST_SET_DELAY_VARY = 0.6; // 밖→안 세트 지연 편차(SET_DELAY × 1±이 값)

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

// burst(스포크) 그리드 등장의 '이번 재생' 설정. assignSpokeBurstDelays()가
// 매 재생마다 새로 채운다. total은 마지막 칸이 다 자라는 시점이라
// draw()에서 애니메이션 종료 판정에 쓴다(지연·지속 시간이 매번 달라져
// 상수로는 계산할 수 없다).
let spokeBurstPlan = {
  setDelay: SPOKE_BURST_SET_DELAY,
  total: SPOKE_BURST_TOTAL,
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// BURST용 — 시작하자마자 확 튀고 급격히 감속한다.
const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
// BLOOM용 — expo보다 시작이 훨씬 완만해서 "자란다"에 가깝게 읽힌다.
// 1을 넘지 않는 곡선이라 셀 밖으로 잘릴 걱정도 없다(easeOutBack 같은
// 탄성 곡선은 scale에 쓰면 bloom이 칸을 꽉 채우고 있어 잘린다).
const easeOutCubic = (t) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, 3));
// 위 둘의 일반형 — 지수(p)로 감속 세기를 고른다. p=1이면 선형, 커질수록
// 초반에 몰린다. 회전처럼 세기를 숫자로 조절하고 싶은 곳에 쓴다.
const easeOutPow = (t, p) => (t >= 1 ? 1 : 1 - Math.pow(1 - t, p));

// bloom(방사형) — 아이템별 지연(itemDelay)과 지속 시간(itemDuration)을
// 반영한 현재 scale 배율.
//   dot  : 중심에서 멀어지는 errorA-거리 원 (먼저 자리를 잡는다)
//   line : 선분(호) + 그 끝을 따라가는 원 (RADIAL_BURST_SET_DELAY 만큼 늦게)
//   spin : 회전용 진행도 — dot과 같은 타임라인이지만 감속이 더 약하다
// itemDuration은 assignBurstDelays()가 칸마다 다르게 뽑아둔 값이라, 시작
// 시점뿐 아니라 열리는 속도까지 개체마다 다르다.
//
// [회전은 왜 곡선을 따로 쓰나]
// scale과 회전은 같은 타임라인을 공유해야 한 동작으로 읽히지만, 같은
// 곡선을 쓰면 안 맞는다. scale은 크기 변화라 초반에 몰려도 '펼쳐진다'로
// 보이는데, 회전은 각도 변화가 곧 속도감이어서 초반에 다 써버리면 보일
// 무렵엔 멎어 있다. 그래서 타임라인은 같이 쓰고 감속만 약하게 한다
// (RADIAL_BURST_SPIN_EASE).
function radialGrowFactors(elapsedSec, itemDelay = 0, itemDuration = RADIAL_BURST_DURATION) {
  if (burstStart === null) return { line: 1, dot: 1, spin: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  const d = itemDuration || RADIAL_BURST_DURATION;
  const dotRaw = clamp01(t / d);
  return {
    dot: easeOutPow(dotRaw, RADIAL_BURST_SCALE_EASE),
    line: easeOutPow(clamp01((t - RADIAL_BURST_SET_DELAY) / d), RADIAL_BURST_SCALE_EASE),
    spin: easeOutPow(dotRaw, RADIAL_BURST_SPIN_EASE),
  };
}

// burst(스포크) — 경과 시간과 아이템별 랜덤 지연(itemDelay)에서 밖지름/안지름
// 세트의 현재 길이 배율을 구한다. itemDelay 만큼 이 아이템의 t=0 이 밀린다.
// 그리드 진입 애니메이션 전용 — 세트 전체가 한 덩어리로 0→1 easeOutExpo
// (core.js에 perSpokeBurst=false로 넘겨 그대로 최종 배율로 쓰임). 상세
// 박스 전용 애니메이션은 drawDetailFrame이 따로 계산한다.
function spokeGrowFactors(elapsedSec, itemDelay = 0, itemDuration = SPOKE_BURST_DURATION) {
  if (burstStart === null) return { outer: 1, inner: 1 };
  const t = elapsedSec - burstStart - itemDelay;
  const d = itemDuration || SPOKE_BURST_DURATION;
  const setDelay = spokeBurstPlan.setDelay;
  return {
    outer: easeOutExpo(clamp01(t / d)),
    inner: easeOutExpo(clamp01((t - setDelay) / d)),
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

// bloom 전용 — 두 구성 요소(호 그룹 / 중심-거리 원 그룹)를 각각 통째로
// 돌리는 각도의 고정 시드 솔트. 색·전체 회전과 또 다른 난수열에서 나오게
// 솔트를 달리한다.
//
// [전체 회전(ROTATION_SEED_SALT)만으로는 왜 부족한가]
// bloom의 선은 360도를 arcCount로 똑같이 나눈 자리에 놓여서 도형이 완전한
// 회전 대칭이다. 그래서 전체를 통째로 돌리면 돌린 그림이 원래 그림과 겹쳐,
// 개체마다 회전값이 달라도 눈에는 같은 배치로 읽힌다. 두 그룹을 따로
// 돌리면 둘의 상대 각도가 개체마다 달라지고, 그 상대 각도는 대칭으로
// 상쇄되지 않아 배치가 실제로 달라 보인다.
//
// [그래서 실제로 보이는 건 둘의 차이]
// 두 값의 공통분은 전체 회전과 같은 역할이라 눈에 띄지 않고, 차이만
// 드러난다. 그래도 두 그룹에 각각 값을 주는 쪽으로 쓴다 — '두 요소가 각자
// 제 각도를 가진다'가 의도이고, 한쪽만 돌리는 코드는 나중에 읽을 때
// 어느 쪽이 기준인지 헷갈린다.
const GROUP_ANGLE_SEED_SALT = 294817365;

// radial은 형태가 errorA/errorB만으로 결정되므로 아이템 생성 로직을
// 공유한다. qrErrorData(실제 데이터, setup에서 로딩 완료 후 호출)의
// n을 그대로 id로 써서 QR 번호와 1:1로 맞추고, errorA/errorB는 각각
// 축별로 정규화한 값을 쓴다.
//
// rotation(0~2π)도 여기서 만든다 — 두 탭이 이 함수를 공유하므로 같은 번호의
// QR은 burst에서든 bloom에서든 같은 각도로 놓인다(한 개체 = 한 방향).
// bloom은 회전 대칭 때문에 이 전체 회전이 눈에 띄지 않아서, 두 구성
// 요소를 각각 돌리는 각도를 따로 둔다 — GROUP_ANGLE_SEED_SALT 참고.
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
    // 호 그룹 / 원 그룹을 각각 통째로 돌리는 각도(0~2π). 색과 섞이지 않게
    // 전용 RNG를 따로 만들어 쓴다 — 위 rnd()를 더 소비하면 색 선택이 밀린다.
    const angleRnd = makeRadialSpokeRng(item.id + GROUP_ANGLE_SEED_SALT);
    item.lineAngleOffset = angleRnd() * TWO_PI;
    item.dotAngleOffset = angleRnd() * TWO_PI;
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
    // 실제 값은 애니메이션을 재생할 때마다 assignSpokeBurstDelays()가 채운다
    item.burstDelay = 0;
    item.burstDuration = SPOKE_BURST_DURATION;
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

  // bloom 등장 애니메이션 전용 — 자라는 동안 같이 돌다가 제 각도에서 멎는다.
  // burst(스포크)는 해당 없음(grow가 { outer, inner }라 spin이 없다).
  //
  // grow.spin은 scale과 같은 타임라인에 감속만 약하게 먹인 진행도다
  // (RADIAL_BURST_SPIN_EASE). 시작과 끝은 scale과 같고 중간 속도만 다르다.
  const spin =
    grow && grow.spin !== undefined ? (item.burstSpin || 0) * (1 - grow.spin) : 0;
  g.rotate((item.rotation || 0) + spin);

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
    // lineAngleOffset / dotAngleOffset — 두 그룹을 각각 통째로 돌린다
    // (GROUP_ANGLE_SEED_SALT 참고). 개체마다 고정된 값이라 '움직임'이
    // 아니라 '배치'로 읽힌다 — 매 프레임 다시 뽑으면 둘이 따로 도는 것처럼
    // 보이므로, 반드시 아이템에 박아둔 값을 그대로 넘겨야 한다.
    item.lineAngleOffset || 0,
    item.dotAngleOffset || 0,
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
    // BURST — 한 프레임 간격 슬롯을 셔플해 나눠 준다(동시 발생 상한, 길이 고정).
    assignSpokeBurstDelays(order);
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
    // 돌아갈 각도와 방향 — 지연·지속 시간과 같은 층(재생할 때마다 새로
    // 뽑는 '어떻게 등장했는지')에 둔다. 끝나면 0으로 수렴하므로 최종
    // 배치에는 영향이 없다.
    items[idx].burstSpin =
      random(RADIAL_BURST_SPIN_MIN, RADIAL_BURST_SPIN_MAX) * (random() < 0.5 ? -1 : 1);
  });
}

// burst(스포크) 전용 — 이번 재생의 등장 설정을 통째로 새로 뽑는다.
//
// [동시 발생 수에 상한이 있다]
// 한 프레임 간격의 슬롯을 만들고, 셔플한 순서대로 슬롯마다
// SPOKE_BURST_PER_FRAME개씩 채운다. 슬롯끼리는 한 프레임 이상 떨어져 있고
// 한 슬롯에 들어가는 수가 정해져 있으니, 같은 프레임에 터지는 개수가 그
// 값을 넘지 않는다 — 확률이 아니라 구조다.
//
// [같은 슬롯 안에서는 지연을 흔들지 않는다]
// 같은 슬롯의 3개는 지연이 완전히 같다. 프레임 안에서 조금씩 어긋내 봐도
// 60fps에서는 어차피 같은 프레임에 그려지고, 어긋낸 값이 프레임 경계를
// 넘으면 옆 슬롯과 섞여 상한이 깨진다. 그래서 그냥 같게 둔다.
//
// [순서는 항상 완전 랜덤]
// 슬롯을 섞는 것 말고는 아무 규칙이 없다. 화면 배치 순서(order의 pos)를
// 지연에 쓰지 않으므로 어느 칸이 먼저 터질지 예측되지 않는다. 배치 순서를
// 따라 쓸려 지나가는 물결은 bloom 쪽 성격이다.
//
// [길이는 항상 같다]
// 슬롯 간격(step)을 '가장 늦게 끝나는 칸이 정확히 TOTAL에 닿는' 값으로
// 맞춘다. 칸마다 자라는 속도가 달라 가장 늦게 끝나는 칸이 꼭 마지막 슬롯은
// 아니므로, 칸별 허용 간격을 구해 그중 최솟값을 쓴다. 그래야 느리게 자라는
// 칸이 끝을 넘겨 잘리지 않는다.
// 단, 간격은 한 프레임 밑으로는 내려가지 않는다 — TOTAL을 너무 줄이면
// 끝 시점이 고정되는 쪽이 아니라 동시 발생 상한이 먼저 지켜진다(그래서
// total을 실측값으로 담아 draw()의 종료 판정이 어긋나지 않게 한다).
//
// [그럼 매번 뭐가 달라지나]
// (1) 순서 — 어느 칸이 먼저냐 (2) 칸마다 자라는 속도 (3) 밖·안 세트가
// 겹치는 정도. 슬롯 간격이 일정해서 '몰렸다 잦아드는' 밀도 변화는 없다 —
// 동시 발생 수에 상한을 두면 간격을 균등하게 쓸 수밖에 없다.
//
// [최종 화면은 그대로다]
// 애니메이션이 끝나면 전부 grow=1에 도달한다. 형태·색·회전(시드 고정)은
// 손대지 않는다.
function assignSpokeBurstDelays(order) {
  const items = currentItems();
  const n = order.length;

  const setDelay =
    SPOKE_BURST_SET_DELAY * random(1 - SPOKE_BURST_SET_DELAY_VARY, 1 + SPOKE_BURST_SET_DELAY_VARY);
  const durations = order.map(
    () => SPOKE_BURST_DURATION * random(1 - SPOKE_BURST_DURATION_VARY, 1 + SPOKE_BURST_DURATION_VARY)
  );

  // 0..n-1 등수를 Fisher-Yates로 섞고, 등수를 PER_FRAME으로 나눠 슬롯 번호로
  // 쓴다. 등수가 중복되지 않으니 한 슬롯에 PER_FRAME개를 넘겨 담는 일이 없다.
  const ranks = order.map((_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random(i + 1));
    const tmp = ranks[i];
    ranks[i] = ranks[j];
    ranks[j] = tmp;
  }
  const slotOf = ranks.map((rank) => Math.floor(rank / SPOKE_BURST_PER_FRAME));

  // 슬롯 간격 — 끝 시점을 TOTAL에 맞추되 한 프레임 미만으로는 좁히지 않는다.
  let step = Infinity;
  for (let i = 0; i < n; i++) {
    const slot = slotOf[i];
    if (slot === 0) continue; // t=0에 터지는 칸은 간격과 무관
    step = Math.min(step, (SPOKE_BURST_TOTAL - setDelay - durations[i]) / slot);
  }
  if (!isFinite(step)) step = SPOKE_BURST_SLOT;
  step = Math.max(step, SPOKE_BURST_SLOT);

  let total = 0;
  order.forEach((idx, i) => {
    const delay = slotOf[i] * step;
    items[idx].burstDelay = delay;
    items[idx].burstDuration = durations[i];
    total = Math.max(total, delay + setDelay + durations[i]);
  });

  spokeBurstPlan = { setDelay, total };
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
      grow = spokeGrowFactors(elapsedSec, item.burstDelay, item.burstDuration);
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

// 그래픽 → QR → 그래픽 ... 오버레이가 열려 있는 동안 계속 반복한다.
// 항목을 바꾸거나(fillDetail) 오버레이를 닫으면(closeDetailOverlay)
// stopDetailAutoCycle()로 멈추고, 새 항목을 열 때 다시 그래픽부터 시작한다.
const DETAIL_AUTO_STAGE_MS = 2200;
// 카드를 열고 처음 보이는 그래픽 면만 이 시간만 머문다. 첫 면이 2.2초를
// 꽉 채우면 뒤에 QR이 있다는 걸 모르는 사람은 그 전에 다음 항목으로
// 넘겨버린다 — 뒤집힌다는 사실을 일단 빨리 보여주고, 그 뒤로는 읽을
// 시간이 필요하니 평소 간격으로 돌아간다.
// 항목을 넘길 때도 fillDetail()을 거치므로 매 항목의 첫 면에 적용된다.
const DETAIL_FIRST_STAGE_MS = 1100;
let detailAutoTimer = null;

function stopDetailAutoCycle() {
  if (detailAutoTimer !== null) {
    clearTimeout(detailAutoTimer);
    detailAutoTimer = null;
  }
}

// delayMs를 빼면 평소 간격. 첫 전환만 호출하는 쪽에서 짧게 넘기고, 이후
// 재예약은 인자 없이 자기를 다시 부르므로 자연히 평소 간격으로 돌아간다.
function scheduleDetailAutoStage(stage, delayMs = DETAIL_AUTO_STAGE_MS) {
  detailAutoTimer = setTimeout(() => {
    showDetailStage(stage);
    scheduleDetailAutoStage(stage === 'qr' ? 'graphic' : 'qr');
  }, delayMs);
}

// resetDetailFlip()이 이미 그래픽 면으로 맞춰둔 상태에서 시작 — QR로
// 전환하는 타이머만 걸면 된다. 첫 전환만 DETAIL_FIRST_STAGE_MS로 당긴다.
function startDetailAutoCycle() {
  stopDetailAutoCycle();
  scheduleDetailAutoStage('qr', DETAIL_FIRST_STAGE_MS);
}

// itemId 하나로 오버레이 내용을 채운다 — 그래픽 오브젝트를 먼저 보여주고
// (stage='graphic'), 이름은 채우고 QR 이미지는 로드를 미리 시작해둔다
// (그래픽이 보이는 동안 백그라운드에서 받아지므로 QR로 전환될 때 지연
// 없이 바로 보인다). 열고 닫기는 안 건드림.
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
  startDetailAutoCycle(); // 그래픽 → (첫 면은 1.1초) QR → 2.2초 후 그래픽 ... 자동 반복
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
      // burst는 assignSpokeBurstDelays()가 실제 끝 시점을 담아둔다
      // (보통 SPOKE_BURST_TOTAL과 같고, 슬롯 간격이 한 프레임으로 바닥을
      // 치는 경우에만 그보다 길어진다).
      total = spokeBurstPlan.total;
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
