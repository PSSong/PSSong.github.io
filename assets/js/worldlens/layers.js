// 의존 모듈: classify_colors.js, globe.js
// 피의존 모듈: main.js, interaction.js
// 변경 시 영향: positions.json 스키마 변경 시 _getCoords/_getCountry 수정 필요

import { GLOBE_RADIUS, latLonToVec3 } from './globe.js';
import { getVertexColor } from './classify_colors.js';

const POINT_SIZE = { aircraft: 0.022, vessel: 0.020, satellite: 0.018, port: 0.013 };
const LAYER_OFFSET = { aircraft: 0.010, vessel: 0.007, satellite: 0.015, port: 0.005 };

/** 타입별 위경도 추출 */
const COORDS = {
  aircraft:  item => ({ lat: item.lat,   lon: item.lon }),
  vessel:    item => ({ lat: item.lat,   lon: item.lon }),
  satellite: item => ({ lat: item.lat,   lon: item.lon }),
  port:      item => ({ lat: item.lat,   lon: item.lon }),
};
const COUNTRY = {
  aircraft:  item => item.country || '',
  vessel:    item => item.country || '',
  satellite: item => item.country || '',
  port:      item => item.country || '',
};
const CLASSIFICATION = {
  aircraft:  item => item.classification || 'unknown',
  vessel:    item => item.classification || 'unknown',
  satellite: item => item.classification || 'unknown',
  port:      () => 'civilian',
};

export class LayerManager {
  constructor(scene) {
    this.scene    = scene;
    this.filters  = { civilian: true, unknown: true, military: true };
    this.selected = [];   // 선택된 국가 코드 (최대 3)
    this._data    = { aircraft: [], vessels: [], satellites: [], ports: [], typhoons: [] };
    this._pts     = {};   // type → { points, geo, items }
    this._typhoonGroup = null;
    this._initPoints();
  }

  _initPoints() {
    ['aircraft', 'vessel', 'satellite', 'port'].forEach(type => {
      const geo    = new THREE.BufferGeometry();
      const mat    = new THREE.PointsMaterial({
        size:            POINT_SIZE[type],
        sizeAttenuation: true,
        vertexColors:    true,
        transparent:     true,
        depthWrite:      false,
      });
      const points = new THREE.Points(geo, mat);
      this.scene.add(points);
      this._pts[type] = { points, geo, items: [] };
    });
  }

  /** positions.json 및 ports 데이터로 전체 레이어 갱신 */
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

  _rebuild() {
    this._buildLayer('aircraft',  this._data.aircraft);
    this._buildLayer('vessel',    this._data.vessels);
    this._buildLayer('satellite', this._data.satellites);
    this._buildLayer('port',      this._data.ports);
    this._rebuildTyphoons();
  }

  _buildLayer(type, rawItems) {
    const items = (rawItems || []).filter(item => {
      const cls = CLASSIFICATION[type](item);
      return this.filters[cls];
    });

    const n         = items.length;
    const positions = new Float32Array(n * 3);
    const colors    = new Float32Array(n * 3);
    const r         = GLOBE_RADIUS + LAYER_OFFSET[type];

    items.forEach((item, i) => {
      const { lat, lon } = COORDS[type](item);
      const v = latLonToVec3(lat, lon, r);
      positions[i * 3]     = v.x;
      positions[i * 3 + 1] = v.y;
      positions[i * 3 + 2] = v.z;

      const cls     = CLASSIFICATION[type](item);
      const country = COUNTRY[type](item);
      const [cr, cg, cb] = getVertexColor(type, cls, country, this.filters, this.selected);
      colors[i * 3]     = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    });

    const { geo } = this._pts[type];
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    this._pts[type].items = items;
  }

  _rebuildTyphoons() {
    if (this._typhoonGroup) {
      this.scene.remove(this._typhoonGroup);
      this._typhoonGroup = null;
    }
    if (!this._data.typhoons.length) return;

    this._typhoonGroup = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.7 });
    this._data.typhoons.forEach(t => {
      if (t.lat == null || t.lon == null) return;
      const v   = latLonToVec3(t.lat, t.lon, GLOBE_RADIUS + 0.012);
      const geo = new THREE.SphereGeometry(0.025, 8, 8);
      const m   = new THREE.Mesh(geo, mat);
      m.position.copy(v);
      this._typhoonGroup.add(m);
    });
    this.scene.add(this._typhoonGroup);
  }

  _updateStats(posData) {
    if (!posData) return;
    const s = posData.stats || {};
    const get = id => document.getElementById(id);
    if (get('wl-stat-aircraft'))   get('wl-stat-aircraft').textContent   = s.aircraft   ?? '--';
    if (get('wl-stat-vessels'))    get('wl-stat-vessels').textContent    = s.vessels    ?? '--';
    if (get('wl-stat-satellites')) get('wl-stat-satellites').textContent = s.satellites ?? '--';
    const ts = posData.generated_at ? new Date(posData.generated_at).toLocaleTimeString() : '--';
    if (get('wl-stat-time')) get('wl-stat-time').textContent = ts;
  }

  /** 분류 필터 토글 */
  setFilter(classification, visible) {
    this.filters[classification] = visible;
    this._rebuild();
  }

  /** 국가 하이라이트 (최대 3) */
  setSelectedCountries(countries) {
    this.selected = countries.slice(0, 3);
    this._rebuild();
  }

  /** interaction.js에서 호버 감지용 데이터 접근 */
  getLayerData() {
    return {
      aircraft:  { items: this._pts.aircraft.items,  geo: this._pts.aircraft.geo  },
      vessel:    { items: this._pts.vessel.items,    geo: this._pts.vessel.geo    },
      satellite: { items: this._pts.satellite.items, geo: this._pts.satellite.geo },
      port:      { items: this._pts.port.items,      geo: this._pts.port.geo      },
    };
  }

  /** 모든 객체 목록 (국가 선택기용) */
  getAllItems() {
    return this._data;
  }
}
