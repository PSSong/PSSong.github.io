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
  let _pinnedTrack = null;  // 클릭으로 고정된 태풍 <g> 요소

  // 태풍 예측 경로 show/hide 헬퍼
  function _showTrack(typhoonEl, show) {
    d3.select(typhoonEl).select('.wl-typhoon-track').style('display', show ? null : 'none');
  }

  // 이벤트 위임: wl-pt 클래스가 있는 모든 SVG 요소
  svg.on('mouseover', event => {
    const el = event.target.closest('.wl-pt');
    if (!el) { tooltip.hide(); return; }
    const data = d3.select(el).datum();
    if (!data) return;
    tooltip.show(event.clientX, event.clientY, _tooltipHtml(data.type, data.item));
    // 태풍: 호버 시 경로 표시 (고정 중이 아닌 것만)
    if (data.type === 'typhoon' && el !== _pinnedTrack) _showTrack(el, true);
  });

  svg.on('mousemove', event => {
    const el = event.target.closest('.wl-pt');
    if (!el) return;
    tooltip.show(event.clientX, event.clientY,
      _tooltipHtml(d3.select(el).datum()?.type, d3.select(el).datum()?.item));
  });

  svg.on('mouseout', event => {
    const el = event.target.closest('.wl-pt');
    if (!el) { tooltip.hide(); return; }
    // 태풍: 마우스 아웃 시 경로 숨김 (고정 아닌 것만)
    const data = d3.select(el).datum();
    if (data?.type === 'typhoon' && el !== _pinnedTrack) _showTrack(el, false);
  });

  // 클릭: 태풍 경로 고정/해제 + 모바일 탭 툴팁
  svg.on('click', event => {
    const el = event.target.closest('.wl-pt');
    if (!el) {
      // 빈 곳 클릭 → 고정 해제
      if (_pinnedTrack) { _showTrack(_pinnedTrack, false); _pinnedTrack = null; }
      tooltip.hide();
      return;
    }
    const data = d3.select(el).datum();
    if (!data) return;
    tooltip.show(event.clientX, event.clientY, _tooltipHtml(data.type, data.item));

    if (data.type === 'typhoon') {
      if (_pinnedTrack && _pinnedTrack !== el) {
        // 다른 태풍 → 이전 고정 해제
        _showTrack(_pinnedTrack, false);
      }
      // 같은 태풍 재클릭 → 토글
      const isNowPinned = _pinnedTrack === el;
      _pinnedTrack = isNowPinned ? null : el;
      _showTrack(el, !isNowPinned);
    }
  });
}

function _tooltipHtml(type, item) {
  if (!item) return '';
  switch (type) {
    case 'aircraft':
      return `<b>${item.callsign || 'N/A'}</b>
        <div>Country: <em>${item.country || '-'}</em></div>
        <div>Class: <em>${item.classification || '-'}</em></div>
        <div>Altitude: ${item.alt != null ? Math.round(item.alt) + ' m' : '-'}</div>
        <div>Origin: ${item.origin_country || '-'}</div>`;
    case 'vessel':
      return `<b>${item.ship_name || 'N/A'}</b>
        <div>Country: <em>${item.country || '-'}</em></div>
        <div>Class: <em>${item.classification || '-'}</em></div>
        <div>Type: ${item.ship_type ?? '-'}</div>
        <div>Speed: ${item.speed != null ? item.speed + ' kn' : '-'}</div>`;
    case 'satellite':
      return `<b>${item.name || 'N/A'}</b>
        <div>NORAD: ${item.norad_id || '-'}</div>
        <div>Operator: <em>${item.country || '-'}</em></div>
        <div>Class: <em>${item.classification || '-'}</em></div>`;
    case 'port':
      return `<b>${item.name || 'N/A'}</b>
        <div>Country: <em>${item.country || '-'}</em></div>
        <div>Grade: ${item.type || '-'}</div>
        <div>LOCODE: ${item.locode || '-'}</div>`;
    case 'typhoon': {
      const windKt  = item.wind_speed_kt ?? item.max_wind_kt;
      const movDir  = _typhoonDir(item);
      return `<b>${item.name || 'Typhoon'}</b>
        <div>Category: <em>${item.category ?? '-'}</em></div>
        <div>Max Wind: ${windKt != null ? windKt + ' kt' : '-'}</div>
        <div>Direction: ${movDir}</div>
        <div>Position: ${item.lat?.toFixed(1)}°, ${item.lon?.toFixed(1)}°</div>`;
    }
    default: return '';
  }
}

/** 태풍 이동 방향 — 예측 경로 첫 포인트로 방위 계산 */
function _typhoonDir(item) {
  const first = (item.track || []).find(p => p.type === 'forecast');
  if (!first || item.lat == null) return '-';
  const deg = (Math.atan2(first.lon - item.lon, first.lat - item.lat) * 180 / Math.PI + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
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
