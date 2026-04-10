# WorldLens — Overview

**라이브 URL:** https://pssong.github.io/worldlens/  
**저장소:** PSSong/PSSong.github.io (`main` 브랜치)  
**최종 배포:** 2026-04-10 (PR #1, 커밋 `923933e`)

---

## 목적

pssong.github.io 블로그의 인터랙티브 지구 추적 페이지. 실시간 항공/선박/위성/태풍/항구 데이터를 북극 중심 방위등거리도법(Azimuthal Equidistant) 2D 지도에 시각화.

---

## 3D → 2D 전환 배경

| 항목 | 이전 (Three.js 3D) | 현재 (D3 + SVG 2D) |
|------|-------------------|-------------------|
| 렌더러 | WebGL `THREE.SphereGeometry` | D3 v7 + SVG `<circle>/<rect>` |
| 투영 | 인터랙티브 회전 구체 | AE 북극 중심 고정 |
| 의존성 | Three.js (~600 KB) | D3 + TopoJSON CDN |
| 클러스터링 | 없음 | L1 그리드 클러스터 (WASM) |
| IP 보호 | 없음 | Rust WASM (5함수) |
| 모바일 지원 | 제한적 | 375px 반응형 완비 |

전환 이유: Three.js WebGL 환경에서 터치/핀치 처리가 불안정하고, SVG 기반이 접근성·SEO에 유리하며, 투영 수식을 WASM으로 이식해 IP 보호가 가능.

---

## 라운드별 구현 이력

| 라운드 | 내용 | 상태 |
|--------|------|------|
| R1 | 팀장 분석 — 아키텍처 방향 결정, D3 AE 투영 채택 | ✅ |
| R2 | dev-critic 검토 — SVG vs Canvas 비교, 클러스터링 설계 | ✅ |
| R3 | risk-reviewer 사전 평가 — 성능 한계(4000 dot), 모바일 UX | ✅ |
| R4 | 구현 — globe.js/layers.js/interaction.js/main.js/list.html 전면 재작성, 태풍 나선 아이콘 | ✅ |
| Phase 5 | 빌드 보안 — SRI hash 추가, console.warn 제거, gitignore 정리 | ✅ |
| R7 | Rust WASM IP 보호 — 5함수 이식, wasm-pack 빌드, Hugo 정적 서빙 | ✅ |
| R8 | 영어화 — UI 27개 문자열 전환 (i18n 라이브러리 미사용) | ✅ |
| R5 | 파이프라인 4000 cap 지원 (`~/Desktop/WorldLens/` 수집기) | ⏳ 별도 세션 |

---

## 주요 파일 위치

```
assets/js/worldlens/          JS 모듈 (esbuild 번들)
  main.js                     엔트리포인트
  globe.js                    AE 투영, 베이스맵
  layers.js                   데이터 레이어, 클러스터링
  classify_colors.js          색상/가시성 (WASM 바인딩)
  interaction.js              줌, 팬, 툴팁, 국가 선택
  data_loader.js              fetch + 자동 갱신
  wasm/worldlens_core.js      WASM JS 글루 (wasm-pack 생성)

static/worldlens/wasm/
  worldlens_core_bg.wasm      WASM 바이너리 (63 KB)

worldlens-core/               Rust 크레이트
  src/lib.rs                  5개 #[wasm_bindgen] 함수

layouts/worldlens/list.html   독립형 HTML (PaperMod 비의존)
```

---

## 데이터 파이프라인

```
~/Desktop/WorldLens/ (Python 수집기, 별도 세션)
  → positions.json (항공/선박/위성)
  → ports.json (항구 목록)
  → static/worldlens/ 복사 or GitHub Pages 정적 서빙

브라우저
  → /worldlens/positions.json (5분 자동 갱신)
  → /worldlens/ports.json (초기 1회)
  → world-atlas CDN (TopoJSON, 초기 1회)
```

R5 완료 후: `raw.githubusercontent.com` URL로 전환 예정 (`data_loader.js` CONFIG.dataUrl).

---

→ 상세 아키텍처: [ARCHITECTURE.md](./ARCHITECTURE.md)  
→ 설계 결정사항: [DESIGN_DECISIONS.md](./DESIGN_DECISIONS.md)  
→ WASM 인터페이스: [WASM_INTERFACE.md](./WASM_INTERFACE.md)  
→ 보안: [SECURITY.md](./SECURITY.md)  
→ 변경 이력: [CHANGELOG.md](./CHANGELOG.md)
