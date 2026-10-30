/* QR++ — About 페이지
   1) 네비 메뉴 토글  2) QR 루프 영상(화면에 들어올 때만 재생)  3) 스포크 그래픽(현재 꺼둠)

   p5 전역 모드 — setup()·windowResized()가 전역이어야 하므로 모듈로 불러서는 안 된다.
   그래픽 생성은 shared/core.js의 drawRadialSpokeDots를 쓴다(아카이브 burst 탭과 같다).
   설계 근거·복구 방법은 docs/about.md 참고. */

/* ── 메뉴 토글 ──────────────────────────────────── */
const menuBtn     = document.getElementById('menu-btn');
const menuOverlay = document.getElementById('menu-overlay');

menuBtn.addEventListener('click', () => {
  const open = document.body.classList.toggle('menu-open');
  menuBtn.setAttribute('aria-expanded', open);
  menuOverlay.setAttribute('aria-hidden', !open);
});

menuOverlay.querySelectorAll('.menu-item').forEach((el) => {
  el.addEventListener('click', () => {
    document.body.classList.remove('menu-open');
    menuBtn.setAttribute('aria-expanded', 'false');
    menuOverlay.setAttribute('aria-hidden', 'true');
  });
});

/* ── QR 영상 — 3단계 로딩(preload none → 한가해지면 auto → 화면 진입 시 재생) ──
   단계를 나눈 이유와 재시도 지점은 docs/about.md 참고. */
const qrVideo = document.getElementById('qr-video');

/* 느린 회선·데이터 절약 모드 감지. 지원하지 않는 브라우저면 false. */
function prefersLightLoading() {
  const c = navigator.connection;
  if (!c) return false;
  return c.saveData === true || /(^|-)2g$/.test(c.effectiveType || '');
}

if (qrVideo) {
  let wantsPlay = false; // 화면 안에 있는가 = 재생을 원하는 상태인가

  const tryPlay = () => {
    if (!wantsPlay) return;
    // 자동재생 차단은 조용히 넘긴다 — 아래 재시도 지점들이 다시 시도한다.
    qrVideo.play().catch(() => {});
  };

  const startBuffering = () => {
    if (prefersLightLoading()) return;
    if (qrVideo.preload === 'auto') return;
    qrVideo.preload = 'auto';

    /* [주의] load()는 재생을 취소하고 currentTime을 0으로 되돌린다. 영상이 첫 화면에
       보이면 play()가 이미 시작된 뒤 여기가 불리므로, 그때 load()를 하면 영영 멈춘다
       (관찰자는 계속 교차 상태라 다시 발화하지 않는다). */
    if (!wantsPlay && qrVideo.readyState === 0) qrVideo.load();

    tryPlay();
  };

  const scheduleBuffering = () => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(startBuffering, { timeout: 2000 });
    } else {
      setTimeout(startBuffering, 300); // 사파리 대체
    }
  };

  if (document.readyState === 'complete') scheduleBuffering();
  else window.addEventListener('load', scheduleBuffering, { once: true });

  /* 첫 프레임이 준비되면 표시 — 그 전까지는 CSS가 정사각 비율로 자리를 잡아둔다. */
  qrVideo.addEventListener('loadeddata', () => {
    qrVideo.classList.add('is-ready');
  }, { once: true });

  // 버퍼가 차오를 때마다 재시도(preload none이라 첫 play()가 데이터보다 먼저 올 수 있다)
  qrVideo.addEventListener('canplay', tryPlay);

  // iOS 저전력 모드 — muted 영상도 자동재생이 막히므로 첫 제스처에 한 번 더
  const retryOnGesture = () => tryPlay();
  window.addEventListener('touchstart', retryOnGesture, { once: true, passive: true });
  window.addEventListener('click', retryOnGesture, { once: true });

  // 화면에 들어올 때만 재생 — 밖에서 계속 디코딩하면 스크롤이 무거워진다
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        wantsPlay = e.isIntersecting;
        if (wantsPlay) tryPlay();
        else qrVideo.pause();
      });
    }, { rootMargin: '150% 0px' }).observe(qrVideo); // 한 화면 반쯤 앞서 시작
  } else {
    wantsPlay = true;
    tryPlay();
  }

  // 탭을 벗어났다 돌아오면 사파리가 멈춰둔 채로 두기도 한다
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryPlay();
  });
}

/* ── 스포크 그래픽 설정 ──────────────────────────
   [side, size, top, offset, errorA, errorB, colorSeed, dir, speed]
     size   : [minPx, 배수, maxPx] — viewportUnit()에 비례하되 양끝을 잠금
     top    : 네비 아래를 0으로 잡은 캔버스 위쪽 위치(dvh)
     offset : size 대비 비율. 양수면 그만큼 화면 밖으로 밀려난다

   [주의] #section-main의 overflow:hidden에 걸려 top이 내용 끝을 넘으면 그래픽이
   통째로 사라진다(0~90dvh 안이 안전). size는 캔버스 크기이지 보이는 지름이 아니다 —
   보이는 지름은 errorA가 정한다. 목록은 top이 작은 것부터 적어둔다(동작과는 무관).
   보정 비율·보이는 지름 환산표는 docs/about.md 참고.
   ─────────────────────────────────────────────────── */
const SPOKE_CFG = [
  //  side     size     top  offset  errA  errB  seed  dir  speed
  // 대 — 좌상단. top이 음수라 위쪽 일부가 네비에 가려진 채 시작한다
  ['left',  [370, 1.15,  920], -10, 0.48,  0.50, 0.30, 1001,  1, 0.055],
  // 특대 — 우측. 가장 큰 그래픽, 영상과 리드 문장 오른쪽을 가로지른다
  ['right', [820, 2.56, 2040],   2, 0.70,  0.85, 0.25, 1004, -1, 0.045],
  // 중 — 우측, QR 영상 위에 겹친다(SPOKES_ABOVE_VIDEO)
  ['right', [310, 0.87,  775],  20, 0.367, 0.45, 0.55, 1006, -1, 0.075],
  // 소 — 좌측, 화면 안쪽에 작게
  ['left',  [160, 0.50,  400],  40, 0.14,  0.15, 0.50, 1002,  1, 0.11 ],
  // 중대 — 좌측. 본문 문단 왼쪽
  ['left',  [425, 1.33, 1065],  58, 0.488, 0.60, 0.45, 1003,  1, 0.06 ],
  // 대 — 좌하단. offset 0.42로 왼쪽 절반 가까이가 화면 밖으로 나간다
  ['left',  [360, 1.12,  900],  86, 0.42,  0.45, 0.55, 1007,  1, 0.07 ],
];

/* 영상(z-index:1)보다 위에 그릴 그래픽을 colorSeed로 지목한다 — 목록 순번을 쓰면
   줄 순서를 바꿀 때마다 엉뚱한 그래픽이 지목된다. 위로 올라간 것은 영상의 multiply
   블렌드 대상에서 빠진다. */
const SPOKES_ABOVE_VIDEO = [1006]; // 중 — 우측

/* 그래픽 크기의 기준 단위. 너비만 쓰면 납작한 화면에서 그래픽만 부풀어 화면 높이를
   다 먹으므로, 높이×1.2와 견줘 작은 쪽을 쓴다(docs/about.md). 덕분에 모바일에서
   주소창이 접혀 높이가 변해도 크기는 그대로다. */
function viewportUnit() {
  return Math.min(window.innerWidth, window.innerHeight * 1.2);
}

// [minPx, 배수, maxPx] → 현재 화면 기준 실제 px
function resolveSize([minPx, factor, maxPx]) {
  return Math.round(Math.max(minPx, Math.min(maxPx, viewportUnit() * factor)));
}

let spokeEls = [];

/* 화면 크기에 맞춰 그래픽을 전부 다시 만든다(최초 1회 + 리사이즈).
   errorA/errorB/colorSeed가 고정이라 크기만 달라지고 모양·색은 동일. */
function buildSpokes() {
  const area = document.getElementById('text-area');

  // 이전 버퍼 정리 — 안 하면 리사이즈마다 캔버스가 쌓인다.
  spokeEls.forEach(({ el, gfx }) => {
    gfx.remove();
    el.remove();
  });
  spokeEls = [];

  // 큰 캔버스는 배율을 낮춘다 — 2040px에 배율 2면 이 하나가 GPU 메모리 60MB대를 먹는다
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const densityFor = (size) => (size > 1200 ? 1 : dpr);

  SPOKE_CFG.forEach(([side, sizeSpec, topDvh, offRatio, eA, eB, seed, dir, speed]) => {
    const size = resolveSize(sizeSpec);
    const xOff = -Math.round(size * offRatio); // 화면 밖으로 나가는 양

    const wrap = document.createElement('div');
    wrap.className = 'spoke-wrap';
    wrap.style.width  = `${size}px`;
    wrap.style.height = `${size}px`;
    if (SPOKES_ABOVE_VIDEO.includes(seed)) wrap.style.zIndex = '2';
    // %가 아니라 dvh — %는 부모 높이에 묶여서 문단 구성을 손댈 때마다 그래픽이 밀린다
    wrap.style.top    = `${topDvh}dvh`;
    wrap.style[side]  = `${xOff}px`;

    const g = createGraphics(size, size);
    g.pixelDensity(densityFor(size));
    g.colorMode(HSB, 360, 100, 100);
    // [주의] background()로 칠하지 않는다 — 불투명해지면 겹친 다른 그래픽을
    // 사각형 모서리로 잘라먹는다. p5.Graphics는 기본이 투명이다.

    drawRadialSpokeDots(
      g,
      size / 2, size / 2, // cx, cy
      size * 0.93,        // 캔버스 대비 여백 조금 두기
      eA, eB, seed
    );

    g.canvas.style.display = 'block';
    g.canvas.style.width   = '100%';
    g.canvas.style.height  = '100%';

    wrap.appendChild(g.canvas);
    area.appendChild(wrap);

    spokeEls.push({ el: wrap, gfx: g, dir, speed });
  });

  applyRotation(); // 리사이즈 직후에도 현재 스크롤 각도를 유지
}

/* 현재 스크롤 위치를 각 그래픽의 회전각으로 반영 */
function applyRotation() {
  const sy = window.scrollY;
  spokeEls.forEach(({ el, dir, speed }) => {
    el.style.transform = `rotate(${sy * speed * dir}deg)`;
  });
}

/* ── p5 global setup ─────────────────────────────── */
function setup() {
  noCanvas(); // 메인 캔버스 불필요
  colorMode(HSB, 360, 100, 100);
  noLoop(); // 정적 그래픽 — 애니메이션 루프 불필요

  /* ── 스포크 그래픽 — 잠시 꺼둠 ──────────────────
     되살리려면 아래 주석과 windowResized()의 주석을 함께 풀면 된다.

  buildSpokes();

  // ── 스크롤 → 회전 애니메이션 ──
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      applyRotation();
      ticking = false;
    });
  }, { passive: true });
  */
}

/* 화면 크기가 바뀌면 다시 계산해 새로 그린다(연속 리사이즈는 묶어서 처리).
   스포크 그래픽을 꺼둔 동안에는 할 일이 없어 비워뒀다. */
let resizeTimer = null;
function windowResized() {
  // clearTimeout(resizeTimer);
  // resizeTimer = setTimeout(buildSpokes, 150);
}
