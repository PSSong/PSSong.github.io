# WorldLens — Design Decisions (ADR)

각 결정은 ADR(Architecture Decision Record) 형식으로 기록. 번복 시 여기에 이유와 함께 갱신.

---

## ADR-01: 투영법 — Azimuthal Equidistant (북극 중심)

**결정:** D3 `geoAzimuthalEquidistant().rotate([0,-90])`, 북극 중심, 고정 회전. 사용자 회전 없음.

**배경:** UN 엠블럼과 동일한 투영. 전 지구 교통/물류 흐름을 단일 뷰에서 직관적으로 파악.

**기각된 대안:**
- Mercator: 고위도 왜곡 심함, 항공 경로가 부자연스럽게 보임
- Orthographic (구체): 뒷면 데이터 불가, 회전 UX 필요 → 모바일에서 복잡
- 인터랙티브 회전 AE: 사용자가 돌리다 방향을 잃음, 북극 고정이 데이터 해석에 유리

**구현 상수:** `MAP_CENTER=500, MAP_RADIUS=478` (SVG 1000×1000 기준). JS와 Rust 상수 반드시 동기화.

---

## ADR-02: 렌더러 — SVG 유지 (Canvas 미채택)

**결정:** D3 v7 + SVG `<circle>/<rect>/<path>`. Canvas/WebGL 미채택.

**이유:**
- 호버·툴팁: SVG 이벤트 위임(`pointer-events`)으로 raycasting 불필요
- 접근성: 스크린리더, aria 지원 용이
- 태풍 나선: `<path d="...">` SVG가 WASM 생성 d 문자열을 그대로 수용
- 클러스터링(4000 cap)으로 SVG 요소 수를 제어 — 60fps 유지 가능

**기각된 대안:**
- Canvas 2D: 히트 테스트 직접 구현 필요, 복잡도 상승
- WebGL (Three.js): 이전 버전에서 터치 불안정, 번들 크기 ~600 KB

**성능 한계:** 비클러스터 상태 5000+ 요소에서 60fps 미달 가능. `_capData()`로 4000 상한 적용.

---

## ADR-03: 도트 상한 4000 (레이어별 cap)

**결정:** 총 4000 dot (SVG 60fps 경계 5000의 80%). 레이어별: 항공 1200 / 선박 1800 / 위성 1000.

**근거:** Chrome/Safari에서 실측한 SVG 요소 수 vs 프레임 레이트. 80% 마진으로 여유 확보.

**동작:** `_capData()`에서 총량 초과 시 레이어별 상한으로 슬라이스. console.warn 발생.

**향후:** R5 파이프라인에서 수집기 단에서 cap을 적용하면 클라이언트 슬라이스 불필요.

---

## ADR-04: 태풍 아이콘 — 미니 나선 일괄, 강도는 색/크기

**결정:** 모든 태풍에 3팔 아르키메데스 나선 아이콘 적용. 강도(카테고리)는 색상 + 아이콘 크기로 표현.

**카테고리 스케일:**
- TD(열대저기압): R=8, `#88BBFF`
- TS(열대폭풍): R=11, `#AADDFF`
- 1→5: R=14/17/21/25/30, 색상 노랑→주황→빨강→진빨강

**나선 방향:** 북반구(basin 또는 lat≥0) → CW(시계방향), 남반구 → CCW. `_isNH()` 판별.

**기각된 대안:**
- 정적 이미지: 크기/색 조합이 동적 → 아이콘 수 폭증
- 단순 원: 태풍임을 직관적으로 인식하기 어려움

---

## ADR-05: 핵심 로직 Rust WASM 이식 (IP 보호)

**결정:** 투영 수식, 나선 생성, 색상 분류, 가시성 필터, 클러스터링 — 5개 함수를 Rust → WASM으로 이식.

**이유:** JS 소스는 DevTools에서 열람 가능. WASM 바이너리는 역공학 난이도가 높음. 핵심 알고리즘 보호.

**범위:** JS에 남는 것 — DOM 조작, D3 베이스맵, SVG 렌더, fetch, 이벤트. WASM — 수식/분류/집계.

**트레이드오프:** WASM 로딩 실패 시 전체 맵 비활성화. 허용 가능 — 핵심 기능이므로 fallback 없는 것이 올바른 동작.

**참고:** 색상 상수(`COLORS`, `HIGHLIGHT_HEX`)는 JS `classify_colors.js`에도 노출됨. UI 렌더링에 필요하며, IP 보호 대상이 아닌 것으로 판단.

---

## ADR-06: 클러스터링 — WASM 포함

**결정:** `cluster_l1()` (L1 그리드 집계)을 WASM에 포함.

**배경:** 세션 중 사용자가 명시적으로 포함을 승인 ("Wasm에 포함시키자").

**구현:** 입력 `Float64Array [lon0,lat0,...]` + meta JSON 배열 + filters JSON → 출력 JSON.  
TypedArray 선택 이유: JS→WASM 메모리 복사 비용을 문자열 직렬화 대비 최소화.

**트레이드오프:** 클러스터 포인트에 개별 item datum이 없음(인덱스만) → 클러스터 호버 정보 제한. 허용.

---

## ADR-07: D3 베이스맵 유지 — project()만 WASM 교체

**결정:** TopoJSON 대륙 렌더는 D3 `geoPath()` 유지. 개별 데이터 포인트의 `project(lon,lat)`만 WASM 위임.

**이유:** D3 geoPath는 수백 개의 복잡한 폴리곤 경로를 처리 — WASM으로 교체 시 TopoJSON 파싱까지 이식 필요. 편익 대비 비용이 너무 큼.

**결과:** `_proj` (D3 projection 객체)는 격자·대륙용으로만 유지. 데이터 포인트 좌표 변환만 WASM.

---

## ADR-08: i18n — 라이브러리 미도입, 단순 텍스트 치환

**결정:** i18n 라이브러리(i18next 등) 도입하지 않음. 한국어 → 영어 plain-text 치환.

**이유:** 대상 언어가 영어 단일. 라이브러리 추가 시 번들 크기 증가, Hugo 빌드 복잡도 상승.

**범위 (R8):** list.html UI 라벨, interaction.js 툴팁 필드, main.js 에러 메시지, data_loader.js console.

**컨벤션:** UI 라벨/범례/툴팁 필드 → Title Case. 사용자 에러 메시지 → Sentence case. Console → Sentence case.

---

## ADR-09: 코드 주석 — 한국어 유지

**결정:** `// Package ...`, `/** JSDoc */`, inline 주석은 한국어 그대로 유지.

**이유:** 코드 주석은 사용자(방문자)에게 노출되지 않음. 작성자 개발 언어가 한국어. 영어화 시 추가 가치 없음.

**범위 제외:** 모든 HTML/CSS 코드 주석, JS 주석, Rust 주석.
