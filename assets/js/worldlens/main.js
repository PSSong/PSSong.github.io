// 의존 모듈: globe.js, layers.js, interaction.js, data_loader.js
// 피의존 모듈: 없음 (엔트리포인트)
// 변경 시 영향: 씬 구조·카메라 위치 변경 시 interaction.js 투영 계산도 확인

import { createGlobe }                              from './globe.js';
import { LayerManager }                             from './layers.js';
import { setupTooltip, setupHover, setupCountrySelector } from './interaction.js';
import { loadPositions, loadPorts, loadTopo, startAutoRefresh } from './data_loader.js';

async function init() {
  const canvas = document.getElementById('worldlens-canvas');
  if (!canvas) return;

  // ── 씬 ──────────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080810);

  // ── 카메라 — 북극 바로 위 (y+) ──────────────────────────────────────────────
  const w = canvas.clientWidth  || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const camera = new THREE.PerspectiveCamera(42, w / h, 0.01, 100);
  camera.position.set(0, 3.2, 0.001);
  camera.lookAt(0, 0, 0);

  // ── 렌더러 ───────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h, false);

  // ── 조명 ────────────────────────────────────────────────────────────────────
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff8e8, 0.9);
  sun.position.set(5, 8, 4);
  scene.add(sun);

  // ── OrbitControls — 회전만 허용 (zoom·pan 비활성) ────────────────────────────
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableZoom   = false;
  controls.enablePan    = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;

  // ── 레이어 매니저 ────────────────────────────────────────────────────────────
  const layerManager = new LayerManager(scene);

  // ── TopoJSON 지구 생성 ───────────────────────────────────────────────────────
  let topoData = null;
  try   { topoData = await loadTopo(); }
  catch (e) { console.warn('[WorldLens] TopoJSON 로드 실패:', e.message); }
  createGlobe(scene, topoData);

  // ── 위치·항구 데이터 로드 ────────────────────────────────────────────────────
  try {
    const [posData, portsData] = await Promise.all([loadPositions(), loadPorts()]);
    layerManager.updateData(posData, portsData);

    // UI 인터랙션 설정
    const tooltip = setupTooltip();
    setupHover(camera, renderer, layerManager, tooltip);
    setupCountrySelector(layerManager);

    // 분류 필터 체크박스
    ['civilian', 'unknown', 'military'].forEach(cls => {
      const cb = document.getElementById(`wl-filter-${cls}`);
      if (cb) cb.addEventListener('change', () => layerManager.setFilter(cls, cb.checked));
    });

    // 5분 자동 갱신
    startAutoRefresh(newData => layerManager.updateData(newData, null));
  } catch (e) {
    console.error('[WorldLens] 데이터 로드 실패:', e);
    const el = document.getElementById('wl-stats');
    if (el) el.textContent = '데이터 로드 실패 — 잠시 후 새로고침 해주세요.';
  }

  // ── 반응형 리사이즈 ──────────────────────────────────────────────────────────
  function onResize() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    renderer.setSize(cw, ch, false);
  }
  window.addEventListener('resize', onResize);

  // ── 애니메이션 루프 ──────────────────────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

// DOMContentLoaded 이후 또는 이미 로드된 경우 즉시 실행
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => init().catch(console.error));
} else {
  init().catch(console.error);
}
