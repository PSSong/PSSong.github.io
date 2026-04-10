// Package globe: D3 북극중심 방위등거리 투영(AE), 베이스맵, flat-earth 스타일 격자
// 의존: d3, topojson (global CDN), classify_colors.js
// 피의존: main.js (createBasemap), layers.js (project), interaction.js (updateGraticule)
// 변경 시 영향: MAP_CENTER/MAP_RADIUS 변경 시 layers.js project() 및 interaction.js 범위 확인

export const MAP_SIZE   = 1000;
export const MAP_CENTER = 500;   // SVG 중심 = 북극
export const MAP_RADIUS = 478;   // 투영 반지름 (SVG 내부 단위)

let _proj = null;
let _path = null;

// ── 투영 초기화 ─────────────────────────────────────────────────────────────────

export function createProjection() {
  _proj = d3.geoAzimuthalEquidistant()
    .rotate([0, -90])          // 북극을 중심으로
    .scale(MAP_RADIUS)
    .translate([MAP_CENTER, MAP_CENTER])
    .clipAngle(180);           // 남극까지 전개 (UN 엠블럼과 동일)
  _path = d3.geoPath().projection(_proj);
  return { projection: _proj, path: _path };
}

/** lon/lat → SVG [x, y]. 투영 범위 밖이면 null 반환 */
export function project(lon, lat) {
  return _proj ? _proj([lon, lat]) : null;
}

export function getPath() { return _path; }

// ── 베이스맵 생성 ───────────────────────────────────────────────────────────────

export function createBasemap(containerEl, topoData, zoomLevel = 1) {
  const g = d3.select(containerEl);

  // 바다 배경 원
  g.append('circle')
    .attr('class', 'wl-ocean')
    .attr('cx', MAP_CENTER).attr('cy', MAP_CENTER)
    .attr('r', MAP_RADIUS)
    .attr('fill', '#0a1628');

  // 대륙 면 + 윤곽
  if (topoData && typeof topojson !== 'undefined') {
    const land = topojson.feature(topoData, topoData.objects.countries);
    g.append('g').attr('class', 'wl-continents')
      .selectAll('path')
      .data(land.features)
      .join('path')
      .attr('d', _path)
      .attr('fill', '#1a3355')
      .attr('stroke', 'rgba(75,146,219,0.55)')
      .attr('stroke-width', 0.6)
      .attr('stroke-linejoin', 'round')
      .attr('vector-effect', 'non-scaling-stroke');
  }

  // Flat-earth 스타일 격자
  const gratG = g.append('g').attr('class', 'wl-graticule');
  _drawGraticule(gratG.node(), zoomLevel);

  // 외곽 링 (최상단, pointer-events 없음)
  g.append('circle')
    .attr('class', 'wl-outer-ring')
    .attr('cx', MAP_CENTER).attr('cy', MAP_CENTER)
    .attr('r', MAP_RADIUS)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(75,146,219,0.75)')
    .attr('stroke-width', 1.8)
    .attr('vector-effect', 'non-scaling-stroke')
    .attr('pointer-events', 'none');

  // 북극 중심점
  g.append('circle')
    .attr('cx', MAP_CENTER).attr('cy', MAP_CENTER)
    .attr('r', 3)
    .attr('fill', 'rgba(75,146,219,0.6)')
    .attr('pointer-events', 'none');

  // 경도 림 라벨
  _drawRimLabels(g);
}

// ── 격자 갱신 (줌 레벨 변경 시 호출) ──────────────────────────────────────────

export function updateGraticule(svgEl, zoomLevel) {
  const el = d3.select(svgEl).select('.wl-graticule').node();
  if (el) _drawGraticule(el, zoomLevel);
}

// ── 격자 렌더링 ─────────────────────────────────────────────────────────────────
// L1: 24 자오선(15°) + 5 위선(30°간격)
// L2: 동일 자오선 + 11 위선(15°간격)
// L3: L2 + 트로픽·극권선(23.5°, 66.5°) 추가 + 보조 격자(7.5°)

const PARALLEL_SETS = {
  1: [0, 30, -30, 60, -60],
  2: [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75],
  3: [0, 15, -15, 23.5, -23.5, 30, -30, 45, -45, 60, -60, 66.5, -66.5, 75, -75],
};

function _lineFeature(coords) {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };
}

function _drawGraticule(el, zoomLevel) {
  const g = d3.select(el);
  g.selectAll('*').remove();

  // 자오선 (방사형, 24개 = 15° 간격)
  const meridianStep = zoomLevel === 3 ? 7.5 : 15;
  for (let lon = -180; lon < 180; lon += meridianStep) {
    const coords = [];
    for (let lat = 89; lat >= -89; lat -= 1) coords.push([lon, lat]);
    const isCardinal  = lon % 90 === 0;
    const isOctant    = !isCardinal && lon % 45 === 0;
    const isSub       = zoomLevel === 3 && (lon % 15 !== 0);
    g.append('path')
      .datum(_lineFeature(coords))
      .attr('d', _path)
      .attr('stroke', isCardinal ? 'rgba(75,146,219,0.5)'
                     : isOctant  ? 'rgba(75,146,219,0.32)'
                     : isSub     ? 'rgba(75,146,219,0.1)'
                                 : 'rgba(75,146,219,0.18)')
      .attr('stroke-width', isCardinal ? 1.0 : isSub ? 0.4 : 0.55)
      .attr('fill', 'none')
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('pointer-events', 'none');
  }

  // 위선 (동심원)
  const lats = PARALLEL_SETS[zoomLevel] || PARALLEL_SETS[1];
  lats.forEach(lat => {
    const coords = [];
    for (let lon = -180; lon <= 180; lon += 1) coords.push([lon, lat]);
    const isEquator = lat === 0;
    const isTropic  = Math.abs(Math.abs(lat) - 23.5) < 0.3;
    const isArctic  = Math.abs(Math.abs(lat) - 66.5) < 0.3;
    g.append('path')
      .datum(_lineFeature(coords))
      .attr('d', _path)
      .attr('stroke', isEquator ? 'rgba(75,146,219,0.72)'
                    : (isTropic || isArctic) ? 'rgba(75,146,219,0.38)'
                    : 'rgba(75,146,219,0.18)')
      .attr('stroke-width', isEquator ? 1.3 : 0.55)
      .attr('stroke-dasharray', (isTropic || isArctic) ? '5 3' : null)
      .attr('fill', 'none')
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('pointer-events', 'none');
  });
}

// ── 외곽 경도 라벨 ─────────────────────────────────────────────────────────────

const RIM_LONS = [
  { lon: 0,    label: '0°'     },
  { lon: 45,   label: '45°E'   },
  { lon: 90,   label: '90°E'   },
  { lon: 135,  label: '135°E'  },
  { lon: 180,  label: '180°'   },
  { lon: -135, label: '135°W'  },
  { lon: -90,  label: '90°W'   },
  { lon: -45,  label: '45°W'   },
];

function _drawRimLabels(g) {
  const LABEL_R = MAP_RADIUS + 20;
  RIM_LONS.forEach(({ lon, label }) => {
    const pt = _proj([lon, -82]);  // 남극 근방 (외곽 가장자리)
    if (!pt) return;
    const dx   = pt[0] - MAP_CENTER;
    const dy   = pt[1] - MAP_CENTER;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const x    = MAP_CENTER + (dx / dist) * LABEL_R;
    const y    = MAP_CENTER + (dy / dist) * LABEL_R;
    const anchor = Math.abs(dx) < 12 ? 'middle' : dx > 0 ? 'start' : 'end';

    g.append('text')
      .attr('x', x).attr('y', y)
      .attr('text-anchor', anchor)
      .attr('dominant-baseline', 'middle')
      .attr('fill', 'rgba(75,146,219,0.5)')
      .attr('font-size', 10)
      .attr('font-family', 'monospace')
      .attr('vector-effect', 'non-scaling-stroke')
      .attr('pointer-events', 'none')
      .text(label);
  });
}
