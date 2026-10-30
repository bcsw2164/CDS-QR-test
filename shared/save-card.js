/* 저장 카드 — 상세 오버레이의 "저장하기"가 만드는 한 장을 합성한다.
   archive 페이지와 card-preview 미리보기가 이 파일 하나를 함께 쓴다.

   [주의] 아래 L 상수의 좌표는 전부 card-preview/reference/share-img.svg
   (일러스트레이터 가이드)에서 읽어온 값이다. 디자인을 고칠 때는 그 SVG를 다시
   내보내고 여기 숫자만 맞춘다 — 그리는 코드는 손대지 않는다.

   그리기는 p5가 아니라 캔버스 2D API다(p5에는 font-weight·자간이 없다).
   그래픽만 예외 — core.js가 p5 버퍼에 그린 뒤 그 결과를 이미지로 얹는다.
   전역 SaveCard 하나만 노출한다. 자세한 내용은 docs/shared.md 참고. */

(function (global) {
  'use strict';

  // ── 레이아웃 (reference/share-img.svg 에서 추출) ───────────
  // 좌표는 가이드 아트보드(1080 × 1920) 기준 절대값. 실제로 뽑는 이미지는 카드
  // 테두리까지만 잘라낸 것이라, 그리기 직전에 원점을 카드 왼쪽 위로 옮긴다.
  const L = {
    pageBg: '#ffffff', // 카드 바깥(테두리 선이 닿는 가장자리)
    ink: '#231f20', // 글자색 (SVG의 .cls-1 / .cls-2)
    dim: '#848484', // 보조 글자색 (SVG의 .cls-4) — 현재 쓰는 곳 없음
    stroke: '#000000',
    line: 8, // 테두리·구분선 공통 두께

    card: { x: 134.92, y: 295.95, w: 809.52, h: 1328.1, fill: '#ffffff' },
    box: { x: 189.46, y: 419.93, s: 700.45, fill: '#ffffff' },
    graphic: { x: 206.86, y: 437.34, s: 665.64 },

    // 그래픽을 영역 대비 얼마로 그릴지. archive 상세 박스와 같은 비율 —
    // burst는 끝점 원이 밖으로 나가지 않도록, bloom은 더 넓게 퍼져서 더 줄인다.
    graphicRatio: { 'radial-spokes': 0.94, radial: 0.85 },

    cornerSize: 34.82, // 코너 마커 한 변 (중심이 박스 모서리에 걸친다)

    headerBaseline: 378.83,
    headerSize: 46.58,
    headerTracking: -0.025, // em. 일러 자간 -25
    noX: 189.46, // 번호 왼쪽 기준 (박스 왼쪽 변과 같은 선)
    nameRightX: 889.91, // 이름 오른쪽 기준 (박스 오른쪽 변과 같은 선)

    qr: { x: 189.46, y: 1168.33, s: 278.37 },

    /* QR 옆 설명 블록. 크기를 한 종(=위계는 색이 아니라 자리와 문장 구조가 맡는다)
       으로 줄이고, textSize 는 바라는 값일 뿐 drawQrBlock 이 실제 폭을 재서 넘칠
       때만 비례로 줄인다(폰트 폴백·세 자리 수치에 추정치가 틀어진다).
       baseline 도 숫자로 박지 않고 QR 세로 중심에 맞춰 구한다. 근거는 docs/shared.md. */
    textX: 499.4821,
    textSize: 38, // 바라는 크기. 넘치면 drawQrBlock 이 재서 줄인다
    textLeadRatio: 1.5, // 행간 ÷ 글자 크기. 예전 1.20 은 한글에 너무 빡빡했다
    textLabelGapRatio: 0.75, // 라벨 다음에만 더 벌려 문단처럼 끊는다

    dividerY: 1495.54,
    dividerX1: 179.23,
    dividerX2: 900.14,
  };

  // 로고 'QR++' — 가이드 SVG 의 도형을 패스 문법 그대로 옮긴 것(Path2D가 그대로
  // 받으므로 좌표를 다시 계산할 필요가 없다). About 네비 로고와 같은 패스다.
  const LOGO_PATHS = [
    'M557.71 1533.81L557.71 1564.82L547.38 1564.82L547.38 1575.16L557.71 1575.16L557.71 1585.5L537.04 1585.5L537.04 1564.82L526.7 1564.82L526.7 1554.48L547.38 1554.48L547.38 1544.15L516.36 1544.15L516.36 1585.5L506.02 1585.5L506.02 1533.81Z',
    'M450.42,1533.81v51.69h41.35v-10.34h10.34v-41.35h-51.69ZM491.76,1564.82h-10.34v10.34h-20.67v-31.01h31.01v20.68Z',
    'M593.5 1544.15L593.5 1554.48L583.16 1554.48L583.16 1564.82L572.82 1564.82L572.82 1554.48L562.49 1554.48L562.49 1544.15L572.82 1544.15L572.82 1533.81L583.16 1533.81L583.16 1544.15Z',
    'M628.95 1544.15L628.95 1554.48L618.61 1554.48L618.61 1564.82L608.27 1564.82L608.27 1554.48L597.94 1554.48L597.94 1544.15L608.27 1544.15L608.27 1533.81L618.61 1533.81L618.61 1544.15Z',
  ];

  const FONT_STACK = "'Wanted Sans Variable', 'Wanted Sans', sans-serif";
  const FONT_WEIGHT = 800; // ExtraBold

  // 1080 — 인스타가 업로드본을 리사이즈하는 폭. 더 키우면 용량만 늘고, 여기 맞춰
  // 두면 재압축이 한 번 덜 일어나 화질도 오히려 낫다.
  const OUT_WIDTH = 1080;

  // 손으로 그린 QR과 글자는 고주파라 품질을 낮추면 경계에 얼룩이 먼저 생긴다.
  // 용량을 더 줄여야 한다면 품질보다 폭(width 인자)을 먼저 건드린다.
  const QUALITY = 0.9;

  const outSize = (width) => {
    const scale = width / (L.card.w + L.line);
    return {
      scale,
      w: Math.round((L.card.w + L.line) * scale),
      h: Math.round((L.card.h + L.line) * scale),
    };
  };

  // ── QR 여백 잘라내기 ──────────────────────────────────────
  // QR 원본은 가장자리 흰 여백이 장마다 4.5~7%로 달라서, 고정값으로 자르면 어떤
  // 장은 여백이 남고 어떤 장은 코드가 잘린다. 검은 픽셀의 경계를 직접 재서 쓴다.
  // 한 장에 100만 픽셀을 훑으므로 경로별로 결과를 기억해 둔다.
  const TRIM_THRESHOLD = 128; // 이 밝기 미만을 '그린 자국'으로 본다
  const trimCache = new Map();

  function sourceCanvas(src) {
    if (src.canvas) return src.canvas; // p5.Image
    if (src.getContext) return src; // 이미 canvas
    const c = document.createElement('canvas');
    c.width = src.naturalWidth || src.width;
    c.height = src.naturalHeight || src.height;
    c.getContext('2d').drawImage(src, 0, 0);
    return c;
  }

  // 긴 쪽에 맞춰 정사각으로 넓히고 중심을 유지한다 — 한쪽 변만 맞추면 코드가 찌그러진다.
  function trimQr(src, cacheKey) {
    if (cacheKey && trimCache.has(cacheKey)) return trimCache.get(cacheKey);

    const c = sourceCanvas(src);
    const w = c.width;
    const h = c.height;
    const data = c.getContext('2d').getImageData(0, 0, w, h).data;

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if ((data[i] + data[i + 1] + data[i + 2]) / 3 >= TRIM_THRESHOLD) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    let crop;
    if (maxX < 0) {
      crop = { sx: 0, sy: 0, s: w }; // 전부 흰 이미지 — 통째로 쓴다
    } else {
      const s = Math.max(maxX - minX, maxY - minY) + 1;
      crop = { sx: (minX + maxX) / 2 - s / 2, sy: (minY + maxY) / 2 - s / 2, s };
    }
    if (cacheKey) trimCache.set(cacheKey, crop);
    return crop;
  }

  // ── 도형 ──────────────────────────────────────────────────

  function fillRect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function strokeRect(ctx, x, y, w, h, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = L.line;
    ctx.strokeRect(x, y, w, h);
  }

  function strokeLine(ctx, x1, y1, x2, y2, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = L.line;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // ── 글자 ──────────────────────────────────────────────────
  // 자간은 글자를 하나씩 끊어 그리며 사이마다 더해 준다(ctx.letterSpacing은
  // 브라우저 지원이 갈려서 쓰지 않는다).

  function setFont(ctx, size) {
    ctx.font = `${FONT_WEIGHT} ${size}px ${FONT_STACK}`;
  }

  function trackedWidth(ctx, str, size) {
    setFont(ctx, size);
    const t = size * L.headerTracking;
    let w = 0;
    for (const ch of str) w += ctx.measureText(ch).width + t;
    return w - t; // 마지막 글자 뒤의 자간은 빼준다
  }

  // 끝 x 를 돌려준다 — drawRuns 가 다음 조각을 이어 붙이는 데 쓴다.
  function drawTracked(ctx, str, x, baselineY, size, color) {
    setFont(ctx, size);
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    const t = size * L.headerTracking;
    let cx = x;
    for (const ch of str) {
      ctx.fillText(ch, cx, baselineY);
      cx += ctx.measureText(ch).width + t;
    }
    return cx;
  }

  /* 한 줄 안에서 색만 바꿔 이어 쓴다 — drawTracked 가 마지막 자간까지 더한 x 를
     주므로 조각 경계의 간격이 글자 사이 간격과 같게 유지된다. */
  function drawRuns(ctx, runs, x, baselineY, size) {
    let cx = x;
    for (const r of runs) cx = drawTracked(ctx, r.t, cx, baselineY, size, r.color);
    return cx;
  }

  function drawTrackedRight(ctx, str, rightX, baselineY, size, color) {
    drawTracked(ctx, str, rightX - trackedWidth(ctx, str, size), baselineY, size, color);
  }

  // ── 조각들 ────────────────────────────────────────────────

  function drawCardBody(ctx) {
    fillRect(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.card.fill);
    strokeRect(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.stroke);
  }

  // 좌: NO.n  우: 이름 — 둘 다 그래픽 박스의 좌우 변에 맞춘다. 가이드 SVG 의 이름
  // 시작 x 는 6글자 기준이라, 길이가 바뀌면 끝이 흐트러진다(오른쪽 끝을 고정한다).
  // 번호는 자릿수를 채우지 않는다.
  function drawHeader(ctx, id, name) {
    drawTracked(ctx, `NO.${id}`, L.noX, L.headerBaseline, L.headerSize, L.ink);
    drawTrackedRight(ctx, name, L.nameRightX, L.headerBaseline, L.headerSize, L.ink);
  }

  function drawGraphicBox(ctx, item, shape) {
    fillRect(ctx, L.box.x, L.box.y, L.box.s, L.box.s, L.box.fill);

    // 그래픽은 p5 버퍼에 그려서 얹는다 — core.js 가 버퍼 하나를 통째로 쓰는
    // 좌표계를 전제하기 때문.
    const s = L.graphic.s;
    const g = global.createGraphics(s, s);
    g.pixelDensity(1);
    g.colorMode(global.HSB, 360, 100, 100);
    g.clear();
    drawItemInto(g, item, s / 2, s / 2, s * L.graphicRatio[shape], shape);
    ctx.drawImage(g.canvas, L.graphic.x, L.graphic.y, s, s);
    g.remove();

    // 테두리는 그래픽 위에 — 가장자리에 닿아도 선이 묻히지 않는다.
    strokeRect(ctx, L.box.x, L.box.y, L.box.s, L.box.s, L.stroke);

    const h = L.cornerSize / 2;
    [
      [L.box.x, L.box.y],
      [L.box.x + L.box.s, L.box.y],
      [L.box.x, L.box.y + L.box.s],
      [L.box.x + L.box.s, L.box.y + L.box.s],
    ].forEach(([cx, cy]) => {
      fillRect(ctx, cx - h, cy - h, L.cornerSize, L.cornerSize, L.card.fill);
      strokeRect(ctx, cx - h, cy - h, L.cornerSize, L.cornerSize, L.stroke);
    });
  }

  // archive/sketch.js 의 drawItem 과 같은 일. 등장 애니메이션 없이 항상 제 크기로.
  function drawItemInto(g, item, cx, cy, size, shape) {
    g.push();
    g.translate(cx, cy);
    g.rotate(item.rotation || 0);
    if (shape === 'radial-spokes') {
      global.drawRadialSpokeDots(
        g, 0, 0, size, item.errorA, item.errorB, item.colorSeed, 1, 1, false
      );
    } else {
      global.drawRadialBurstFlowerDev(
        g, 0, 0, size, item.errorA, item.errorB,
        item.lineColor, item.dotColor, item.tipColor, true,
        item.lineAngleOffset || 0, item.dotAngleOffset || 0, 1, 1
      );
    }
    g.pop();
  }

  // 왼쪽에 QR, 오른쪽에 분석 결과.
  //
  // 두 수치는 분모가 다르다 — unfilled 는 원본의 검은 영역, overflow 는 흰 영역
  // 기준이고 그 둘은 27 : 73 이다. 숫자만 나란히 두면 큰 쪽이 더 많이 틀린 것처럼
  // 읽히므로, 분모를 문장에 박아 넣는다.
  //
  // 색은 전부 ink 한 색이다(위계는 자리와 문장 구조가 맡는다). 조각(runs) 구조는
  // 다시 숫자만 강조하고 싶어질 때를 위해 남겨 뒀다 — 그 조각의 color 만 바꾸면 된다.
  function drawQrBlock(ctx, qrSource, crop, unfilled, overflow) {
    ctx.drawImage(
      sourceCanvas(qrSource),
      crop.sx, crop.sy, crop.s, crop.s,
      L.qr.x, L.qr.y, L.qr.s, L.qr.s
    );

    const pct = (v) => Math.round(v * 100);

    /* [문구 주의] 조사는 '셀은' 이어야 한다 — qr_error_data.json 의 값은 셀 개수가
       아니라 면적 비율이라, '검은 셀 23%는' 으로 적으면 개수 이야기로 읽힌다.
       어조를 바꾼 이유와 '셀/모듈' 용어 선택은 docs/shared.md 참고. */
    const lines = [
      [{ t: '원본과 비교한 결과', color: L.ink }],
      [
        { t: '검은 셀은 ', color: L.ink },
        { t: `${pct(unfilled)}%`, color: L.ink },
        { t: ' 비었고', color: L.ink },
      ],
      [
        { t: '흰 셀은 ', color: L.ink },
        { t: `${pct(overflow)}%`, color: L.ink },
        { t: ' 번졌습니다', color: L.ink },
      ],
    ];

    /* 가장 긴 줄을 실제로 재서 글줄 폭에 맞춘다(자간이 일정해 이어 붙여 재도 같다) */
    const maxW = L.nameRightX - L.textX;
    const widest = Math.max(
      ...lines.map((runs) => trackedWidth(ctx, runs.map((r) => r.t).join(''), L.textSize))
    );
    const size = widest > maxW ? L.textSize * (maxW / widest) : L.textSize;

    const lead = size * L.textLeadRatio;
    const labelGap = size * L.textLabelGapRatio;
    // 라벨 다음에만 labelGap 을 끼운다.
    const offsets = lines.map((_, i) => (i === 0 ? 0 : labelGap + lead * i));

    /* QR 세로 중심에 맞춘다. 글자 높이(캡 높이 + 디센더)는 폰트에서 재 오면
       폴백 환경에서 흔들리므로 흔한 비율을 상수로 쓴다 — 중심만 잡는 용도다. */
    const capH = size * 0.72;
    const blockH = capH + offsets[offsets.length - 1] + size * 0.21;
    const firstBaseline = L.qr.y + (L.qr.s - blockH) / 2 + capH;

    lines.forEach((runs, i) => {
      drawRuns(ctx, runs, L.textX, firstBaseline + offsets[i], size);
    });
  }

  function drawFooter(ctx) {
    strokeLine(ctx, L.dividerX1, L.dividerY, L.dividerX2, L.dividerY, L.stroke);
    ctx.fillStyle = L.ink;
    LOGO_PATHS.forEach((d) => ctx.fill(new Path2D(d), 'evenodd'));
  }

  // ── 합성 ──────────────────────────────────────────────────
  // opts = {
  //   id, name, shape,         // 'radial-spokes' | 'radial'
  //   item,                    // archive 의 아이템 (정규화된 errorA/errorB + 색)
  //   unfilled, overflow,      // 원본 비율 0~1 (정규화 전 값)
  //   qrSource,                // <img> | <canvas> | p5.Image
  //   qrKey,                   // 여백 측정 결과를 기억해 둘 키(보통 이미지 경로)
  //   width,                   // 출력 가로 픽셀 (기본 OUT_WIDTH)
  //   canvas                   // 재사용할 캔버스(없으면 새로 만든다)
  // }
  function render(opts) {
    const { scale, w, h } = outSize(opts.width || OUT_WIDTH);
    const canvas = opts.canvas || document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');

    // 변환 없는 상태에서 캔버스 전체를 칠한다 — JPEG 는 투명을 담지 못한다.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fillRect(ctx, 0, 0, w, h, L.pageBg);

    // 이후 좌표는 모두 가이드 기준 — 원점을 카드 왼쪽 위로 옮기고 배율만 건다.
    ctx.setTransform(
      scale, 0, 0, scale,
      (L.line / 2 - L.card.x) * scale,
      (L.line / 2 - L.card.y) * scale
    );

    // 선 끝과 모서리를 각지게 — p5 가 둥근 끝으로 바꿔 둘 수 있어 매번 명시한다.
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';

    drawCardBody(ctx);
    drawHeader(ctx, opts.id, opts.name || '익명');
    drawGraphicBox(ctx, opts.item, opts.shape);
    drawQrBlock(
      ctx,
      opts.qrSource,
      trimQr(opts.qrSource, opts.qrKey),
      opts.unfilled,
      opts.overflow
    );
    drawFooter(ctx);

    return canvas;
  }

  // ── 내보내기 ──────────────────────────────────────────────

  // [주의] toBlob 이 아니라 toDataURL 이어야 한다 — iOS Safari 의 navigator.share 는
  // 사용자가 누른 그 순간에 호출되어야 하고, toBlob 은 콜백으로 넘어가며 그 순간을
  // 놓쳐 공유가 거부된다.
  function toFile(canvas, filename, quality) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality || QUALITY);
    const bin = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: 'image/jpeg' });
  }

  // 갈림길은 '모바일인가'가 아니라 'iOS 인가'다 — iOS 만 갤러리로 가는 길이 공유
  // 시트뿐이고, 안드로이드·PC 는 내려받기가 맞다. 근거는 docs/shared.md 참고.
  function isIOS() {
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return true;
    // iPadOS 13+ 는 데스크탑 맥과 같은 UA 를 쓴다 — 터치 지점 수로 가린다.
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  // iOS 면 공유 시트, 그 밖에는 바로 내려받기.
  // 반환값은 'shared' | 'downloaded' | 'cancelled'.
  function save(canvas, filename) {
    if (isIOS()) {
      const file = toFile(canvas, filename);
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator
          .share({ files: [file] })
          .then(() => 'shared')
          .catch((err) => {
            if (err && err.name === 'AbortError') return 'cancelled';
            download(canvas, filename); // 공유가 막힌 환경 — 내려받기로 돌린다
            return 'downloaded';
          });
      }
    }

    download(canvas, filename);
    return Promise.resolve('downloaded');
  }

  // 여기서는 사용자 제스처를 유지할 필요가 없다. data: URL 은 1MB 를 넘으면
  // 브라우저가 거부하거나 파일명을 잃어서, 크기 제한이 없는 Blob URL 로 내려받는다.
  function download(canvas, filename) {
    canvas.toBlob(
      (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // 내려받기가 시작되기 전에 거두면 빈 파일이 된다 — 한 박자 둔다.
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      },
      'image/jpeg',
      QUALITY
    );
  }

  global.SaveCard = {
    render,
    save,
    download,
    toFile,
    layout: L,
    OUT_WIDTH,
    QUALITY,
    outSize,
  };
})(window);
