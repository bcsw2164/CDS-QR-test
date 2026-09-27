/* ============================================================
   Credit — script.js
   ------------------------------------------------------------
   qr_name.json의 이름을 순서대로 나열하고, 그 뒤쪽 레이어에
   현장 사진(images/onsite/NN.jpg)을 듬성듬성 흑백으로 깔아둔다.

   사진 추가 방법:
     images/onsite/01.jpg, 02.jpg, ... 형식으로 번호를 이어 저장하고
     아래 PHOTO_COUNT를 사진 장수에 맞게 올리면 된다.
   ============================================================ */

const PHOTO_COUNT = 21;
const NAME_JSON = '../qr_name.json';

function pad2(n) {
  return String(n).padStart(2, '0');
}

/* 고정 시드 난수(mulberry32). 새로고침해도 사진 배치가 그대로 유지돼서
   "매번 달라 보이는" 산만함 없이 의도한 레이아웃을 재현한다. */
function makeRandom(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function renderNames(names) {
  const holder = document.getElementById('credit-names');
  const frag = document.createDocumentFragment();

  // 그리드의 한 칸 = 한 사람. 줄 간격은 CSS의 --credit-gap이 결정한다.
  names.forEach((name) => {
    const item = document.createElement('span');
    item.className = 'credit-name';
    item.textContent = name;
    frag.appendChild(item);
  });

  holder.appendChild(frag);
}

/* 그래픽 크기의 기준 단위 — 메인페이지 sketch.js의 viewportUnit()과 같은 방식.
   폭만 쓰면 아이패드 가로처럼 납작한 화면에서 사진이 과하게 부풀고, 반대로
   아이폰 세로처럼 좁은 화면에서는 작은 등급이 손톱만 해진다. 높이에 1.2를
   곱한 값과 견줘 작은 쪽을 쓰면 두 경우 모두 기준이 안정된다. */
function viewportUnit() {
  return Math.min(window.innerWidth, window.innerHeight * 1.2);
}

/* [minPx, 배수, maxPx] — 기준 단위에 비례하되 양끝을 잠근다.
   좁은 화면에서는 minPx가 바닥을, 넓은 화면에서는 maxPx가 천장을 잡아주므로
   화면 폭 대비 비율(%)로 두던 이전 방식과 달리 기기별 체감 크기가 비슷해진다. */
function resolveSize([minPx, factor, maxPx]) {
  return Math.round(Math.max(minPx, Math.min(maxPx, viewportUnit() * factor)));
}

/* 사진 크기 등급 — 메인페이지 스포크 그래픽처럼 대·중·소 차이를 확실하게 둔다.
     size  : [minPx, 배수, maxPx]
     jitter: 같은 등급끼리도 조금씩 달라 보이게 하는 흔들림 폭(±비율)
     bleed : 화면 밖으로 삐져나가는 양(자기 폭 대비 비율). 0이면 안쪽에만 놓인다.
             #photo-layer가 overflow: hidden이라 삐져나간 부분은 잘려 보인다.

   아이폰 14 세로(기준 390) / 아이패드 프로 13 가로(기준 1229) 기준 실제 폭:
     소   140 / 280      중   226 / 460
     대   332 / 700      특대 449 / 950 */
const PHOTO_TIERS = {
  s:  { size: [130, 0.36, 280], jitter: 0.1,  bleed: [0, 0] },
  m:  { size: [210, 0.58, 460], jitter: 0.12, bleed: [0, 0.08] },
  l:  { size: [320, 0.85, 700], jitter: 0.12, bleed: [0.05, 0.25] },
  xl: { size: [430, 1.15, 950], jitter: 0.1,  bleed: [0.18, 0.4] },
};

const TIER_PATTERN = ['l', 's', 'xl', 'm', 's', 'l', 'm', 'xl', 's', 'm', 'l', 's'];

/* 사진을 이름 흐름의 뒤쪽에 뿌린다.
   - 세로: 전체 높이를 사진 장수만큼의 구간으로 나누고 각 구간 안에서만
     흔들어서, 한쪽에 몰리지 않고 "듬성듬성" 간격이 유지되게 한다.
     큰 등급은 구간보다 커서 이름과 겹치는데, 그건 의도한 것이다.
   - 가로: 좌/우를 번갈아 배치해 지그재그로 읽히게 한다. 큰 등급은
     bleed만큼 가장자리 밖으로 밀어내 화면에서 잘리게 한다. */
function layoutPhotos() {
  const layer = document.getElementById('photo-layer');
  const stage = document.getElementById('credit-stage');
  const rand = makeRandom(20240917);

  layer.innerHTML = '';

  const stageH = stage.offsetHeight;
  const stageW = stage.offsetWidth;
  const band = stageH / PHOTO_COUNT;

  for (let i = 1; i <= PHOTO_COUNT; i++) {
    const cell = document.createElement('div');
    cell.className = 'photo-cell';

    const tier = PHOTO_TIERS[TIER_PATTERN[(i - 1) % TIER_PATTERN.length]];
    const jitter = 1 + (rand() - 0.5) * tier.jitter;
    // 사진 폭은 px. 단, 무대보다 넓어지면 답답해지므로 무대 폭의 96%로 제한.
    const width = Math.min(Math.round(resolveSize(tier.size) * jitter), stageW * 0.96);
    const bleedRatio = tier.bleed[0] + rand() * (tier.bleed[1] - tier.bleed[0]);

    // 구간 내부에서 위아래로 흔들어 같은 간격으로 늘어선 느낌을 깬다.
    const top = band * (i - 1) + band * (0.15 + rand() * 0.35);
    // 좌우 번갈아. bleed가 0보다 크면 inset이 음수가 되어 화면 밖으로 나간다.
    const side = i % 2 === 0 ? 'right' : 'left';
    const inset = bleedRatio > 0
      ? -Math.round(width * bleedRatio)
      : Math.round(stageW * (0.02 + rand() * 0.08));

    cell.style.top = `${top}px`;
    cell.style[side] = `${inset}px`;
    cell.style.width = `${width}px`;

    const img = document.createElement('img');
    img.src = `images/onsite/${pad2(i)}.jpg`;
    img.alt = '';
    img.loading = 'lazy';

    cell.appendChild(img);
    layer.appendChild(cell);
  }
}

async function init() {
  try {
    const res = await fetch(NAME_JSON);
    const data = await res.json();
    const names = data.map((row) => row['이름']).filter(Boolean);

    renderNames(names);
  } catch (err) {
    console.error('이름 데이터를 불러오지 못했습니다.', err);
  }

  // 이름이 배치된 뒤의 실제 높이를 기준으로 사진을 뿌린다.
  layoutPhotos();

  // 창 폭이 바뀌면 이름 줄바꿈이 달라져 전체 높이도 달라지므로 다시 계산.
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(layoutPhotos, 150);
  });
}

init();
