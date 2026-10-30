# QR++ 설계 노트

코드에서 걷어낸 긴 주석 중 **삭제하면 나중에 다시 알아내기 어려운 내용**만 옮겨 적은 문서다.
코드에는 짧은 한 줄 주석과 `[주의]` 경고만 남겼고, 그 근거는 여기에 있다.

## 문서

| 파일 | 다루는 코드 |
|---|---|
| [about.md](about.md) | `index.html`, `about/sketch.js`, `about/style.css` |
| [archive.md](archive.md) | `archive/index.html`, `archive/sketch.js`, `archive/style.css` |
| [shared.md](shared.md) | `shared/core.js`, `shared/save-card.js`, `shared/menu.css`, `shared/menu.js` |
| [credit.md](credit.md) | `credit/*`, `card-preview/*` |

## 페이지 구성

```
index.html            About (루트). about/style.css + about/sketch.js
archive/index.html    Archive 그리드 + 상세 오버레이
credit/index.html     Credit 이름 목록 + 현장 사진
card-preview/         저장 카드 미리보기(개발용). shared/save-card.js 레이아웃 확인
archive/experiments.js  보류한 ring/tile 안 — 어디서도 로드하지 않음(파일 헤더에 복구 절차)
                        * 이 파일의 긴 주석은 일부러 그대로 뒀다. 코드가 동작하지 않는
                          동안 그 설계 의도를 남겨둔 유일한 기록이기 때문이다.
archive/_toolbar-test.html  툴바 실험용 단독 페이지
```

공유 코드
- `shared/core.js` — 그래픽 생성(bloom = `drawRadialBurstFlowerDev`, burst = `drawRadialSpokeDots`). About·Archive·저장 카드가 모두 이 파일을 쓴다.
- `shared/save-card.js` — 저장 카드 합성. Archive 상세 저장 버튼과 card-preview가 공유.
- `shared/menu.js` / `shared/menu.css` — 우측 하단 메뉴(Archive·Credit). About은 네비 메뉴를 자체 구현.

## 데이터

- `data/qr_error_data.json` — `{ qr_clean_NNN: { unfilledRate, overflowRate } }`. 키의 숫자가 QR 이미지 번호와 1:1. 현재 203개이고 `ITEM_COUNT`가 여기서 정해진다.
- `data/qr_name.json` — `[{ qr_nnn, 이름, ... }]`. `스캔여부` 항목은 쓰지 않는다. 이름이 없으면 `익명`.
- `archive/images/qr/qr_final_001.jpg` ~ `_203.jpg` — `QR_IMAGE_COUNT`와 맞춰야 한다.

## 전역 규칙

- **색 팔레트는 한 곳**: `shared/core.js`의 `RADIAL_COLOR_PALETTE` 5색(`#f299c1` 핑크 / `#fee987` 노랑 / `#7ecaac` 초록 / `#567591` 네이비 / `#f58b6e` 주황). 메뉴 점 색, About의 `.accent`, Credit의 `.count`·이름 hover가 모두 이 값을 복사해 쓴다 — 바꾸려면 다섯 군데를 함께 고쳐야 한다.
- **재현성**: p5 전역 `random()`을 그래픽 형태에 쓰지 않는다. `makeRadialSpokeRng(seed)`로 만든 로컬 RNG만 쓰므로 새로고침·리사이즈에도 모양과 색이 그대로다. 전역 `random()`은 등장 애니메이션 지연처럼 "지나가면 그만인" 값에만 쓴다.
- **hover는 PC 전용**: 터치 기기는 탭한 뒤 hover 상태가 달라붙는다. 모든 반전·확대 효과는 `@media (hover: hover) and (pointer: fine)` 안에 둔다.
- 마지막 업데이트 날짜는 `index.html`의 `.footer-updated` 한 줄만 고친다.
