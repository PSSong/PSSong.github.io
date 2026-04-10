# WorldLens — Security & IP Protection

## IP 보호 전략

WorldLens의 핵심 알고리즘(투영 수식, 나선 생성, 분류 로직, 클러스터링)은 WASM 바이너리로 컴파일해 배포.

### 보호 수단

| 수단 | 적용 위치 | 효과 |
|------|-----------|------|
| Rust → WASM 컴파일 | `worldlens-core/src/lib.rs` | 바이너리 형태로 배포, 직접 열람 불가 |
| 소스맵 금지 | Hugo `js.Build` 설정 | `main.js` 번들의 원본 소스 맵핑 차단 |
| console.log/warn/debug 제거 | WASM 글루 코드 (`worldlens_core.js`) | 실행 흔적 최소화 |
| SRI hash (D3 / TopoJSON CDN) | `layouts/worldlens/list.html` | CDN 스크립트 무결성 검증 |
| WASM 글루 인라인 번들 | esbuild → `main.js` | 별도 `.js` 파일로 노출 안 됨 |

---

## 보호되는 로직

- **`project(lon, lat)`**: 방위등거리 좌표 변환 수식
- **`spiral_path(r, cw)`**: 아르키메데스 3팔 나선 경로 생성 알고리즘
- **`get_color(type, cls, country, selected_json)`**: 분류 기반 색상 결정 로직 (국가 선택 하이라이트 포함)
- **`is_visible(cls, filters_json)`**: 분류 필터 로직
- **`cluster_l1(coords, meta_json, filters_json)`**: L1 그리드 클러스터링 알고리즘

---

## JS에 노출되는 것 (보호 대상 아님)

| 항목 | 위치 | 이유 |
|------|------|------|
| 색상 상수 (`COLORS`, `HIGHLIGHT_HEX`) | `classify_colors.js` | DOM 렌더에 필요, SVG에서 직접 확인 가능 |
| SVG 구조 (`<g>`, `<circle>`, `<rect>`) | 브라우저 DOM | 렌더 결과는 원래 공개 정보 |
| 투영 상수 (`MAP_CENTER=500, MAP_RADIUS=478`) | `globe.js` | D3 basemap 렌더에 필요 |
| fetch URL, 데이터 형식 | `data_loader.js` | 공개 JSON 엔드포인트 |

---

## SRI 해시 (CDN 무결성)

`layouts/worldlens/list.html`에 고정된 SRI 해시:

```
D3 v7:
  URL: https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js
  integrity: sha384-CjloA8y00+1SDAUkjs099PVfnY2KmDC2BZnws9kh8D/lX1s46w6EPhpXdqMfjK6i

TopoJSON 3.0.2:
  URL: https://cdnjs.cloudflare.com/ajax/libs/topojson/3.0.2/topojson.min.js
  integrity: sha384-9dCJK6nh7skY14HrcvlLYlFga9/MehJjL9ONWRflmiXNRuf8p2jiF4Y5PR881PTq
```

CDN 라이브러리 버전 업그레이드 시 반드시 새 해시로 교체.

---

## console 출력 규칙

**금지:**
- `console.log`, `console.debug`, `console.info` — 프로덕션 코드에서 완전 금지
- IP 보호 로직의 실행 경로를 추적할 수 있는 모든 출력

**허용 (제한적):**
- `console.warn('[WorldLens] ...')` — 사용자에게 영향 있는 경고 (데이터 로드 실패, 자동 갱신 실패)
- `console.error('[WorldLens] ...')` — 복구 불가능한 에러

**WASM 글루 정리:**
wasm-pack 생성 `worldlens_core.js`에서 3개의 `console.warn` 제거 완료 (Phase 5, 커밋 `2acb7f7`).

---

## WASM 바이너리 빌드 옵션

`worldlens-core/Cargo.toml [profile.release]`:

```toml
opt-level = "z"      # 크기 최적화
lto = true           # 링크 타임 최적화
codegen-units = 1    # 최대 최적화 (병렬 컴파일 비활성)
debug = false        # 디버그 심볼 없음
strip = true         # 심볼 스트립
panic = "abort"      # 패닉 시 abort (unwind 제거)
wasm-opt = false     # 번들 wasm-opt 비활성 (bulk-memory 호환성 이슈)
```

`wasm-opt=false` 이유: rustc 1.94.1이 생성하는 bulk-memory WASM 명령어를 wasm-pack 번들 wasm-opt 버전이 지원하지 않아 빌드 실패. `wasm-opt`를 별도 설치해 수동 실행하면 최적화 가능하지만 현재는 비활성.

---

## 향후 보안 고려사항

- `data_loader.js` `CONFIG.dataUrl`: 현재 `/worldlens/positions.json` (정적 파일). R5 완료 후 raw.githubusercontent.com으로 전환 시 — 외부 URL이므로 SRI 또는 별도 검증 고려.
- WASM 재빌드 시: wasm-opt 문제 해결 여부 재확인 (`wasm-opt --version` 체크).
