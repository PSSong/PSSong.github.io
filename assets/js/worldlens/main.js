// 의존 모듈: globe.js, layers.js, interaction.js, data_loader.js
//            /js/worldlens/wasm/worldlens_core.js (WASM, 런타임 dynamic import)
// 피의존 모듈: 없음 (엔트리포인트)
// 변경 시 영향: SVG 구조 변경 시 interaction.js setupZoom() 그룹 참조 확인
//            WASM 경로(/js/worldlens/wasm/) 변경 시 static/ 동기화 필수

import { createProjection, createBasemap } from './globe.js';
import { LayerManager }                    from './layers.js';
import { setupZoom, setupTooltip, setupHover, setupCountrySelector } from './interaction.js';
import { loadPositions, loadPorts, loadTopo, startAutoRefresh }      from './data_loader.js';

async function init() {
  const svgEl   = document.getElementById('wl-svg');
  const zoomGEl = document.getElementById('wl-zoom-g');
  if (!svgEl || !zoomGEl) return;

  // ── WASM 초기화 (IP 보호 함수: project, spiral_path, get_color, is_visible, cluster_l1) ──
  try {
    const wl = await import('/js/worldlens/wasm/worldlens_core.js');
    await wl.default({ module_or_path: '/worldlens/wasm/worldlens_core_bg.wasm' });
    window.WL = wl;
  } catch (_) {
    const el = document.getElementById('wl-stats');
    if (el) el.textContent = 'Initialization failed — please refresh';
    return;
  }

  // ── 투영 초기화 ───────────────────────────────────────────────────────────────
  createProjection();

  // ── TopoJSON 로드 + 베이스맵 생성 ─────────────────────────────────────────────
  let topoData = null;
  try   { topoData = await loadTopo(); }
  catch (e) { console.warn('[WorldLens] TopoJSON load failed'); }
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
    lm.updateData(_capData(posData), portsData);
  } catch (e) {
    console.error('[WorldLens] Data load failed:', e);
    const el = document.getElementById('wl-stats');
    if (el) el.textContent = 'Data load failed — please try again later';
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
  startAutoRefresh(newData => lm.updateData(_capData(newData), null));
}

// ── 데이터 상한 안전망 (SVG 60fps 경계 5,000의 80% = 4,000) ─────────────────
const _CAP_TOTAL = 4000;
const _CAP = { aircraft: 1200, vessel: 1800, satellite: 1000 };

function _capData(posData) {
  if (!posData) return posData;
  const total = (posData.aircraft?.length ?? 0)
              + (posData.vessels?.length  ?? 0)
              + (posData.satellites?.length ?? 0);
  if (total <= _CAP_TOTAL) return posData;

  console.warn(`[WorldLens] ${total} items exceed cap ${_CAP_TOTAL} — per-layer caps applied`);
  return {
    ...posData,
    aircraft:   (posData.aircraft   || []).slice(0, _CAP.aircraft),
    vessels:    (posData.vessels    || []).slice(0, _CAP.vessel),
    satellites: (posData.satellites || []).slice(0, _CAP.satellite),
  };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
} else {
  init().catch(console.error);
}
