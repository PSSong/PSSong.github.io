# pssong-blog — Architecture

Hugo 정적 사이트. GitHub Pages (`pssong.github.io`) 배포.

## 전체 구조

```
hugo.toml                   사이트 설정 (PaperMod 테마, 메뉴, 출력 포맷)
content/                    마크다운 포스트 (categories별 분류)
layouts/                    Hugo 템플릿 오버라이드
  worldlens/list.html       WorldLens 전용 독립형 HTML (PaperMod 비의존)
assets/                     Hugo asset pipeline (esbuild)
  js/worldlens/             WorldLens JS 모듈 (아래 참조)
static/                     정적 파일 패스스루
  worldlens/wasm/           WASM 바이너리
  worldlens/positions.json  실시간 데이터 (파이프라인 산출)
  worldlens/ports.json      항구 목록
themes/PaperMod/            PaperMod 서브모듈
worldlens-core/             Rust WASM 크레이트
docs/                       프로젝트 문서
  worldlens/                WorldLens 상세 문서
```

## 주요 섹션

### 블로그 포스트
- `content/posts/` — 마크다운 포스트
- 카테고리: geopolitics / economy / tech-policy / market-signals / weekly-digest
- Hugo paginate=10, buildFuture=true

### WorldLens 대화형 지도
- URL: `/worldlens/`
- JS 모듈: `assets/js/worldlens/` (6개 모듈 + WASM 글루)
- Rust WASM: `worldlens-core/` → `static/worldlens/wasm/`
- 상세: `docs/worldlens/ARCHITECTURE.md`

### 검색
- Hugo JSON 출력 (`[outputs] home = ["HTML","RSS","JSON"]`)
- FuseOpts 설정: `hugo.toml [params.fuseOpts]`

## 의존 방향

```
브라우저
  → /worldlens/ (layouts/worldlens/list.html)
      → D3 v7 CDN + TopoJSON CDN (SRI hash 고정)
      → /js/worldlens/main.js (Hugo esbuild bundle)
          → window.WL = import('/js/worldlens/wasm/worldlens_core.js')
          → fetch('/worldlens/wasm/worldlens_core_bg.wasm')

  → / (PaperMod 테마)
      → content/posts/** (마크다운)
```

## GitHub Actions

`.github/workflows/` — Hugo 빌드 + GitHub Pages 배포 (push to main 트리거).  
빌드 시간: 평균 25-30초.

## 문서 위치

| 문서 | 위치 |
|------|------|
| WorldLens 개요 | `docs/worldlens/OVERVIEW.md` |
| WorldLens 모듈 구조 | `docs/worldlens/ARCHITECTURE.md` |
| WorldLens 설계 결정 | `docs/worldlens/DESIGN_DECISIONS.md` |
| WorldLens WASM API | `docs/worldlens/WASM_INTERFACE.md` |
| WorldLens 보안 | `docs/worldlens/SECURITY.md` |
| WorldLens 변경 이력 | `docs/worldlens/CHANGELOG.md` |
