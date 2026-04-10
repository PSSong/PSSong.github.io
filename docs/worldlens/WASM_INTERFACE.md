# WorldLens WASM Interface

## 크레이트 정보

- 이름: `worldlens-core` (`worldlens-core/Cargo.toml`)
- 타입: `cdylib` (동적 라이브러리 → WASM)
- 의존: `wasm-bindgen = "0.2"` (serde 미사용)
- Rust edition: 2021

## 빌드

```bash
cd worldlens-core
wasm-pack build --target web --release
```

산출물:
- `pkg/worldlens_core.js` → `assets/js/worldlens/wasm/worldlens_core.js` (Hugo esbuild 번들)
- `pkg/worldlens_core_bg.wasm` → `static/worldlens/wasm/worldlens_core_bg.wasm` (Hugo static 서빙)

**주의:** `wasm-opt = false` (Cargo.toml `[package.metadata.wasm-pack.profile.release]`). wasm-pack 번들 wasm-opt가 rustc 1.94.1 생성 bulk-memory 명령어를 지원하지 않아 비활성화.

## 공개 API — 5개 함수

### 1. `project(lon, lat) → [x, y]`

경위도 → SVG 좌표 변환 (Azimuthal Equidistant, 북극 중심).

```
입력: lon: f64 (경도, °), lat: f64 (위도, °)
출력: Vec<f64> [x, y]  (SVG 내부 단위, MAP_CENTER=500 기준)
```

JS 호출:
```js
const pt = window.WL.project(lon, lat);
// pt: Float64Array [x, y]
```

상수 (Rust/JS 동기화 필수):
- `MAP_CENTER = 500.0`
- `MAP_RADIUS = 478.0`

### 2. `spiral_path(r, cw) → SVG path d`

태풍 3팔 아르키메데스 나선 SVG path 생성.

```
입력: r: f64 (최대 반지름, SVG 단위), cw: bool (true=CW=북반구)
출력: String (SVG <path d="...">에 직접 삽입)
```

JS 호출:
```js
const d = window.WL.spiral_path(R, isNorthHemisphere);
svgPathEl.setAttribute('d', d);
```

내부 상수: `ARMS=3, TURNS=1.5, STEPS=32`

### 3. `get_color(type_, cls, country, selected_json) → CSS color`

타입·분류·국가·선택 국가 배열 기반 색상 결정.

```
입력:
  type_: &str        ("aircraft" | "vessel" | "satellite" | "port" | "typhoon")
  cls: &str          분류값 (타입별 상이, 아래 참조)
  country: &str      국가 코드 (예: "KR")
  selected_json: &str JSON 배열 문자열 (예: '["KR","US"]' 또는 '[]')

출력: String (CSS 색상, 예: "#00DDFF" 또는 "rgba(255,255,255,0.06)")
```

cls 값 (타입별):
- aircraft/vessel/satellite: `"civilian"` | `"unknown"` | `"military"`
- port: `"mega"` | `"major"` | `"regional"` | `"minor"`
- typhoon: `"TD"` | `"TS"` | `"1"` ~ `"5"`

선택 국가 처리: `selected_json`이 비어있지 않으면 — 일치 국가는 HIGHLIGHT 색상 순환, 불일치 국가는 dimmed (`rgba(255,255,255,0.06)`).

JS 호출:
```js
const color = window.WL.get_color(type, cls, country, JSON.stringify(selectedArr));
```

### 4. `is_visible(cls, filters_json) → bool`

분류 필터 통과 여부.

```
입력:
  cls: &str          "civilian" | "unknown" | "military"
  filters_json: &str JSON 객체 문자열 (예: '{"civilian":true,"unknown":false,"military":true}')

출력: bool
```

JS 호출:
```js
const visible = window.WL.is_visible(cls, JSON.stringify(filtersObj));
```

### 5. `cluster_l1(coords, meta_json, filters_json) → JSON`

L1 그리드 클러스터링. 그리드 셀에 `CLUSTER_THRESH` 이상 포인트가 모이면 클러스터로 집계.

```
입력:
  coords: &[f64]     Float64Array [lon0,lat0, lon1,lat1, ...] (pairs, 짝수 길이)
  meta_json: &str    JSON 배열 [{cls, country, type}, ...]  (coords와 같은 인덱스)
  filters_json: &str JSON 객체 {"civilian":bool, ...}

출력: String — JSON
{
  "clusters": [
    {
      "x": f64,       // 클러스터 중심 SVG x
      "y": f64,       // 클러스터 중심 SVG y
      "count": usize, // 포인트 수
      "cls": str,     // 대표 분류 ("civilian"|"unknown"|"military")
      "country": str  // 대표 국가 코드
    },
    ...
  ],
  "points": [
    {
      "x": f64,
      "y": f64,
      "idx": usize    // 원본 items 배열 인덱스 (datum 조회용)
    },
    ...
  ]
}
```

클러스터링 상수:
- `CLUSTER_CELL = 38.0` (SVG 단위 그리드 셀 크기)
- `CLUSTER_THRESH = 3` (클러스터 최소 포인트 수)

JS 호출:
```js
const coords = new Float64Array(items.length * 2);
items.forEach((item, i) => {
  coords[i * 2]     = item.lon;
  coords[i * 2 + 1] = item.lat;
});
const meta = items.map(item => ({ cls: item.classification, country: item.country, type }));
const result = JSON.parse(window.WL.cluster_l1(coords, JSON.stringify(meta), JSON.stringify(filters)));
// result.clusters → 클러스터 배지 렌더
// result.points   → 개별 도트 렌더 (result.points[i].idx로 items[idx] 조회)
```

---

## WASM 초기화 (JS)

```js
const wl = await import('/js/worldlens/wasm/worldlens_core.js');
await wl.default({ module_or_path: '/worldlens/wasm/worldlens_core_bg.wasm' });
window.WL = wl;
```

`module_or_path` 객체 형식 사용 (문자열 직접 전달은 wasm-bindgen deprecation).

WASM 파일 서빙 구조:
- JS 글루: `assets/js/worldlens/wasm/worldlens_core.js` → esbuild가 `main.js`에 인라인 번들
- WASM 바이너리: `static/worldlens/wasm/worldlens_core_bg.wasm` → `/worldlens/wasm/worldlens_core_bg.wasm`
- MIME: `hugo.toml`에 `application/wasm` 등록 (Hugo dev server용)

---

## WASM 재빌드 절차

1. `cd worldlens-core && wasm-pack build --target web --release`
2. `cp pkg/worldlens_core.js ../assets/js/worldlens/wasm/`
3. `cp pkg/worldlens_core.d.ts ../assets/js/worldlens/wasm/`
4. `cp pkg/worldlens_core_bg.wasm ../static/worldlens/wasm/`
5. `cp pkg/worldlens_core_bg.wasm.d.ts ../assets/js/worldlens/wasm/`
6. `rm assets/js/worldlens/wasm/.gitignore` (wasm-pack이 자동 생성하는 `*` gitignore 제거)
7. Hugo 빌드 확인: `hugo --minify`
