# WorldLens — Changelog

## [R8] 2026-04-10 — UI 영어화

**커밋:** `7c5ba71`  
**PR:** PSSong/PSSong.github.io#1 (포함)

UI 27개 문자열 전면 영어 전환. i18n 라이브러리 미사용, plain-text 치환.

변경 파일:
- `layouts/worldlens/list.html`: 9개 (← Home, Filter, Layers, Country, Aircraft, Vessel, Satellite, Typhoon, Port, Zoom In/Out 타이틀, Updated:, 면책 문구)
- `assets/js/worldlens/interaction.js`: 12개 tooltip 필드 (Country, Class, Altitude, Origin, Type, Speed, Operator, Grade, LOCODE, Category, Max Wind, Direction, Position, Typhoon 기본명)
- `assets/js/worldlens/main.js`: 5개 (초기화 실패, 데이터 로드 실패 메시지, console 문자열)
- `assets/js/worldlens/data_loader.js`: 1개 (자동 갱신 실패 경고)

컨벤션: UI/툴팁 → Title Case, 에러/console → Sentence case.

---

## [R7 + Phase 5] 2026-04-10 — Rust WASM IP 보호 + 빌드 보안

**커밋:** `2acb7f7`  
**PR:** PSSong/PSSong.github.io#1 (포함)

### R7 — WASM
- `worldlens-core/` Rust 크레이트 신규 생성 (`cdylib`, `wasm-bindgen = "0.2"`)
- 5개 함수 이식: `project`, `spiral_path`, `get_color`, `is_visible`, `cluster_l1`
- `wasm-pack build --target web --release` 빌드
- `assets/js/worldlens/wasm/worldlens_core.js` — JS 글루 (esbuild 인라인 번들)
- `static/worldlens/wasm/worldlens_core_bg.wasm` — 바이너리 63 KB (Hugo static 서빙)
- `hugo.toml` — `[mediaTypes."application/wasm"]` MIME 등록
- JS 래퍼 교체: `globe.js` `project()`, `classify_colors.js` `getColor()`/`isVisible()`, `layers.js` `_spiralPath()`/`_renderClustered()`

해결된 이슈:
- Rust 타입 오류 (`&str` vs `String`) 수정
- `wasm-opt = false` 추가 (bulk-memory 호환성)
- WASM URL `import.meta.url` undefined 문제 → 명시적 경로 전달로 해결
- wasm-pack `.gitignore` 자동 생성 (`*`) → 수동 삭제 후 커밋
- `worldlens-core/target/` → `.gitignore` 추가

### Phase 5 — 빌드 보안
- D3 v7 / TopoJSON 3.0.2 CDN에 SRI sha384 해시 추가
- `worldlens_core.js` 내 `console.warn` 3개 제거 (IP 보호)
- Hugo `js.Build` target `es2017` → `es2020` (dynamic import 지원)

---

## [R4] 2026-04-10 — Three.js → D3 v7 + SVG 2D 전환

**커밋:** `43fb582` (태풍 나선 + 렌더링 재설계)  
**롤백 포인트:** `f5b5840` (Phase 2/3 완료 시점)

### 핵심 변경
- `layouts/worldlens/list.html`: `<canvas>` → `<svg viewBox="0 0 1000 1000">`, Three.js CDN → D3 v7 + TopoJSON CDN, Hugo `js.Build` 설정
- `assets/js/worldlens/globe.js`: `geoAzimuthalEquidistant().rotate([0,-90])`, 베이스맵, flat-earth 격자
- `assets/js/worldlens/layers.js`: SVG circle/rect 렌더, `LayerManager` 클래스, L1 그리드 클러스터링, 태풍 나선 아이콘 (`_spiralPath`)
- `assets/js/worldlens/interaction.js`: d3.zoom 3단계 스냅(L1/2/3), 핀치/휠/키보드, URL 해시(`#z=N`), 호버 툴팁, 국가 선택기
- `assets/js/worldlens/main.js`: WASM 초기화, 모바일 레이어 기본 OFF, `_capData()` 4000 상한
- `assets/js/worldlens/classify_colors.js`: Three.js 제거, CSS 색상 상수, WASM 바인딩

### 버그 수정 (파이프라인 스키마)
- 태풍 `center_lat/center_lon` → `lat/lon` 정규화
- 카테고리 `"C1"~"C5"` → `"1"~"5"` 정규화
- `forecast_track` → `track (type:'forecast')` 정규화

---

## [R1–R3] 2026-04-09 — 설계 단계

- R1: 팀장 분석, AE 투영 채택, SVG vs Canvas 결정
- R2: dev-critic — 성능 한계, 클러스터링 설계 검토
- R3: risk-reviewer — 4000 cap, 모바일 UX, IP 보호 방향 승인

---

## 배포 이력

| 날짜 | 내용 | 커밋/PR | Run ID |
|------|------|---------|--------|
| 2026-04-10 | R4+R7+Phase5+R8 머지 배포 | `923933e` / PR#1 | 24226997696 |
| 2026-04-09 | 기존 포스트 영어 번역 | fix: retranslate | 24219150067 |
| 2026-04-09 | 블로그 초기 포스트 발행 | publish: 2026-04-09 | 24192720781 |

---

## 남은 작업

| 항목 | 우선순위 | 세션 |
|------|----------|------|
| R5: 파이프라인 4000 cap 지원 | 중간 | `~/Desktop/WorldLens/` 전용 세션 |
| data_loader.js `CONFIG.dataUrl` → raw.githubusercontent.com 전환 | R5 이후 | pssong-blog 세션 |
| wasm-opt 재활성화 (바이너리 크기 최적화) | 낮음 | WASM 재빌드 시 |
