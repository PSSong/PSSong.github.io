// Package layers: SVG 데이터 레이어 (항공·선박·위성·항구·태풍) + 클러스터링
// 의존: globe.js (project, getPath), classify_colors.js
// 피의존: main.js, interaction.js
// 변경 시 영향: positions.json 스키마 변경 시 updateData() 파라미터 확인

import { project, getPath, MAP_SIZE } from './globe.js';
import { getColor, getPortHalfSize, getTyphoonRadius, isVisible } from './classify_colors.js';

// SVG 내부 단위 기준 포인트 반지름 (zoom-aware 크기는 interaction.js에서 갱신)
const BASE_R = { aircraft: 5, vessel: 5.5, satellite: 4, port: 4, typhoon: 10 };

// 클러스터링: 셀 크기 (SVG 내부 단위 = 1000 기준)
const CLUSTER_CELL   = 38;
const CLUSTER_THRESH = 3;   // L1에서 셀당 이 수 이상이면 클러스터 버블

// ── 태풍 유틸 (모듈 스코프) ─────────────────────────────────────────────────────

/**
 * WorldLens 파이프라인 스키마 → 내부 형식 정규화
 * - center_lat/lon → lat/lon
 * - "C1"~"C5" → "1"~"5"
 * - forecast_track → track (type:'forecast' 배열)
 * - max_wind_kt → wind_speed_kt
 */
function _normTyphoon(raw) {
  return {
    ...raw,
    lat:           raw.lat           ?? raw.center_lat,
    lon:           raw.lon           ?? raw.center_lon,
    category:      _normCategory(raw.category),
    wind_speed_kt: raw.wind_speed_kt ?? raw.max_wind_kt,
    track: raw.track
      ?? (raw.forecast_track || []).map(p => ({ lon: p.lon, lat: p.lat, type: 'forecast' })),
  };
}

/** "C1"~"C5" → "1"~"5", 나머지(TD·TS·1~5)는 그대로 */
function _normCategory(cat) {
  const s = String(cat ?? 'TS');
  return /^C(\d)$/.test(s) ? s.slice(1) : s;
}

/** basin 또는 위도 기반 반구 판별 — true = 북반구(SVG CW) */
function _isNH(t) {
  const SH_BASINS = ['SI', 'SP', 'AU', 'SH'];
  if (t.basin && SH_BASINS.includes(String(t.basin).toUpperCase())) return false;
  return (t.lat ?? 0) >= 0;
}

/**
 * 3팔 아르키메데스 나선 SVG path (로컬 좌표 ±R, translate 그룹 전용)
 * @param {number} R  최대 반지름 (SVG 단위)
 * @param {boolean} cw true = 북반구(SVG 시계방향 = 지리적 반시계)
 */
const _spiralCache = {};
function _spiralPath(R, cw) {
  const key = `${R}_${cw}`;
  if (_spiralCache[key]) return _spiralCache[key];

  const ARMS = 3, TURNS = 1.5, STEPS = 32;
  const eyeR = R * 0.15;
  let d = '';
  for (let arm = 0; arm < ARMS; arm++) {
    const offset = (arm / ARMS) * 2 * Math.PI;
    for (let i = 0; i <= STEPS; i++) {
      const t     = i / STEPS;
      const r     = eyeR + (R - eyeR) * t;
      const angle = offset + (cw ? 1 : -1) * t * TURNS * 2 * Math.PI;
      const x     = (r * Math.cos(angle)).toFixed(2);
      const y     = (r * Math.sin(angle)).toFixed(2);
      d += i === 0 ? `M${x},${y}` : `L${x},${y}`;
    }
  }
  _spiralCache[key] = d;
  return d;
}

export class LayerManager {
  constructor() {
    this.filters  = { civilian: true, unknown: true, military: true };
    this.layers   = { aircraft: true, vessel: true, satellite: true, typhoon: true, port: true };
    this.selected = [];
    this._data    = { aircraft: [], vessels: [], satellites: [], ports: [], typhoons: [] };
    this._zoomLevel = 1;
    // SVG 그룹 참조 (main.js에서 주입)
    this._groups  = {};
  }

  /** main.js에서 SVG 레이어 그룹 주입 */
  setGroups(groups) {
    this._groups = groups;
  }

  /** positions.json + ports 데이터로 전체 레이어 갱신 */
  updateData(posData, portsData) {
    if (posData) {
      this._data.aircraft   = posData.aircraft   || [];
      this._data.vessels    = posData.vessels    || [];
      this._data.satellites = posData.satellites || [];
      this._data.typhoons   = posData.typhoons   || [];
    }
    if (portsData) this._data.ports = portsData;
    this._rebuild();
    this._updateStats(posData);
  }

  /** 줌 레벨 변경 시 호출 — 클러스터링/라벨 재계산 */
  setZoomLevel(level) {
    this._zoomLevel = level;
    this._rebuild();
  }

  setFilter(cls, visible) {
    this.filters[cls] = visible;
    this._rebuild();
  }

  setLayerVisible(layerName, visible) {
    this.layers[layerName] = visible;
    this._rebuild();
  }

  setSelectedCountries(countries) {
    this.selected = countries.slice(0, 3);
    this._rebuild();
  }

  getAllItems() { return this._data; }

  // ── Private ────────────────────────────────────────────────────────────────

  _rebuild() {
    this._renderLayer('aircraft',  this._data.aircraft,   'aircraft');
    this._renderLayer('vessel',    this._data.vessels,    'vessel');
    this._renderLayer('satellite', this._data.satellites, 'satellite');
    this._renderPorts(this._data.ports);
    this._renderTyphoons(this._data.typhoons);
    this._renderLabels();
  }

  _renderLayer(groupKey, rawItems, type) {
    const g = this._groups[groupKey];
    if (!g) return;
    g.selectAll('*').remove();
    if (!this.layers[type === 'aircraft' ? 'aircraft' : type === 'vessel' ? 'vessel' : 'satellite']) return;

    const items = (rawItems || []).filter(item => isVisible(item, this.filters));
    if (!items.length) return;

    if (this._zoomLevel === 1) {
      this._renderClustered(g, items, type);
    } else {
      this._renderPoints(g, items, type);
    }
  }

  _renderPoints(g, items, type) {
    const r = BASE_R[type];
    items.forEach(item => {
      const pt = project(item.lon, item.lat);
      if (!pt) return;
      const fill = getColor(type, item, this.selected);
      g.append('circle')
        .attr('class', `wl-pt wl-pt-${type}`)
        .attr('cx', pt[0]).attr('cy', pt[1])
        .attr('r', r)
        .attr('fill', fill)
        .attr('fill-opacity', 0.85)
        .attr('stroke', 'rgba(0,0,0,0.3)')
        .attr('stroke-width', 0.5)
        .attr('vector-effect', 'non-scaling-stroke')
        .datum({ type, item });
    });
  }

  _renderClustered(g, items, type) {
    const r = BASE_R[type];
    const cells = {};

    items.forEach(item => {
      const pt = project(item.lon, item.lat);
      if (!pt) return;
      const bx  = Math.floor(pt[0] / CLUSTER_CELL);
      const by  = Math.floor(pt[1] / CLUSTER_CELL);
      const key = `${bx},${by}`;
      if (!cells[key]) cells[key] = { items: [], sx: 0, sy: 0 };
      cells[key].items.push({ item, pt });
      cells[key].sx += pt[0];
      cells[key].sy += pt[1];
    });

    Object.values(cells).forEach(cell => {
      const n  = cell.items.length;
      const cx = cell.sx / n;
      const cy = cell.sy / n;

      if (n >= CLUSTER_THRESH) {
        // 클러스터 버블
        const fill = getColor(type, cell.items[0].item, this.selected);
        g.append('circle')
          .attr('class', 'wl-cluster')
          .attr('cx', cx).attr('cy', cy)
          .attr('r', r + 3 + Math.min(n, 20) * 0.4)
          .attr('fill', fill)
          .attr('fill-opacity', 0.25)
          .attr('stroke', fill)
          .attr('stroke-width', 1)
          .attr('vector-effect', 'non-scaling-stroke');
        g.append('text')
          .attr('x', cx).attr('y', cy)
          .attr('text-anchor', 'middle')
          .attr('dominant-baseline', 'central')
          .attr('fill', fill)
          .attr('font-size', 9)
          .attr('font-weight', 'bold')
          .attr('pointer-events', 'none')
          .attr('vector-effect', 'non-scaling-stroke')
          .text(n > 99 ? '99+' : n);
      } else {
        // 개별 포인트
        cell.items.forEach(({ item, pt }) => {
          const fill = getColor(type, item, this.selected);
          g.append('circle')
            .attr('class', `wl-pt wl-pt-${type}`)
            .attr('cx', pt[0]).attr('cy', pt[1])
            .attr('r', r)
            .attr('fill', fill)
            .attr('fill-opacity', 0.85)
            .attr('stroke', 'rgba(0,0,0,0.3)')
            .attr('stroke-width', 0.5)
            .attr('vector-effect', 'non-scaling-stroke')
            .datum({ type, item });
        });
      }
    });
  }

  _renderPorts(ports) {
    const g = this._groups['port'];
    if (!g) return;
    g.selectAll('*').remove();
    if (!this.layers.port) return;

    (ports || []).forEach(item => {
      const pt = project(item.lon, item.lat);
      if (!pt) return;
      const hs   = getPortHalfSize(item.type);
      const fill = getColor('port', item, this.selected);
      g.append('rect')
        .attr('class', 'wl-pt wl-pt-port')
        .attr('x', pt[0] - hs).attr('y', pt[1] - hs)
        .attr('width', hs * 2).attr('height', hs * 2)
        .attr('fill', fill)
        .attr('fill-opacity', 0.9)
        .attr('stroke', 'rgba(0,0,0,0.4)')
        .attr('stroke-width', 0.5)
        .attr('vector-effect', 'non-scaling-stroke')
        .datum({ type: 'port', item });
    });
  }

  _renderTyphoons(typhoons) {
    const g = this._groups['typhoon'];
    if (!g) return;
    g.selectAll('*').remove();
    if (!this.layers.typhoon || !typhoons.length) return;

    const path = getPath();
    typhoons.forEach(raw => {
      const t  = _normTyphoon(raw);
      if (t.lat == null || t.lon == null) return;
      const pt = project(t.lon, t.lat);
      if (!pt) return;

      const fill = getColor('typhoon', t, []);
      const R    = getTyphoonRadius(t.category);
      const cw   = _isNH(t);

      // ── translate 그룹 (datum + class for hover delegation) ─────────────
      const grp = g.append('g')
        .attr('class', 'wl-pt wl-pt-typhoon')
        .attr('transform', `translate(${pt[0].toFixed(2)},${pt[1].toFixed(2)})`)
        .datum({ type: 'typhoon', item: t });

      // ── 예측 경로 (기본 숨김 — R4b 호버 시 표시) ────────────────────────
      const forecastPts = (t.track || []).filter(p => p.type === 'forecast');
      if (forecastPts.length > 0 && path) {
        const coords = [[t.lon, t.lat], ...forecastPts.map(p => [p.lon, p.lat])];
        grp.append('path')
          .attr('class', 'wl-typhoon-track')
          // 경로는 절대 SVG 좌표 → 그룹 translate 역보정
          .attr('transform', `translate(${(-pt[0]).toFixed(2)},${(-pt[1]).toFixed(2)})`)
          .datum({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } })
          .attr('d', path)
          .attr('stroke', fill)
          .attr('stroke-width', 2)
          .attr('stroke-opacity', 0.55)
          .attr('stroke-dasharray', '5 4')
          .attr('fill', 'none')
          .attr('vector-effect', 'non-scaling-stroke')
          .attr('pointer-events', 'none')
          .style('display', 'none');
      }

      // ── 나선 팔 ──────────────────────────────────────────────────────────
      grp.append('path')
        .attr('d', _spiralPath(R, cw))
        .attr('stroke', fill)
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.88)
        .attr('fill', 'none')
        .attr('vector-effect', 'non-scaling-stroke')
        .attr('pointer-events', 'none');

      // ── 태풍의 눈 ────────────────────────────────────────────────────────
      grp.append('circle')
        .attr('r', Math.max(2, R * 0.15))
        .attr('fill', fill)
        .attr('fill-opacity', 0.9)
        .attr('pointer-events', 'none');

      // ── 투명 히트 영역 (hover/click 감지) ───────────────────────────────
      grp.append('circle')
        .attr('r', R + 4)
        .attr('fill', 'transparent')
        .attr('stroke', 'none');

      // ── L2+ 이름 라벨 ────────────────────────────────────────────────────
      if (this._zoomLevel >= 2 && t.name) {
        grp.append('text')
          .attr('x', R + 4)
          .attr('dominant-baseline', 'central')
          .attr('fill', fill)
          .attr('font-size', 11)
          .attr('font-weight', 'bold')
          .attr('pointer-events', 'none')
          .attr('vector-effect', 'non-scaling-stroke')
          .text(t.name);
      }
    });
  }

  /** L3에서만: 항공·선박 콜사인/선명 라벨 */
  _renderLabels() {
    const g = this._groups['labels'];
    if (!g) return;
    g.selectAll('*').remove();
    if (this._zoomLevel < 3) return;

    const types = [
      { items: this._data.aircraft,   type: 'aircraft', nameKey: 'callsign' },
      { items: this._data.vessels,    type: 'vessel',   nameKey: 'ship_name' },
    ];
    types.forEach(({ items, type, nameKey }) => {
      if (!this.layers[type]) return;
      (items || []).filter(item => isVisible(item, this.filters)).forEach(item => {
        const name = item[nameKey];
        if (!name) return;
        const pt = project(item.lon, item.lat);
        if (!pt) return;
        g.append('text')
          .attr('x', pt[0] + BASE_R[type] + 3).attr('y', pt[1])
          .attr('dominant-baseline', 'central')
          .attr('fill', 'rgba(255,255,255,0.75)')
          .attr('font-size', 9)
          .attr('pointer-events', 'none')
          .attr('vector-effect', 'non-scaling-stroke')
          .text(name);
      });
    });
  }

  _updateStats(posData) {
    if (!posData) return;
    const s   = posData.stats || {};
    const get = id => document.getElementById(id);
    const set = (id, val) => { const el = get(id); if (el) el.textContent = val ?? '--'; };
    set('wl-stat-aircraft', s.aircraft);
    set('wl-stat-vessels', s.vessels);
    set('wl-stat-satellites', s.satellites);
    set('wl-stat-typhoons', s.typhoons ?? 0);
    const ts = posData.generated_at ? new Date(posData.generated_at).toLocaleTimeString() : '--';
    set('wl-stat-time', ts);
  }
}
