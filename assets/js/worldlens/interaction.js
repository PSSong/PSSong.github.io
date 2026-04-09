// 의존 모듈: globe.js (latLonToVec3 간접 사용)
// 피의존 모듈: main.js
// 변경 시 영향: 팝업 HTML 구조 변경 시 CSS custom.css 도 갱신

import { HIGHLIGHT_HEX } from './classify_colors.js';

const HOVER_PX = 28;  // 화면 픽셀 거리 임계값

// ── 툴팁 콘텐츠 생성 ──────────────────────────────────────────────────────────

function _tooltipHtml(type, item) {
  switch (type) {
    case 'aircraft':
      return `<b>${item.callsign || 'N/A'}</b>
        <div>국가: <em>${item.country || '-'}</em></div>
        <div>분류: <em>${item.classification || '-'}</em></div>
        <div>고도: ${item.alt != null ? Math.round(item.alt) + ' m' : '-'}</div>
        <div>출발국: ${item.origin_country || '-'}</div>`;
    case 'vessel':
      return `<b>${item.ship_name || 'N/A'}</b>
        <div>국가: <em>${item.country || '-'}</em></div>
        <div>분류: <em>${item.classification || '-'}</em></div>
        <div>선종: ${item.ship_type ?? '-'}</div>
        <div>속도: ${item.speed != null ? item.speed + ' kn' : '-'}</div>`;
    case 'satellite':
      return `<b>${item.name || 'N/A'}</b>
        <div>NORAD: ${item.norad_id || '-'}</div>
        <div>운영국: <em>${item.country || '-'}</em></div>
        <div>분류: <em>${item.classification || '-'}</em></div>`;
    case 'port':
      return `<b>${item.name || 'N/A'}</b>
        <div>국가: <em>${item.country || '-'}</em></div>
        <div>유형: ${item.type || '-'}</div>
        <div>코드: ${item.locode || '-'}</div>`;
    default:
      return '';
  }
}

// ── 툴팁 컨트롤러 ─────────────────────────────────────────────────────────────

export function setupTooltip() {
  const el = document.getElementById('wl-tooltip');
  if (!el) return { show: () => {}, hide: () => {} };
  return {
    show(x, y, html) {
      el.innerHTML = html;
      el.style.display = 'block';
      // 화면 오른쪽 경계 보정
      const pad  = 14;
      const maxX = window.innerWidth - el.offsetWidth - pad;
      el.style.left = Math.min(x + pad, maxX) + 'px';
      el.style.top  = (y - 10) + 'px';
    },
    hide() { el.style.display = 'none'; },
  };
}

// ── 호버 감지 (화면 좌표 투영 기반) ──────────────────────────────────────────

export function setupHover(camera, renderer, layerManager, tooltip) {
  const canvas  = renderer.domElement;
  let animFrame = null;
  let mouseX = -9999, mouseY = -9999;

  canvas.addEventListener('mousemove', e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    if (animFrame) return;
    animFrame = requestAnimationFrame(() => {
      animFrame = null;
      _detectHover(camera, canvas, layerManager, tooltip, mouseX, mouseY);
    });
  });

  canvas.addEventListener('mouseleave', () => tooltip.hide());
}

function _detectHover(camera, canvas, layerManager, tooltip, mx, my) {
  const rect     = canvas.getBoundingClientRect();
  const cx       = mx - rect.left;
  const cy       = my - rect.top;
  const thresh2  = HOVER_PX * HOVER_PX;

  const layers   = layerManager.getLayerData();
  let best = null, bestDist = Infinity;

  Object.entries(layers).forEach(([type, { items, geo }]) => {
    if (!items.length) return;
    const pos = geo.getAttribute('position');
    if (!pos) return;

    items.forEach((item, i) => {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      v.project(camera);
      // NDC → canvas 픽셀
      const sx = (v.x  + 1) / 2 * rect.width;
      const sy = (1 - v.y) / 2 * rect.height;
      // 지구 뒷면 제외 (z > 1 은 카메라 뒤)
      if (v.z > 1) return;
      const d2 = (sx - cx) ** 2 + (sy - cy) ** 2;
      if (d2 < thresh2 && d2 < bestDist) {
        bestDist = d2;
        best     = { type, item };
      }
    });
  });

  if (best) tooltip.show(mx, my, _tooltipHtml(best.type, best.item));
  else       tooltip.hide();
}

// ── 국가 선택기 ──────────────────────────────────────────────────────────────

export function setupCountrySelector(layerManager) {
  const input  = document.getElementById('wl-country-input');
  const chipsEl = document.getElementById('wl-country-chips');
  if (!input || !chipsEl) return;

  let selected = [];

  // datalist 자동완성
  const all    = layerManager.getAllItems();
  const cSet   = new Set();
  (all.aircraft   || []).forEach(a => a.country && cSet.add(a.country));
  (all.vessels    || []).forEach(v => v.country && cSet.add(v.country));
  (all.satellites || []).forEach(s => s.country && cSet.add(s.country));
  const countries = [...cSet].sort();

  const dl = document.createElement('datalist');
  dl.id = 'wl-country-list';
  countries.forEach(c => {
    const opt = document.createElement('option'); opt.value = c; dl.appendChild(opt);
  });
  document.body.appendChild(dl);
  input.setAttribute('list', 'wl-country-list');

  function render() {
    chipsEl.innerHTML = '';
    selected.forEach((code, idx) => {
      const chip       = document.createElement('span');
      chip.className   = 'wl-chip';
      chip.style.borderColor = HIGHLIGHT_HEX[idx];
      chip.style.color       = HIGHLIGHT_HEX[idx];
      chip.textContent = `${code} ×`;
      chip.onclick     = () => {
        selected = selected.filter(x => x !== code);
        layerManager.setSelectedCountries(selected);
        render();
      };
      chipsEl.appendChild(chip);
    });
  }

  input.addEventListener('change', () => {
    const val = input.value.trim().toUpperCase();
    input.value = '';
    if (!val) return;
    if (selected.includes(val)) return;
    if (selected.length >= 3) selected.shift();
    selected.push(val);
    layerManager.setSelectedCountries(selected);
    render();
  });
}
