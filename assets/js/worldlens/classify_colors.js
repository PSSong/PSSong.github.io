// 의존 모듈: window.WL (WASM — get_color, is_visible)
// 피의존 모듈: layers.js, interaction.js
// 변경 시 영향: 색상/분류 로직은 worldlens-core Rust에서 관리, 이 파일은 얇은 바인딩

export const COLORS = {
  aircraft:  { civilian: '#00DDFF', unknown: '#00AACC', military: '#FF4444' },
  vessel:    { civilian: '#FF8800', unknown: '#CC6600', military: '#FF2222' },
  satellite: { civilian: '#FFDD00', unknown: '#CCAA00', military: '#FF6600' },
  port:      { mega: '#FFFFFF', major: '#CCCCCC', regional: '#888888', minor: '#555555' },
  typhoon:   { TD: '#88BBFF', TS: '#AADDFF', 1: '#FFDD00', 2: '#FFAA00', 3: '#FF6600', 4: '#FF2200', 5: '#CC0000' },
};

export const HIGHLIGHT_HEX = ['#00FF88', '#FF44AA', '#44EEFF'];

/** 타입 + item으로 CSS 색상 문자열 반환 (WASM worldlens-core 위임) */
export function getColor(type, item, selectedCountries) {
  const cls     = type === 'port'    ? (item.type ?? 'minor')
                : type === 'typhoon' ? String(item.category ?? 'TS')
                : (item.classification || 'unknown').toLowerCase();
  const country  = item.country || item.origin_country || '';
  const selJson  = selectedCountries && selectedCountries.length
                   ? JSON.stringify(selectedCountries) : '[]';
  return window.WL ? window.WL.get_color(type, cls, country, selJson) : '#FFFFFF';
}

/** 항구 사각형 반변(SVG 내부 단위) */
export function getPortHalfSize(portType) {
  return { mega: 5, major: 3.5, regional: 2.5, minor: 1.5 }[portType] ?? 1.5;
}

/** 태풍 나선 아이콘 반지름(SVG 내부 단위) — 카테고리별 크기 */
export function getTyphoonRadius(category) {
  const cat = String(category ?? 'TS');
  return { TD: 8, TS: 11, 1: 14, 2: 17, 3: 21, 4: 25, 5: 30 }[cat] ?? 11;
}

/** 분류 필터 가시성 (WASM worldlens-core 위임) */
export function isVisible(item, filters) {
  if (!filters || !window.WL) return true;
  const cls        = (item.classification || 'unknown').toLowerCase();
  const filtersStr = JSON.stringify(filters);
  return window.WL.is_visible(cls, filtersStr);
}
