/* ============================================================
   Behind — script.js
   ------------------------------------------------------------
   프로젝트에 실제로 참여한 사람들의 사진을 그리드로 보여준다.

   사진 추가 방법:
     images/01.jpg, 02.jpg, ... 형식으로 번호를 이어 저장하고
     아래 PHOTO_COUNT를 사진 장수에 맞게 올리면 된다.
   ============================================================ */

const PHOTO_COUNT = 12;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildPhotoGrid() {
  const holder = document.getElementById('photo-holder');
  const frag = document.createDocumentFragment();

  for (let i = 1; i <= PHOTO_COUNT; i++) {
    const cell = document.createElement('div');
    cell.className = 'photo-cell';

    const img = document.createElement('img');
    img.src = `images/${pad2(i)}.jpg`;
    img.alt = `참여 사진 ${i}`;
    img.loading = 'lazy';

    cell.appendChild(img);
    frag.appendChild(cell);
  }

  holder.appendChild(frag);
}

buildPhotoGrid();

/* ── 자료 수합 과정 카드뉴스 — 확인용 임시 섹션 ──────────────────
   나중에 삭제할 때는 이 블록 전체 + index.html의 #collect-section +
   style.css의 관련 규칙 + images/collect/ 폴더를 함께 지우면 된다.

   이미지 추가 방법:
     images/collect/01.jpg, 02.jpg, ... 형식으로 저장하고
     아래 COLLECT_COUNT를 장수에 맞게 올리면 된다.
*/

const COLLECT_COUNT = 4;
let collectIndex = 0;

function updateCollectImage() {
  document.getElementById('collect-img').src = `images/collect/${pad2(collectIndex + 1)}.jpg`;
  document.getElementById('collect-counter').textContent = `${collectIndex + 1} / ${COLLECT_COUNT}`;
}

function initCollectCarousel() {
  updateCollectImage();

  document.getElementById('collect-prev').addEventListener('click', () => {
    collectIndex = (collectIndex - 1 + COLLECT_COUNT) % COLLECT_COUNT;
    updateCollectImage();
  });

  document.getElementById('collect-next').addEventListener('click', () => {
    collectIndex = (collectIndex + 1) % COLLECT_COUNT;
    updateCollectImage();
  });
}

initCollectCarousel();
