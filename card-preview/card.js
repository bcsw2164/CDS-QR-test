/* ============================================================
   저장 카드 미리보기 — card.js
   ------------------------------------------------------------
   archive 상세 오버레이에서 "이미지 저장"을 눌렀을 때 만들어질 한 장을,
   실제 출력 픽셀 크기 그대로 띄워 본다.

   카드를 그리는 일은 전부 shared/save-card.js 가 한다 — archive 와 똑같은
   코드를 쓰므로, 여기서 보이는 그림이 곧 폰에 저장될 그림이다. 이 파일은
   그 함수에 넘길 재료(아이템·이름·수치·QR)를 모으고, 미리보기 전용 기능
   (탭 전환 / 1:1 보기 / 내보내기 / 용량 비교)만 얹는다.

   레이아웃을 고칠 곳은 여기가 아니라 shared/save-card.js 의 L 상수다.
   ============================================================ */

// 미리볼 대상 — 1번 '정솔하'
const TARGET_ID = 1;

// archive/sketch.js 와 동일한 시드 솔트.
// 값이 같아야 아카이브 화면과 카드의 색·회전이 일치한다.
const COLOR_SEED_SALT = 819842174;
const ROTATION_SEED_SALT = 573910284;
const GROUP_ANGLE_SEED_SALT = 294817365;

let qrErrorData = []; // [{ n, errorA, errorB }] — n 오름차순, 원본 비율
let qrNames = {};
let qrImg = null;
let items = { 'radial-spokes': null, radial: null };
let currentShape = 'radial-spokes';
let previewCanvas = null;

function preload() {
  window.__raw = loadJSON('../data/qr_error_data.json');
  window.__names = loadJSON('../data/qr_name.json');
  qrImg = loadImage(`../archive/images/qr/qr_final_${String(TARGET_ID).padStart(3, '0')}.jpg`);
}

function setup() {
  // p5 캔버스는 쓰지 않는다 — 카드는 save-card.js 가 자기 캔버스에 그린다.
  // 다만 p5 인스턴스 자체는 살아 있어야 한다(createGraphics 가 필요하다).
  noCanvas();
  noLoop();

  parseErrorData(window.__raw);
  parseNames(window.__names);
  items['radial-spokes'] = buildItems('radial-spokes');
  items['radial'] = buildItems('radial');

  bindControls();

  // 웹폰트(Wanted Sans)가 올라오기 전에 그리면 대체 폰트로 한 번 찍힌다.
  renderPreview();
  document.fonts.ready.then(renderPreview);
}

// ── 데이터 ──────────────────────────────────────────────────

function parseErrorData(obj) {
  qrErrorData = Object.entries(obj)
    .map(([key, row]) => {
      const m = String(key).match(/(\d+)$/);
      if (!m) return null;
      return { n: Number(m[1]), errorA: row.unfilledRate, errorB: row.overflowRate };
    })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n);
}

function parseNames(list) {
  Object.values(list).forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const m = String(row.qr_nnn || '').match(/(\d+)$/);
    if (!m) return;
    if (row['이름']) qrNames[Number(m[1])] = row['이름'];
  });
}

// archive/sketch.js 의 normalizeErrorAxis 와 동일 — 값의 절대 크기가 아니라
// 184개 중 몇 번째인지(퍼센타일)로 0~1에 고르게 편다. 동점은 평균 순위.
function normalizeErrorAxis(values) {
  const n = values.length;
  if (n <= 1) return values.map(() => 0);
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const ranks = new Array(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && values[order[j + 1]] === values[order[i]]) j++;
    const avgRank = (i + j) / 2;
    for (let k = i; k <= j; k++) ranks[order[k]] = avgRank;
    i = j + 1;
  }
  return ranks.map((r) => r / (n - 1));
}

// archive/sketch.js 의 generateFlowerItems + generateRadialItems /
// generateSpokeItems 를 합친 것. 탭에 따라 필요한 색만 더해 준다.
function buildItems(shape) {
  const normA = normalizeErrorAxis(qrErrorData.map((d) => d.errorA));
  const normB = normalizeErrorAxis(qrErrorData.map((d) => d.errorB));

  return qrErrorData.map((d, i) => {
    const item = {
      id: d.n,
      errorA: normA[i],
      errorB: normB[i],
      rotation: makeRadialSpokeRng(d.n + ROTATION_SEED_SALT)() * TWO_PI,
    };

    if (shape === 'radial-spokes') {
      item.colorSeed = item.id + COLOR_SEED_SALT;
      return item;
    }

    const rnd = makeRadialSpokeRng(item.id + COLOR_SEED_SALT);
    const { lineColor, dotColor } = pickRadialColors(rnd);
    item.lineColor = lineColor;
    item.dotColor = dotColor;
    const tipOptions = RADIAL_COLOR_PALETTE.filter((c) => c !== lineColor && c !== dotColor);
    item.tipColor = tipOptions[Math.floor(rnd() * tipOptions.length)];
    const angleRnd = makeRadialSpokeRng(item.id + GROUP_ANGLE_SEED_SALT);
    item.lineAngleOffset = angleRnd() * TWO_PI;
    item.dotAngleOffset = angleRnd() * TWO_PI;
    return item;
  });
}

// ── 미리보기 렌더 ───────────────────────────────────────────

// save-card.js 에 넘길 재료 한 벌. width / canvas 만 상황에 따라 덧붙인다.
function cardOptions() {
  const raw = qrErrorData.find((d) => d.n === TARGET_ID);
  return {
    id: TARGET_ID,
    name: qrNames[TARGET_ID] || '익명',
    shape: currentShape,
    item: items[currentShape].find((it) => it.id === TARGET_ID),
    unfilled: raw.errorA,
    overflow: raw.errorB,
    qrSource: qrImg,
    qrKey: `qr-${TARGET_ID}`,
  };
}

function renderPreview() {
  previewCanvas = SaveCard.render({ ...cardOptions(), canvas: previewCanvas });
  if (!previewCanvas.parentNode) document.getElementById('stage').appendChild(previewCanvas);
  document.getElementById('meta').textContent =
    `${previewCanvas.width} × ${previewCanvas.height}px`;
}

// ── 미리보기 컨트롤 ─────────────────────────────────────────

function bindControls() {
  document.querySelectorAll('#controls button[data-shape]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentShape = btn.dataset.shape;
      document
        .querySelectorAll('#controls button[data-shape]')
        .forEach((b) => b.classList.toggle('on', b === btn));
      renderPreview();
    });
  });

  const stage = document.getElementById('stage');
  const zoomBtn = document.getElementById('zoom-toggle');
  zoomBtn.addEventListener('click', () => {
    const actual = stage.classList.toggle('actual');
    zoomBtn.textContent = actual ? '화면에 맞추기' : '1:1 보기';
    zoomBtn.classList.toggle('on', actual);
  });

  document.getElementById('export-jpg').addEventListener('click', () => {
    const shape = currentShape === 'radial' ? 'bloom' : 'burst';
    SaveCard.download(previewCanvas, `QR++_${TARGET_ID}_${shape}.jpg`);
    previewCanvas.toBlob(
      (blob) => {
        document.getElementById('meta').textContent =
          `${previewCanvas.width} × ${previewCanvas.height}px · ${Math.round(blob.size / 1024)}KB`;
      },
      'image/jpeg',
      SaveCard.QUALITY
    );
  });

  document.getElementById('measure').addEventListener('click', measureSizes);
}

// ── 용량 비교 ───────────────────────────────────────────────
//
// 폭과 품질을 바꿔가며 실제로 인코딩해 보고 용량만 재서 표로 보여준다.
// 추정값으로 고르면 틀리기 쉬워서, 고를 때 쓰는 자를 하나 둔 것이다.
// 재는 동안 그 폭으로 카드를 실제로 다시 그리므로(= 내보낼 때와 같은 경로)
// 표의 숫자가 곧 받게 될 파일 크기다.

const MEASURE_WIDTHS = [810, 1080, 1350, 1620];
const MEASURE_QUALITIES = [0.8, 0.85, 0.9, 0.95];

function blobSize(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(Math.round(b.size / 1024)), type, quality);
  });
}

async function measureSizes() {
  const btn = document.getElementById('measure');
  const panel = document.getElementById('report');
  btn.disabled = true;
  panel.textContent = '측정 중...';

  const scratch = document.createElement('canvas');
  const rows = [];

  for (const width of MEASURE_WIDTHS) {
    SaveCard.render({ ...cardOptions(), width, canvas: scratch });
    const cells = [];
    for (const q of MEASURE_QUALITIES) {
      cells.push(await blobSize(scratch, 'image/jpeg', q));
    }
    rows.push({
      label: `${scratch.width}×${scratch.height}`,
      cells,
      png: await blobSize(scratch, 'image/png'),
    });
  }

  panel.innerHTML = [
    `<div class="r head"><span>크기</span>${MEASURE_QUALITIES.map(
      (q) => `<span>q${q}</span>`
    ).join('')}<span>PNG</span></div>`,
    ...rows.map(
      (r) =>
        `<div class="r"><span>${r.label}</span>${r.cells
          .map((c) => `<span>${c}KB</span>`)
          .join('')}<span>${r.png}KB</span></div>`
    ),
    `<div class="note">현재 설정: ${SaveCard.OUT_WIDTH}px · q${SaveCard.QUALITY}</div>`,
  ].join('');
  btn.disabled = false;
}
