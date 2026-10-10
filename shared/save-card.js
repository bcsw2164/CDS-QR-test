/* ============================================================
   저장 카드 — save-card.js
   ------------------------------------------------------------
   상세 오버레이에서 "이미지 저장"을 눌렀을 때 만들어지는 한 장의
   이미지를 합성한다. archive 페이지와 card-preview 미리보기가 이
   파일 하나를 함께 쓴다 — 레이아웃을 고칠 곳을 한 군데로 묶어 두기
   위해서다.

   [레이아웃의 출처]
   아래 L 상수의 좌표는 전부 card-preview/reference/share-img.svg
   (일러스트레이터 가이드)에서 그대로 읽어온 값이다. 디자인을 고칠 때는
   그 SVG를 다시 내보내고 여기 숫자만 맞추면 되고, 그리는 코드는 손대지
   않는다.

   [그래픽은 왜 이미지가 아니라 코드로 그리나]
   184개가 전부 다른 모양이라 미리 그려 둘 수 없다. core.js의 그리기
   함수가 id 기반 고정 시드를 쓰므로, 같은 번호는 아카이브 화면과 이
   카드에서 항상 같은 모양·같은 색으로 나온다.

   [왜 p5 대신 캔버스 2D API 를 쓰나]
   글자에 font-weight 800 과 자간(-25)이 필요한데 p5 에는 둘 다 없다.
   색도 p5 를 거치면 흰색이 검게 나오는 일이 있어서, 그리기를 전부 2D
   API 한 가지로 통일했다. 그래픽만 예외 — core.js 가 p5 버퍼에 그린
   뒤 그 결과를 이미지로 얹는다.

   전역 SaveCard 하나만 노출한다.
   ============================================================ */

(function (global) {
  'use strict';

  // ── 레이아웃 (reference/share-img.svg 에서 추출) ───────────
  // 좌표는 전부 가이드 아트보드(1080 × 1920) 기준 절대값이다. 실제로 뽑는
  // 이미지는 그 전체가 아니라 카드 테두리까지만 잘라낸 것이라(OUT 참고),
  // 그리기 직전에 원점을 카드 왼쪽 위로 옮긴다.
  const L = {
    pageBg: '#ffffff', // 카드 바깥(테두리 선이 닿는 가장자리)
    ink: '#231f20', // 글자색 (SVG의 .cls-1 / .cls-2)
    dim: '#848484', // 보조 글자색 (SVG의 .cls-4)
    stroke: '#000000',
    line: 8, // 테두리·구분선 공통 두께

    card: { x: 134.92, y: 295.95, w: 809.52, h: 1328.1, fill: '#ffffff' },
    box: { x: 189.46, y: 419.93, s: 700.45, fill: '#ffffff' },
    graphic: { x: 206.86, y: 437.34, s: 665.64 },

    // 그래픽을 영역 대비 얼마로 그릴지. archive 상세 박스와 같은 비율 —
    // burst는 끝점 원이 영역 밖으로 나가지 않도록 살짝 줄이고, bloom은
    // 형태가 더 넓게 퍼져서 더 줄인다.
    graphicRatio: { 'radial-spokes': 0.94, radial: 0.85 },

    cornerSize: 34.82, // 코너 마커 한 변 (중심이 박스 모서리에 걸친다)

    headerBaseline: 378.83,
    headerSize: 46.58,
    headerTracking: -0.025, // em. 일러 자간 -25
    noX: 189.46, // 번호 왼쪽 기준 (박스 왼쪽 변과 같은 선)
    nameRightX: 889.91, // 이름 오른쪽 기준 (박스 오른쪽 변과 같은 선)

    qr: { x: 189.46, y: 1168.33, s: 278.37 },

    textX: 499.4821,
    textBaseline: 1209.8008,
    textLead: 55.9,
    textSize: 46.58,
    textLabelSize: 32, // 첫 줄(라벨)만 작게 — 나머지는 textSize

    dividerY: 1495.54,
    dividerX1: 179.23,
    dividerX2: 900.14,
  };

  // 로고 'QR++' — 가이드 SVG 의 <g> 안 도형을 패스 문법 그대로 옮긴 것.
  // polygon 은 points 를 M/L/Z 로 바꿔 적었다. Path2D 가 이 문법을 그대로
  // 받으므로 좌표를 다시 계산할 필요가 없다.
  const LOGO_PATHS = [
    'M557.71 1533.81L557.71 1564.82L547.38 1564.82L547.38 1575.16L557.71 1575.16L557.71 1585.5L537.04 1585.5L537.04 1564.82L526.7 1564.82L526.7 1554.48L547.38 1554.48L547.38 1544.15L516.36 1544.15L516.36 1585.5L506.02 1585.5L506.02 1533.81Z',
    'M450.42,1533.81v51.69h41.35v-10.34h10.34v-41.35h-51.69ZM491.76,1564.82h-10.34v10.34h-20.67v-31.01h31.01v20.68Z',
    'M593.5 1544.15L593.5 1554.48L583.16 1554.48L583.16 1564.82L572.82 1564.82L572.82 1554.48L562.49 1554.48L562.49 1544.15L572.82 1544.15L572.82 1533.81L583.16 1533.81L583.16 1544.15Z',
    'M628.95 1544.15L628.95 1554.48L618.61 1554.48L618.61 1564.82L608.27 1564.82L608.27 1554.48L597.94 1554.48L597.94 1544.15L608.27 1544.15L608.27 1533.81L618.61 1533.81L618.61 1544.15Z',
  ];

  const FONT_STACK = "'Wanted Sans Variable', 'Wanted Sans', sans-serif";
  const FONT_WEIGHT = 800; // ExtraBold

  // [출력 폭을 왜 1080 으로 잡았나]
  // 카드 폭은 가이드 기준 809.52px 뿐이라 그대로 뽑으면 폰 화면에서 해상도가
  // 모자란다. 그렇다고 2배로 키우면 용량만 늘고 득이 없다 — 인스타는 업로드본을
  // 1080 폭으로 리사이즈하고, 갤러리에서 보는 데에도 1080 이면 충분하기 때문이다.
  // 1080 에 맞춰 두면 업로드할 때 재압축이 한 번 덜 일어나 화질도 오히려 낫다.
  const OUT_WIDTH = 1080;

  // [품질을 0.9 로 둔 이유]
  // 이 카드는 흰 바탕에 단색 도형이 대부분이라 JPEG 가 잘 압축하지만, 두
  // 군데가 약하다 — 손으로 그린 QR(거친 흑백 경계)과 글자다. 둘 다 고주파라
  // 품질을 낮추면 경계에 얼룩이 먼저 생긴다. 용량을 더 줄여야 한다면 품질보다
  // 폭(width 인자)을 먼저 건드리는 편이 낫다.
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
  //
  // QR 원본(1000×1000)은 가장자리에 흰 여백을 4.5~7% 쯤 두르고 있고, 그 양이
  // 장마다 다르다. 고정값으로 잘라내면 어떤 장은 여백이 남고 어떤 장은 코드가
  // 잘리므로, 검은 픽셀의 경계를 직접 재서 그만큼만 쓴다.
  //
  // 한 장을 재는 데 100만 픽셀을 훑으므로 경로별로 결과를 기억해 둔다 —
  // 같은 사람의 카드를 다시 저장할 때 다시 재지 않는다.
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

  // QR 은 정사각이어야 하므로 가로·세로 중 긴 쪽에 맞춰 정사각으로 넓히고
  // 중심을 유지한다 — 한쪽 변만 딱 맞춰 자르면 코드가 찌그러진다.
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
  // 자간은 글자를 하나씩 끊어 그리며 사이마다 더해 준다. ctx.letterSpacing
  // 속성도 있지만 브라우저 지원이 갈려서 쓰지 않는다.

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
  }

  function drawTrackedRight(ctx, str, rightX, baselineY, size, color) {
    drawTracked(ctx, str, rightX - trackedWidth(ctx, str, size), baselineY, size, color);
  }

  // ── 조각들 ────────────────────────────────────────────────

  function drawCardBody(ctx) {
    fillRect(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.card.fill);
    strokeRect(ctx, L.card.x, L.card.y, L.card.w, L.card.h, L.stroke);
  }

  // 좌: NO.1   우: 이름
  //
  // 둘 다 그래픽 박스의 좌우 변에 맞춰 정렬한다. 가이드 SVG 에서 이름은
  // 시작 x 만 적혀 있는데 그 값은 6글자일 때의 것이라, 이름 길이가 바뀌면
  // 끝이 흐트러진다. 오른쪽 끝을 고정하는 편이 디자인 의도에 맞다.
  //
  // 번호는 자릿수를 채우지 않는다 — 1번은 'NO.1', 23번은 'NO.23'.
  function drawHeader(ctx, id, name) {
    drawTracked(ctx, `NO.${id}`, L.noX, L.headerBaseline, L.headerSize, L.ink);
    drawTrackedRight(ctx, name, L.nameRightX, L.headerBaseline, L.headerSize, L.ink);
  }

  function drawGraphicBox(ctx, item, shape) {
    fillRect(ctx, L.box.x, L.box.y, L.box.s, L.box.s, L.box.fill);

    // 그래픽은 p5 버퍼에 그려서 얹는다 — core.js 의 그리기 함수가 버퍼
    // 하나를 통째로 쓰는 좌표계를 전제로 하기 때문.
    const s = L.graphic.s;
    const g = global.createGraphics(s, s);
    g.pixelDensity(1);
    g.colorMode(global.HSB, 360, 100, 100);
    g.clear();
    drawItemInto(g, item, s / 2, s / 2, s * L.graphicRatio[shape], shape);
    ctx.drawImage(g.canvas, L.graphic.x, L.graphic.y, s, s);
    g.remove();

    // 테두리는 그래픽 위에 — 그래픽이 가장자리에 닿아도 선이 묻히지 않는다.
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

  // archive/sketch.js 의 drawItem 과 같은 일을 한다. 등장 애니메이션은 쓰지
  // 않으므로 항상 제 크기(정적 완성 프레임)로 그린다.
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

  // 왼쪽에 그린 QR, 오른쪽에 분석 결과 5줄.
  //
  // [문장을 왜 이렇게 쪼갰나]
  // 두 수치는 분모가 다르다 — unfilled 는 "원본이 검은 영역" 기준, overflow 는
  // "원본이 흰 영역" 기준이고 그 둘은 27 : 73 이다. 숫자만 나란히 두면 큰 쪽이
  // 더 많이 틀린 것처럼 읽히는데 사실이 아니다. 그래서 분모를 문장에 박아
  // 넣는다 — "칠해야 할 곳의" / "비워둘 곳의".
  //
  // 설명 줄은 옅게, 수치가 든 줄은 진하게 해서 숫자에 먼저 눈이 가게 한다.
  function drawQrBlock(ctx, qrSource, crop, unfilled, overflow) {
    ctx.drawImage(
      sourceCanvas(qrSource),
      crop.sx, crop.sy, crop.s, crop.s,
      L.qr.x, L.qr.y, L.qr.s, L.qr.s
    );

    const lines = [
      { t: '원본과 비교한 결과', size: L.textLabelSize, color: L.dim },
      { t: '칠해야 할 곳의', size: L.textSize, color: L.dim },
      { t: `${Math.round(unfilled * 100)}%를 남겼고`, size: L.textSize, color: L.ink },
      { t: '비워둘 곳의', size: L.textSize, color: L.dim },
      { t: `${Math.round(overflow * 100)}%를 넘었습니다`, size: L.textSize, color: L.ink },
    ];

    lines.forEach((ln, i) => {
      drawTracked(ctx, ln.t, L.textX, L.textBaseline + L.textLead * i, ln.size, ln.color);
    });
  }

  function drawFooter(ctx) {
    strokeLine(ctx, L.dividerX1, L.dividerY, L.dividerX2, L.dividerY, L.stroke);
    ctx.fillStyle = L.ink;
    LOGO_PATHS.forEach((d) => ctx.fill(new Path2D(d), 'evenodd'));
  }

  // ── 합성 ──────────────────────────────────────────────────
  //
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

    // 변환 없는 상태에서 캔버스 전체를 칠한다. 카드 테두리의 바깥 절반이
    // 닿는 가장자리만 남는 영역이지만, JPEG 는 투명을 담지 못하므로 비워
    // 둘 수 없다.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fillRect(ctx, 0, 0, w, h, L.pageBg);

    // 이후의 모든 좌표는 가이드 기준으로 쓴다 — 원점을 카드 왼쪽 위
    // (테두리 바깥선)로 옮기고 배율만 건다.
    ctx.setTransform(
      scale, 0, 0, scale,
      (L.line / 2 - L.card.x) * scale,
      (L.line / 2 - L.card.y) * scale
    );

    // 선 끝과 모서리를 각지게. 캔버스 기본값이 아닌 쪽으로 p5 가 바꿔 둘
    // 수 있어(둥근 끝) 매번 명시한다.
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

  // [왜 toBlob 이 아니라 toDataURL 인가]
  // iOS Safari 의 navigator.share 는 사용자가 누른 그 순간에 호출되어야
  // 한다. toBlob 은 콜백으로 넘어가면서 그 "순간"을 놓쳐 공유가 거부된다.
  // toDataURL 은 동기라서 눌린 흐름 안에서 파일까지 만들어 낼 수 있다.
  function toFile(canvas, filename, quality) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality || QUALITY);
    const bin = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], filename, { type: 'image/jpeg' });
  }

  // [PC 와 모바일을 왜 갈라 놓나]
  // 윈도우의 Chrome·Edge 도 Web Share API 를 지원해서, 그냥 두면 PC 에서도
  // 윈도우 공유 창이 뜬다. 하지만 PC 에서 바라는 건 공유가 아니라 다운로드
  // 폴더에 바로 받는 것이다. 반대로 모바일은 공유 시트 말고는 갤러리로 갈
  // 길이 없다(iOS 의 a[download] 는 사진이 아닌 '파일' 앱으로 간다).
  // 그래서 "공유를 쓸 수 있는가"가 아니라 "모바일인가"로 가른다.
  function isMobile() {
    // UA Client Hints — 크로미움 계열에서 가장 정확하다.
    if (navigator.userAgentData) return navigator.userAgentData.mobile === true;
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) return true;
    // iPadOS 13+ 는 데스크탑과 같은 UA 를 쓴다 — 터치 지점 수로 가린다.
    return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  }

  // 모바일이면 공유 시트를 띄우고, PC 면 바로 내려받는다.
  // 반환값은 'shared' | 'downloaded' | 'cancelled'.
  //
  // 공유 시트에서 "이미지 저장"을 골라야 갤러리에 들어간다 — 웹에는 갤러리에
  // 직접 쓰는 길이 없다.
  function save(canvas, filename) {
    if (isMobile()) {
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

  // [왜 toDataURL 이 아니라 Blob 인가]
  // 공유 쪽과 달리 여기서는 사용자 제스처를 유지할 필요가 없다. data: URL 은
  // 1MB 를 넘어가면 브라우저가 거부하거나 파일명을 잃는 일이 있어서, 크기
  // 제한이 없는 Blob URL 로 내려받는다.
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
