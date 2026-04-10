// Package interaction: d3.zoom 3-level + 팬 + hover + 키보드 + URL 해시 + 국가 선택기
// 의존: d3 (global), classify_colors.js
// 피의존: main.js
// 변경 시 영향: MAP_CENTER/MAP_RADIUS 변경 시 _panExtent 재계산 필요

import { HIGHLIGHT_HEX } from './classify_colors.js';
import { MAP_CENTER, MAP_RADIUS, MAP_SIZE } from './globe.js';

const ZOOM_SCALES = [1, 2, 4];
const TRANSITION_MS = 380;

// ── 줌 컨트롤러 ─────────────────────────────────────────────────────────────────
// 호출자: main.js → setupZoom(svgEl, zoomGroupEl, layerManager)

export function setupZoom(svgEl, zoomGroupEl, layerManager) {
  const svg   = d3.select(svgEl);
  const zoomG = d3.select(zoomGroupEl);
  let level   = _readURLLevel();

  const zoom = d3.zoom()
    .scaleExtent([0.95, 4.2])
    .filter(event => {
      // 마우스 휠(핀치 아닌 것)은 JS로 직접 처리, 여기서 제외
      if (event.type === 'wheel' && !event.ctrlKey) return false;
      return true;
    })
    .on('zoom', ({ transform }) => {
      zoomG.attr('transform', transform);
    });

  // 마우스 휠 → 이산 레벨 이동
  svgEl.addEventListener('wheel', e => {
    if (e.ctrlKey) return; // 핀치는 d3.zoom이 처리
    e.preventDefault();
    _setLevel(e.deltaY < 0 ? Math.min(3, level + 1) : Math.max(1, level - 1));
  }, { passive: false });

  // 키보드 접근성
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === '+' || e.key === '=') _setLevel(Math.min(3, level + 1));
    if (e.key === '-')                   _setLevel(Math.max(1, level - 1));
    if (e.key === '0')                   _setLevel(1);
  });

  svg.call(zoom);

  // 줌 버튼 UI
  document.getElementById('wl-zoom-in')?.addEventListener('click',  () => _setLevel(Math.min(3, level + 1)));
  document.getElementById('wl-zoom-out')?.addEventListener('click', () => _setLevel(Math.max(1, level - 1)));
  document.querySelectorAll('.wl-zlvl').forEach(btn => {
    btn.addEventListener('click', () => _setLevel(Number(btn.dataset.level)));
  });

  // 초기 레벨 적용
  _applyLevel(level, true);

  function _setLevel(newLevel) {
    if (newLevel === level) return;
    level = newLevel;
    _applyLevel(level, false);
  }

  function _applyLevel(lv, instant) {
    const k  = ZOOM_SCALES[lv - 1];
    // (MAP_CENTER, MAP_CENTER) = 북극을 고정점으로 스케일 (scaleTo 대신 명시적 transform)
    const tx = MAP_CENTER * (1 - k);
    const ty = MAP_CENTER * (1 - k);
    const target = d3.zoomIdentity.translate(tx, ty).scale(k);

    // translateExtent: Infinity는 d3 constrain()에서 NaN 유발 → 큰 유한값 사용
    zoom.translateExtent([[-1e6, -1e6], [1e6, 1e6]]);

    if (instant) {
      svg.call(zoom.transform, target);
    } else {
      svg.transition().duration(TRANSITION_MS).ease(d3.easeCubicInOut)
         .call(zoom.transform, target);
    }

    _updateZoomUI(lv);
    _writeURLLevel(lv);
    layerManager.setZoomLevel(lv);
  }

  return { setLevel: _setLevel };
}

function _updateZoomUI(level) {
  document.querySelectorAll('.wl-zlvl').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.level) === level);
  });
}

function _readURLLevel() {
  const hash = window.location.hash;
  const m    = hash.match(/z=([123])/);
  return m ? Number(m[1]) : 1;
}

function _writeURLLevel(level) {
  const hash = `#z=${level}`;
  if (window.location.hash !== hash) {
    history.replaceState(null, '', hash);
  }
}

// ── 툴팁 ────────────────────────────────────────────────────────────────────────

export function setupTooltip() {
  const el = document.getElementById('wl-tooltip');
  if (!el) return { show: () => {}, hide: () => {} };

  return {
    show(x, y, html) {
      el.innerHTML   = html;
      el.style.display = 'block';
      const pad  = 14;
      const maxX = window.innerWidth  - el.offsetWidth  - pad;
      const maxY = window.innerHeight - el.offsetHeight - pad;
      el.style.left = Math.min(x + pad, maxX) + 'px';
      el.style.top  = Math.min(y - 10,  maxY) + 'px';
    },
    hide() { el.style.display = 'none'; },
  };
}

// ── 호버 (SVG 이벤트 기반 — raycasting 불필요) ────────────────────────────────

export function setupHover(svgEl, tooltip) {
  const svg = d3.select(svgEl);

  // 이벤트 위임: wl-pt 클래스가 있는 모든 SVG 요소
  svg.on('mouseover', event => {
    const el = event.target.closest('.wl-pt');
    if (!el) { tooltip.hide(); return; }
    const data = d3.select(el).datum();
    if (!data) return;
    tooltip.show(event.clientX, event.clientY, _tooltipHtml(data.type, data.item));
  });

  svg.on('mousemove', event => {
    const el = event.target.closest('.wl-pt');
    if (!el) return;
    tooltip.show(event.clientX, event.clientY,
      _tooltipHtml(d3.select(el).datum()?.type, d3.select(el).datum()?.item));
  });

  svg.on('mouseout', event => {
    if (!event.target.closest('.wl-pt')) tooltip.hide();
  });

  // 모바일 탭
  svg.on('click', event => {
    const el = event.target.closest('.wl-pt');
    if (!el) { tooltip.hide(); return; }
    const data = d3.select(el).datum();
    if (data) tooltip.show(event.clientX, event.clientY, _tooltipHtml(data.type, data.item));
  });
}

function _tooltipHtml(type, item) {
  if (!item) return '';
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
        <div>등급: ${item.type || '-'}</div>
        <div>코드: ${item.locode || '-'}</div>`;
    case 'typhoon':
      return `<b>${item.name || '태풍'}</b>
        <div>카테고리: <em>Cat ${item.category ?? '-'}</em></div>
        <div>풍속: ${item.wind_speed_kt != null ? item.wind_speed_kt + ' kt' : '-'}</div>
        <div>위치: ${item.lat?.toFixed(1)}°N, ${item.lon?.toFixed(1)}°</div>`;
    default: return '';
  }
}

// ── 국가 선택기 ─────────────────────────────────────────────────────────────────

export function setupCountrySelector(layerManager) {
  const input   = document.getElementById('wl-country-input');
  const chipsEl = document.getElementById('wl-country-chips');
  if (!input || !chipsEl) return;

  let selected = [];

  // datalist 자동완성
  const all  = layerManager.getAllItems();
  const cSet = new Set();
  ['aircraft', 'vessels', 'satellites'].forEach(key =>
    (all[key] || []).forEach(it => it.country && cSet.add(it.country)));
  const dl = document.createElement('datalist');
  dl.id = 'wl-country-list';
  [...cSet].sort().forEach(c => {
    const opt = document.createElement('option'); opt.value = c; dl.appendChild(opt);
  });
  document.body.appendChild(dl);
  input.setAttribute('list', 'wl-country-list');

  function render() {
    chipsEl.innerHTML = '';
    selected.forEach((code, idx) => {
      const chip = document.createElement('span');
      chip.className = 'wl-chip';
      chip.style.cssText = `border-color:${HIGHLIGHT_HEX[idx]};color:${HIGHLIGHT_HEX[idx]};background:${HIGHLIGHT_HEX[idx]}18`;
      chip.textContent = `${code} ×`;
      chip.onclick = () => {
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
    if (!val || selected.includes(val)) return;
    if (selected.length >= 3) selected.shift();
    selected.push(val);
    layerManager.setSelectedCountries(selected);
    render();
  });
}
