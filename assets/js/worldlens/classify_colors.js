// 의존 모듈: 없음
// 피의존 모듈: layers.js, interaction.js
// 변경 시 영향: 색상 변경 시 list.html 범례 색상도 확인

export const COLORS = {
  aircraft:  { civilian: '#00DDFF', unknown: '#00AACC', military: '#FF4444' },
  vessel:    { civilian: '#FF8800', unknown: '#CC6600', military: '#FF2222' },
  satellite: { civilian: '#FFDD00', unknown: '#CCAA00', military: '#FF6600' },
  port:      { mega: '#FFFFFF', major: '#CCCCCC', regional: '#888888', minor: '#555555' },
  typhoon:   { TD: '#88BBFF', TS: '#AADDFF', 1: '#FFDD00', 2: '#FFAA00', 3: '#FF6600', 4: '#FF2200', 5: '#CC0000' },
};

export const HIGHLIGHT_HEX = ['#00FF88', '#FF44AA', '#44EEFF'];

/** 타입 + item으로 CSS 색상 문자열 반환 (국가 하이라이트 포함) */
export function getColor(type, item, selectedCountries) {
  if (selectedCountries && selectedCountries.length) {
    const country = item.country || item.origin_country || '';
    const idx = selectedCountries.indexOf(country);
    if (idx >= 0) return HIGHLIGHT_HEX[idx];
    if (type !== 'port' && type !== 'typhoon') return 'rgba(255,255,255,0.06)';
  }
  if (type === 'port') return COLORS.port[item.type] ?? COLORS.port.minor;
  if (type === 'typhoon') {
    const cat = String(item.category ?? 'TS');
    return COLORS.typhoon[cat] ?? COLORS.typhoon.TS;
  }
  const cls = (item.classification || 'unknown').toLowerCase();
  return COLORS[type]?.[cls] ?? '#FFFFFF';
}

/** 항구 사각형 반변(SVG 내부 단위) */
export function getPortHalfSize(portType) {
  return { mega: 5, major: 3.5, regional: 2.5, minor: 1.5 }[portType] ?? 1.5;
}

/** 태풍 원 반지름(SVG 내부 단위) */
export function getTyphoonRadius(category) {
  const cat = String(category ?? 'TS');
  return { TD: 8, TS: 10, 1: 13, 2: 17, 3: 21, 4: 25, 5: 29 }[cat] ?? 10;
}

/** 분류 필터 가시성 */
export function isVisible(item, filters) {
  if (!filters) return true;
  const cls = (item.classification || 'unknown').toLowerCase();
  return filters[cls] !== false;
}
