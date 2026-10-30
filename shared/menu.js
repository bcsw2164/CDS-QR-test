/* 공용 메뉴 토글 — 우측 하단 버전(아카이브·크레딧 공용).
   body에 붙는 .menu-open 하나로 버튼 모양·커튼·항목 등장이 모두 CSS에서 처리되므로,
   여기서는 그 클래스와 접근성 속성만 맞춘다. 문서 끝에서 불러야 버튼을 찾을 수 있다. */

(function initCornerMenu() {
  const menuBtn = document.getElementById('menu-btn');
  const menuOverlay = document.getElementById('menu-overlay');

  // 메뉴를 두지 않은 페이지에서 이 파일을 불러도 조용히 지나가게 한다.
  if (!menuBtn || !menuOverlay) return;

  function setOpen(open) {
    document.body.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuOverlay.setAttribute('aria-hidden', String(!open));
  }

  menuBtn.addEventListener('click', () => {
    setOpen(!document.body.classList.contains('menu-open'));
  });

  // 뒤로 돌아왔을 때 열린 상태로 남지 않도록 닫아둔다.
  menuOverlay.querySelectorAll('.menu-item').forEach((el) => {
    el.addEventListener('click', () => setOpen(false));
  });

  // 커튼의 빈 곳을 눌러도 닫히게 한다.
  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
})();
