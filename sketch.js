/* ============================================================
   QR++ — 메인 페이지 sketch.js
   ------------------------------------------------------------
   하는 일 세 가지:
     1) 네비 메뉴 열고 닫기
     2) QR 루프 영상을 화면에 들어올 때만 재생
     3) 스포크 그래픽 5개를 생성하고 스크롤에 따라 회전

   3번은 p5.js 전역 모드로 동작한다. setup()·windowResized()가
   전역 함수여야 p5가 찾아서 호출하므로, 이 파일은 모듈이 아니라
   일반 스크립트로 불러야 한다(index.html 참고). 그래픽 생성 로직
   자체는 shared/core.js의 drawRadialSpokeDots를 그대로 쓴다 —
   아카이브 2번 탭과 같은 그래픽.
   ============================================================ */

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

/* ── QR 영상 — 미리 버퍼링하고, 화면에 들어올 때만 재생 ──
   예전에는 preload="none" + rootMargin 200px 하나로만 처리했다.
   그러면 영상이 거의 눈앞에 올 때까지 단 1바이트도 받지 않아서,
   스크롤해 내려온 순간부터 파일을 받기 시작한다. 파일이 크면
   그 자리에서 몇 초 동안 빈 칸만 보인다 — "처음 접속하면 영상이
   너무 늦게 뜬다"의 직접적인 원인이다.

   그래서 로딩 단계를 셋으로 나눴다.
     1) 첫 화면 페인트까지는 preload="none" 그대로 — 영상이
        글꼴·스크립트와 대역폭을 다투지 않게 한다.
     2) load 이벤트 뒤 한가해지면 preload="auto"로 올려
        백그라운드에서 조용히 앞부분을 받아둔다.
     3) 실제 재생/정지는 지금처럼 화면 진입 여부로 판단하되,
        rootMargin을 크게 잡아 더 일찍 시작한다.

   데이터 절약 모드나 2G/3G에서는 2)를 건너뛴다 — 그런 회선에서
   수십 MB를 미리 받아두는 건 손해다. */
const qrVideo = document.getElementById('qr-video');

/* 느린 회선·데이터 절약 모드 감지. 지원하지 않는 브라우저면 false. */
function prefersLightLoading() {
  const c = navigator.connection;
  if (!c) return false;
  return c.saveData === true || /(^|-)2g$/.test(c.effectiveType || '');
}

if (qrVideo) {
  /* ── 1·2단계: 한가해지면 버퍼링 시작 ── */
  const startBuffering = () => {
    if (prefersLightLoading()) return;
    qrVideo.preload = 'auto';
    qrVideo.load(); // preload 속성 변경을 실제 네트워크 요청으로 반영
  };

  const scheduleBuffering = () => {
    // requestIdleCallback이 없으면(사파리) 짧은 타이머로 대체.
    if ('requestIdleCallback' in window) {
      requestIdleCallback(startBuffering, { timeout: 2000 });
    } else {
      setTimeout(startBuffering, 300);
    }
  };

  if (document.readyState === 'complete') scheduleBuffering();
  else window.addEventListener('load', scheduleBuffering, { once: true });

  /* 첫 프레임이 준비되면 표시 — 그 전까지는 CSS가 빈 칸을 가려둔다. */
  qrVideo.addEventListener('loadeddata', () => {
    qrVideo.classList.add('is-ready');
  }, { once: true });

  /* ── 3단계: 화면에 들어올 때만 재생 ──
     화면 밖에서 계속 디코딩하면 스포크 그래픽 회전과 부하가 겹쳐
     스크롤이 무거워지므로, 벗어나면 멈춘다. */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          // 자동재생 차단(사용자 제스처 없음)은 조용히 넘긴다.
          qrVideo.play().catch(() => {});
        } else {
          qrVideo.pause();
        }
      });
    }, { rootMargin: '150% 0px' }).observe(qrVideo); // 한 화면 반쯤 앞서 시작
  } else {
    qrVideo.play().catch(() => {});
  }
}

/* ── 스포크 그래픽 설정 ──────────────────────────
   시안(모바일 349px 기준)에서 각 그래픽의 지름·중심 좌표를 재서
   화면 대비 비율과 dvh 위치로 옮긴 값이다. 그래서 기기가 달라져도
   시안의 배치 비율이 그대로 유지된다.

   size   : [minPx, 배수, maxPx] — viewportUnit()에 비례하되 양끝을 잠금
   top    : 네비 아래를 0으로 잡은 캔버스 위쪽 모서리 위치(dvh).
            100이면 딱 한 화면 아래. 텍스트는 첫 화면(0~100dvh)
            안에 모여 있고, 그 아래 100~200dvh는 스크롤하며
            그래픽만 지나간다.
   offset : size 대비 비율. 양수면 그 비율만큼 화면 밖으로 밀려나
            중심이 가장자리 바깥에 놓이고, 음수면 안쪽으로 들어온다.
            비율이라 크기를 바꿔도 삐져나온 정도가 유지된다.

   [중요] size는 캔버스 크기이지 눈에 보이는 지름이 아니다. 실제로
   보이는 지름은 errorA가 정한다 — errorA가 클수록 살이 바깥까지
   뻗어 캔버스를 꽉 채우고, 작을수록 중심에 옹기종기 모인다.
     errorA 0.15 → 캔버스의 약 60%만 채움
     errorA 0.50 → 약 71%
     errorA 0.85 → 약 82%
   그래서 errorA가 낮은 그래픽은 size를 그만큼 더 키워야 다른 것과
   같은 크기로 보인다. 아래 size 값은 그 보정을 반영한 것이다.

   보이는 지름 기준 (viewportUnit 대비):
     특대 2.10 / 중대 0.99 / 대 0.82 / 중 0.68 / 소 0.30

   목록은 top이 작은 것부터, 즉 화면 위에서 아래로 내려가는 순서로
   적어둔다. 값을 고친 뒤 순서가 어긋나면 이 순서대로 다시 정렬할 것 —
   배치를 눈으로 좇기 쉬워진다. (순서 자체는 동작에 영향을 주지 않는다.
   아래 SPOKES_ABOVE_VIDEO도 순서가 아니라 colorSeed로 지목하므로
   자유롭게 옮겨도 된다.)
   ─────────────────────────────────────────────────── */
const SPOKE_CFG = [
  //  side     size     top  offset  errA  errB  seed  dir  speed
  // 대 — 좌상단. top이 음수라 위쪽 일부가 네비에 가려진 채 시작한다
  ['left',  [370, 1.15,  920], -16, 0.48,  0.50, 0.30, 1001,  1, 0.055],
  // 특대 — 우측. 가장 큰 그래픽, 두 문단 오른쪽을 가로지른다
  ['right', [820, 2.56, 2040],  -5, 0.70,  0.85, 0.25, 1004, -1, 0.045],
  // 소 — 좌측, 화면 안쪽에 작게
  ['left',  [160, 0.50,  400],  58, 0.14,  0.15, 0.50, 1002,  1, 0.11 ],
  // 중대 — 좌하단
  ['left',  [425, 1.33, 1065],  76, 0.488, 0.60, 0.45, 1003,  1, 0.06 ],
  // 중 — 우측, QR 영상 위에 겹친다
  ['right', [310, 0.87,  775], 115, 0.367, 0.45, 0.55, 1006, -1, 0.075],
  // 대 — 좌하단. 마무리 문단 아래가 허전해서 채운 그래픽.
  // offset 0.42로 왼쪽 절반 가까이가 화면 밖으로 나가고, 아래쪽은
  // #section-main의 overflow:hidden에 걸려 잘린다(= 모서리에서 삐져나온 모양).
  ['left',  [360, 1.12,  900], 162, 0.42,  0.45, 0.55, 1007,  1, 0.07 ],
];

/* QR 영상보다 위에 그릴 그래픽을 colorSeed(위 목록 8번째 값)로 지목한다.
   영상 래퍼가 z-index:1 이라, 여기 적힌 것만 2로 올려 영상 위에 겹치게
   한다. 나머지는 영상 아래에 깔린다.

   목록 순번(1,2,3…) 대신 colorSeed를 쓰는 이유는, 순번으로 두면 위
   목록의 줄 순서를 바꿀 때마다 엉뚱한 그래픽이 지목되기 때문이다.
   colorSeed는 그래픽마다 고유하고 위치와 무관해서 안전하다.

   [참고] 영상 위로 올라간 그래픽은 영상의 multiply 블렌드 대상에서
   빠진다 — 영상보다 나중에 그려지므로 배경이 아니라 전경이 된다. */
const SPOKES_ABOVE_VIDEO = [1006]; // 중 — 우측

/* 그래픽 크기의 기준이 되는 단위.

   너비만 쓰면 가로로 납작한 화면(태블릿 가로·데스크톱)에서 어긋난다.
   크기는 너비를 따라 커지는데 세로 위치는 dvh를 따라가기 때문에,
   너비는 넓고 높이는 낮은 화면에서 그래픽만 부풀어 화면 높이를 다
   잡아먹는다. 높이에 1.2를 곱한 값과 견줘 작은 쪽을 쓰면,
     · 세로로 긴 화면(1.2h > w) — 지금까지처럼 너비를 따라간다
     · 납작한 화면(1.2h < w)   — 높이가 상한을 잡아준다
   1.2를 곱하는 건 세로 화면에서 높이가 끼어들지 않게 하려는 여유분.
   덕분에 모바일에서 주소창이 접혀 높이가 변해도 크기는 그대로다
   (= 스크롤 중에 그래픽이 다시 그려지지 않는다). */
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

  /* 캔버스가 클수록 배율을 낮춘다. 2번 그래픽은 큰 화면에서 한 변이
     2040px까지 가는데, 여기에 배율 2를 곱하면 4080×4080 = 약 1,660만
     픽셀이라 이 캔버스 하나가 GPU 메모리 60MB대를 먹는다(.spoke-wrap의
     will-change:transform 때문에 각자 레이어로 올라간다). 스포크는
     단색 면과 굵은 선뿐이라 배율을 낮춰도 눈에 띄는 차이가 없다. */
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const densityFor = (size) => (size > 1200 ? 1 : dpr);

  SPOKE_CFG.forEach(([side, sizeSpec, topDvh, offRatio, eA, eB, seed, dir, speed]) => {
    const size = resolveSize(sizeSpec);
    const xOff = -Math.round(size * offRatio); // 화면 밖으로 나가는 양

    /* 래퍼 div — 위치 지정 */
    const wrap = document.createElement('div');
    wrap.className = 'spoke-wrap';
    wrap.style.width  = `${size}px`;
    wrap.style.height = `${size}px`;
    // 영상(z-index:1)보다 위로 올릴 그래픽만 2로
    if (SPOKES_ABOVE_VIDEO.includes(seed)) wrap.style.zIndex = '2';
    /* %가 아니라 dvh — %로 두면 부모(#text-area) 높이에 묶여서,
       문단 구성이나 블록 높이를 손댈 때마다 그래픽이 통째로
       밀린다. dvh는 화면 높이 기준이라 텍스트 구조와 무관하게
       "네비 아래에서 N화면만큼 내려간 자리"로 고정된다. */
    wrap.style.top    = `${topDvh}dvh`;
    wrap.style[side]  = `${xOff}px`; // left 또는 right

    /* p5.Graphics 생성 + 스포크 드로잉 */
    const g = createGraphics(size, size);
    g.pixelDensity(densityFor(size));
    g.colorMode(HSB, 360, 100, 100);
    // 배경을 칠하지 않는다 — p5.Graphics는 기본이 투명이라 페이지
    // 흰 배경이 그대로 비친다. 여기서 background()로 흰색을 칠하면
    // 캔버스의 정사각형 영역이 불투명해져서, 겹쳐 놓인 다른 그래픽의
    // 살·점을 사각형 모서리로 잘라먹는다.

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

  buildSpokes();
  noLoop(); // 정적 그래픽 — 애니메이션 루프 불필요

  /* ── 스크롤 → 회전 애니메이션 ────────────────── */
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      applyRotation();
      ticking = false;
    });
  }, { passive: true });
}

/* 화면 크기가 바뀌면 다시 계산해 새로 그린다.
   연속 리사이즈마다 전부 다시 그리면 비싸므로 살짝 묶어서 처리. */
let resizeTimer = null;
function windowResized() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(buildSpokes, 150);
}
