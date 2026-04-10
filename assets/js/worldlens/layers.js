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
    typhoons.forEach(t => {
      if (t.lat == null || t.lon == null) return;
      const fill = getColor('typhoon', t, []);
      const r    = getTyphoonRadius(t.category);

      // 과거 경로 (실선)
      if (t.track && t.track.length > 1) {
        const pastCoords = t.track
          .filter(p => p.type !== 'forecast')
          .map(p => [p.lon, p.lat]);
        if (pastCoords.length > 1 && path) {
          g.append('path')
            .datum({ type: 'Feature', geometry: { type: 'LineString', coordinates: pastCoords } })
            .attr('d', path)
            .attr('stroke', fill)
            .attr('stroke-width', 2.5)
            .attr('stroke-opacity', 0.5)
            .attr('fill', 'none')
            .attr('vector-effect', 'non-scaling-stroke');
        }
        // 예측 경로 (점선)
        const forecastCoords = [[t.lon, t.lat],
          ...t.track.filter(p => p.type === 'forecast').map(p => [p.lon, p.lat])];
        if (forecastCoords.length > 1 && path) {
          g.append('path')
            .datum({ type: 'Feature', geometry: { type: 'LineString', coordinates: forecastCoords } })
            .attr('d', path)
            .attr('stroke', fill)
            .attr('stroke-width', 2)
            .attr('stroke-opacity', 0.4)
            .attr('stroke-dasharray', '5 4')
            .attr('fill', 'none')
            .attr('vector-effect', 'non-scaling-stroke');
        }
      }

      // 풍속 반경 원 (있을 경우)
      if (t.radius_km) {
        // 위도에 따른 AE 투영 반지름 근사
        const pt0 = project(t.lon, t.lat);
        const pt1 = project(t.lon, t.lat + t.radius_km / 111.0);
        if (pt0 && pt1) {
          const svgR = Math.abs(pt1[1] - pt0[1]);
          g.append('circle')
            .attr('cx', pt0[0]).attr('cy', pt0[1])
            .attr('r', svgR)
            .attr('fill', fill).attr('fill-opacity', 0.07)
            .attr('stroke', fill).attr('stroke-opacity', 0.2)
            .attr('stroke-width', 1)
            .attr('vector-effect', 'non-scaling-stroke')
            .attr('pointer-events', 'none');
        }
      }

      // 현재 위치 원
      const pt = project(t.lon, t.lat);
      if (!pt) return;
      g.append('circle')
        .attr('class', 'wl-pt wl-pt-typhoon')
        .attr('cx', pt[0]).attr('cy', pt[1])
        .attr('r', r)
        .attr('fill', fill)
        .attr('fill-opacity', 0.75)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.2)
        .attr('stroke-opacity', 0.8)
        .attr('vector-effect', 'non-scaling-stroke')
        .datum({ type: 'typhoon', item: t });

      // 이름 라벨 (L2+)
      if (this._zoomLevel >= 2 && t.name) {
        g.append('text')
          .attr('x', pt[0] + r + 4).attr('y', pt[1])
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
