// 의존 모듈: classify_colors.js
// 피의존 모듈: main.js, layers.js, interaction.js
// 변경 시 영향: GLOBE_RADIUS 변경 시 layers.js의 레이어 오프셋도 갱신 필요

import { COLORS } from './classify_colors.js';

export const GLOBE_RADIUS = 1.0;

/**
 * 위경도 → Three.js 3D 구면 좌표 (Y축이 북극)
 * @param {number} lat  위도 (-90 ~ 90)
 * @param {number} lon  경도 (-180 ~ 180)
 * @param {number} r    반경 (기본값 GLOBE_RADIUS + 미세 오프셋)
 */
export function latLonToVec3(lat, lon, r = GLOBE_RADIUS + 0.003) {
  const phi   = (90 - lat) * (Math.PI / 180);  // 북극 기준 천정각
  const theta = (lon + 180) * (Math.PI / 180); // 경도 → 방위각
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

/** UN 파란색 구체 */
function _createSphere() {
  const geo = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 72);
  const mat = new THREE.MeshPhongMaterial({
    color:     COLORS.globe,
    shininess: 20,
    specular:  new THREE.Color(0x224466),
  });
  return new THREE.Mesh(geo, mat);
}

/** 경위도 격자선 (경도 15°, 위도 30°) */
function _createGrid() {
  const group = new THREE.Group();
  const mat   = new THREE.LineBasicMaterial({
    color: COLORS.grid,
    transparent: true,
    opacity: 0.18,
  });
  const R = GLOBE_RADIUS + 0.001;

  // 경도선 (meridians) — 15° 간격
  for (let lon = -180; lon < 180; lon += 15) {
    const pts = [];
    for (let lat = -90; lat <= 90; lat += 3) pts.push(latLonToVec3(lat, lon, R));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }

  // 위도선 (parallels) — 30° 간격 (-60° ~ 90°)
  for (let lat = -60; lat <= 90; lat += 30) {
    const pts = [];
    for (let lon = -180; lon <= 181; lon += 3) pts.push(latLonToVec3(lat, lon, R));
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  }

  return group;
}

/**
 * TopoJSON → Three.js 대륙 윤곽선
 * topojson 전역 객체가 로드되어 있어야 함
 */
function _createContinents(topoData) {
  if (!topoData || typeof topojson === 'undefined') return null;

  const group = new THREE.Group();
  const mat   = new THREE.LineBasicMaterial({
    color: COLORS.continent,
    transparent: true,
    opacity: 0.75,
  });
  const R = GLOBE_RADIUS + 0.004;

  const geojson = topojson.feature(topoData, topoData.objects.countries);

  geojson.features.forEach(feature => {
    const { type, coordinates } = feature.geometry;
    const polys = type === 'Polygon'      ? [coordinates]
                : type === 'MultiPolygon' ? coordinates
                : [];

    polys.forEach(poly => {
      poly.forEach(ring => {
        if (ring.length < 2) return;
        const pts = ring.map(([lon, lat]) => latLonToVec3(lat, lon, R));
        group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
      });
    });
  });

  return group;
}

/**
 * 지구 그룹을 씬에 추가하고 반환
 * @param {THREE.Scene} scene
 * @param {object|null} topoData  TopoJSON world-atlas
 * @returns {THREE.Group}
 */
export function createGlobe(scene, topoData) {
  const group = new THREE.Group();
  group.add(_createSphere());
  group.add(_createGrid());

  const continents = _createContinents(topoData);
  if (continents) group.add(continents);

  scene.add(group);
  return group;
}
