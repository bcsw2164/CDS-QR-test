/* ============================================================
   공용 메뉴 토글 — 우측 하단 버전
   ------------------------------------------------------------
   메인 페이지 sketch.js의 메뉴 토글과 같은 로직이다. body에 붙는
   .menu-open 클래스 하나로 버튼 모양·커튼·항목 등장이 모두 CSS에서
   처리되므로, 여기서는 그 클래스와 접근성 속성만 맞춰준다.

   아카이브/크레딧이 함께 쓴다. 각 페이지의 다른 스크립트보다
   먼저·나중 어느 쪽이든 상관없지만, 문서 끝에서 불러야 버튼을
   찾을 수 있다.
   ============================================================ */

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

  // 항목을 누르면 페이지가 넘어가지만, 뒤로 돌아왔을 때 열린 상태로
  // 남지 않도록 닫아둔다.
  menuOverlay.querySelectorAll('.menu-item').forEach((el) => {
    el.addEventListener('click', () => setOpen(false));
  });

  // 커튼의 빈 곳(항목이 아닌 부분)을 눌러도 닫히게 한다.
  menuOverlay.addEventListener('click', (e) => {
    if (e.target === menuOverlay) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') setOpen(false);
  });
})();
