// 의존 모듈: globe.js, layers.js, interaction.js, data_loader.js
// 피의존 모듈: 없음 (엔트리포인트)
// 변경 시 영향: SVG 구조 변경 시 interaction.js setupZoom() 그룹 참조 확인

import { createProjection, createBasemap } from './globe.js';
import { LayerManager }                    from './layers.js';
import { setupZoom, setupTooltip, setupHover, setupCountrySelector } from './interaction.js';
import { loadPositions, loadPorts, loadTopo, startAutoRefresh }      from './data_loader.js';

async function init() {
  const svgEl   = document.getElementById('wl-svg');
  const zoomGEl = document.getElementById('wl-zoom-g');
  if (!svgEl || !zoomGEl) return;

  // ── 투영 초기화 ───────────────────────────────────────────────────────────────
  createProjection();

  // ── TopoJSON 로드 + 베이스맵 생성 ─────────────────────────────────────────────
  let topoData = null;
  try   { topoData = await loadTopo(); }
  catch (e) { console.warn('[WorldLens] TopoJSON 로드 실패'); }
  createBasemap(document.getElementById('wl-basemap'), topoData, 1);

  // ── 레이어 매니저 초기화 ─────────────────────────────────────────────────────
  const lm = new LayerManager();
  lm.setGroups({
    aircraft:  d3.select('#wl-layer-aircraft'),
    vessel:    d3.select('#wl-layer-vessels'),
    satellite: d3.select('#wl-layer-satellites'),
    port:      d3.select('#wl-layer-ports'),
    typhoon:   d3.select('#wl-layer-typhoons'),
    labels:    d3.select('#wl-labels'),
  });

  // ── 모바일 기본 레이어 OFF (항공·선박·위성) ────────────────────────────────────
  if (window.matchMedia('(max-width: 768px)').matches) {
    ['aircraft', 'vessel', 'satellite'].forEach(k => {
      lm.setLayerVisible(k, false);
      const cb = document.getElementById(`wl-layer-${k}`);
      if (cb) cb.checked = false;
    });
  }

  // ── 데이터 로드 ───────────────────────────────────────────────────────────────
  try {
    const [posData, portsData] = await Promise.all([loadPositions(), loadPorts()]);
    lm.updateData(posData, portsData);
  } catch (e) {
    console.error('[WorldLens] 데이터 로드 실패:', e);
    const el = document.getElementById('wl-stats');
    if (el) el.textContent = '데이터 로드 실패 — 잠시 후 새로고침';
  }

  // ── 인터랙션 설정 ────────────────────────────────────────────────────────────
  const tooltip = setupTooltip();
  setupZoom(svgEl, zoomGEl, lm);
  setupHover(svgEl, tooltip);
  setupCountrySelector(lm);

  // ── 분류 필터 체크박스 ────────────────────────────────────────────────────────
  ['civilian', 'unknown', 'military'].forEach(cls => {
    const cb = document.getElementById(`wl-filter-${cls}`);
    if (cb) cb.addEventListener('change', () => lm.setFilter(cls, cb.checked));
  });

  // ── 레이어 토글 체크박스 ──────────────────────────────────────────────────────
  ['aircraft', 'vessel', 'satellite', 'typhoon', 'port'].forEach(layer => {
    const cb = document.getElementById(`wl-layer-${layer}`);
    if (cb) cb.addEventListener('change', () => lm.setLayerVisible(layer, cb.checked));
  });

  // ── 5분 자동 갱신 ────────────────────────────────────────────────────────────
  startAutoRefresh(newData => lm.updateData(newData, null));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
} else {
  init().catch(console.error);
}
