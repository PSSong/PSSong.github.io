# WorldLens — Module Architecture

## 모듈 구조

```
layouts/worldlens/list.html        HTML 쉘 (독립형, PaperMod 비의존)
  │  D3 v7 + TopoJSON CDN (SRI hash 고정)
  │  Hugo js.Build → /js/worldlens/main.js (esbuild bundle, es2020)
  │
assets/js/worldlens/
  ├── main.js           엔트리포인트 (WASM 초기화, 조립)
  ├── globe.js          AE 투영, 베이스맵, 격자
  ├── layers.js         SVG 데이터 레이어, 클러스터링
  ├── classify_colors.js 색상/가시성 (WASM 얇은 바인딩)
  ├── interaction.js    줌/팬/툴팁/국가선택
  ├── data_loader.js    fetch, 자동 갱신
  └── wasm/
      ├── worldlens_core.js      JS 글루 (wasm-pack 생성, 인라인 번들)
      ├── worldlens_core.d.ts    타입 선언
      └── worldlens_core_bg.wasm.d.ts

static/worldlens/wasm/
  └── worldlens_core_bg.wasm     바이너리 (Hugo static 서빙)

worldlens-core/                   Rust 크레이트
  ├── Cargo.toml
  ├── Cargo.lock
  └── src/lib.rs                  5개 #[wasm_bindgen] 공개 함수
```

---

## 의존 방향

```
main.js
  ├── globe.js          (createProjection, createBasemap)
  ├── layers.js         (LayerManager)
  │     ├── globe.js    (project, getPath, MAP_SIZE)
  │     └── classify_colors.js (getColor, isVisible, ...)
  ├── interaction.js    (setupZoom, setupTooltip, setupHover, setupCountrySelector)
  │     └── classify_colors.js (getColor)
  └── data_loader.js    (loadPositions, loadPorts, loadTopo, startAutoRefresh)

window.WL (WASM, 런타임 동적 import)
  ← classify_colors.js  (get_color, is_visible)
  ← globe.js            (project)
  ← layers.js           (spiral_path, cluster_l1)
```

규칙: 의존은 단방향(위→아래). `interaction.js` ↔ `layers.js` 간 직접 참조 없음 — `main.js`가 중재.

---

## 모듈별 책임

### `main.js`
- WASM 초기화 (`import('/js/worldlens/wasm/worldlens_core.js')` → `window.WL`)
- 모든 모듈 조립: projection → basemap → LayerManager → 인터랙션 → 데이터 로드
- 모바일 기본 레이어 OFF (항공·선박·위성, `matchMedia('max-width: 768px')`)
- `_capData()`: 총 4000 / 레이어별 상한(항공 1200, 선박 1800, 위성 1000) 안전망

### `globe.js`
- D3 `geoAzimuthalEquidistant().rotate([0,-90])` 투영 초기화
- `project(lon, lat)`: `window.WL.project()` 위임, null-safe 래퍼
- `createBasemap()`: TopoJSON 대륙면, 격자(자오선·위선), 외곽 링, 극점, 경도 라벨
- `updateGraticule(zoomLevel)`: 줌 레벨별 격자 밀도 조정 (L1: 15°, L2: 15°+11위선, L3: +보조격자)
- **주의:** `MAP_CENTER=500`, `MAP_RADIUS=478` 은 `worldlens-core/src/lib.rs` 상수와 반드시 동기화

### `layers.js` — `LayerManager` 클래스
- `setGroups()`: SVG `<g>` 그룹 주입 (aircraft/vessel/satellite/port/typhoon/labels)
- `updateData(posData, portsData)`: 전체 레이어 갱신
- `setLayerVisible(layer, bool)`: 레이어 토글
- `setFilter(cls, bool)`: civilian/unknown/military 분류 필터
- `onZoom(level)`: 줌 레벨 변경 시 클러스터링·라벨 재계산
- `_renderClustered()`: WASM `cluster_l1()` 호출, 클러스터/싱글 포인트 분기 렌더
- `_renderTyphoons()`: 태풍 나선 아이콘 (`_spiralPath()` → WASM `spiral_path()`)
- `_renderLabels()`: L3에서만 항공·선박 콜사인/선명 라벨

### `classify_colors.js`
- `COLORS`, `HIGHLIGHT_HEX`: 색상 상수 (JS 노출 — WASM 내부에도 동일 상수 존재)
- `getColor(type, item, selectedCountries)`: `window.WL.get_color()` 위임
- `isVisible(item, filters)`: `window.WL.is_visible()` 위임
- `getPortHalfSize(portType)`, `getTyphoonRadius(category)`: 크기 헬퍼 (JS 유지)

### `interaction.js`
- `setupZoom()`: d3.zoom 3단계 스냅 (L1×1/L2×2/L3×4), 핀치/휠/키보드, URL `#z=N`
- `setupTooltip()`: `<div id=wl-tooltip>` 생성·관리
- `setupHover()`: SVG 이벤트 위임 (`.wl-pt` 클래스), 태풍 예측 경로 고정/해제
- `_tooltipHtml(type, item)`: 타입별 HTML 조각 생성
- `setupCountrySelector()`: 국가 칩 추가/제거 → `lm.setSelectedCountries()`

### `data_loader.js`
- `loadPositions()`, `loadPorts()`, `loadTopo()`: `fetchWithRetry()` (지수 백오프, 최대 3회)
- `startAutoRefresh(onUpdate)`: 5분 인터벌 갱신
- **현재 URL**: `/worldlens/positions.json` (정적 파일) → R5 완료 시 raw.githubusercontent.com 전환

### `worldlens-core` (Rust)
- 5개 `#[wasm_bindgen]` 공개 함수: `project`, `spiral_path`, `get_color`, `is_visible`, `cluster_l1`
- 의존성: `wasm-bindgen = "0.2"` 외 없음 (serde 미사용, 수동 JSON 파싱으로 바이너리 최소화)
- 빌드: `wasm-pack build --target web --release` in `worldlens-core/`
- 산출물: `assets/js/worldlens/wasm/worldlens_core.js` (JS 글루) + `static/worldlens/wasm/worldlens_core_bg.wasm` (바이너리)

---

## JS ↔ WASM 경계

```
JS (브라우저)                    WASM (Rust)
──────────────────────────────────────────────
project(lon: f64, lat: f64)  →  Vec<f64> [x, y]
spiral_path(r: f64, cw: bool) → String (SVG path d)
get_color(type, cls, country, selected_json: &str) → String (CSS color)
is_visible(cls: &str, filters_json: &str) → bool
cluster_l1(coords: Float64Array, meta_json, filters_json) → String (JSON)
```

`cluster_l1` 입력: `Float64Array [lon0,lat0, lon1,lat1, ...]` + `meta_json` 배열 + `filters_json`.  
출력: JSON `{ clusters: [{x,y,count,cls,country}], points: [{x,y,item_index}] }`.

---

## HTML → Hugo 빌드 파이프라인

```
layouts/worldlens/list.html
  → {{ $js := resources.Get "js/worldlens/main.js" | js.Build (target es2020, minify) }}
  → /js/worldlens/main.js (정적 서빙)

static/worldlens/wasm/worldlens_core_bg.wasm
  → /worldlens/wasm/worldlens_core_bg.wasm (Hugo static 패스스루)

hugo.toml: [mediaTypes."application/wasm"] suffixes=["wasm"]  — MIME 타입 등록
```
