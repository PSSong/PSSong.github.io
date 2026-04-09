// 의존 모듈: 없음
// 피의존 모듈: layers.js, interaction.js
// 변경 시 영향: 색상 변경 시 CSS custom.css 범례 색상도 일관성 확인 필요

// Three.js 색상 상수 (hex integers)
export const COLORS = {
  aircraft: {
    civilian: 0x00DDFF,
    unknown:  0x00AACC,
    military: 0xFF4444,
  },
  vessel: {
    civilian: 0xFF8800,
    unknown:  0xCC6600,
    military: 0xFF2222,
  },
  satellite: {
    civilian: 0xFFDD00,
    unknown:  0xCCAA00,
    military: 0xFF6600,
  },
  port:    0xFFFFFF,
  globe:   0x4B92DB,
  grid:    0xFFFFFF,
  continent: 0xFFFFFF,
};

// 국가 하이라이트 색상 (최대 3개국)
export const HIGHLIGHT_COLORS = [
  0x00FF88,  // 녹색
  0xFF44AA,  // 자주색
  0x44EEFF,  // 청록
];

// CSS hex 문자열 (칩 테두리 등 HTML에서 사용)
export const HIGHLIGHT_HEX = ['#00FF88', '#FF44AA', '#44EEFF'];

/**
 * 타입 + 분류에 따른 기본 hex 색상 반환
 * @param {'aircraft'|'vessel'|'satellite'|'port'} type
 * @param {'civilian'|'unknown'|'military'} classification
 */
export function getColorHex(type, classification) {
  const entry = COLORS[type];
  if (typeof entry === 'number') return entry;
  return entry[classification] || entry.civilian;
}

/**
 * 분류 필터 + 국가 하이라이트를 반영한 RGB 배열 반환
 * opacity는 색상 채도로 표현 (별도 geometry attribute 없이)
 * @returns {[r:number, g:number, b:number]} 0~1 범위
 */
export function getVertexColor(type, classification, country, filters, selectedCountries) {
  // 필터 off → 검은색으로 숨김
  if (filters && !filters[classification]) {
    return [0, 0, 0];
  }

  // 국가 하이라이트 모드
  if (selectedCountries && selectedCountries.length > 0) {
    const idx = selectedCountries.indexOf(country);
    if (idx >= 0) {
      const c = new THREE.Color(HIGHLIGHT_COLORS[idx]);
      return [c.r, c.g, c.b];
    }
    // 비선택 국가 → 어둡게
    const hex = getColorHex(type, classification);
    const c = new THREE.Color(hex);
    return [c.r * 0.1, c.g * 0.1, c.b * 0.1];
  }

  // 기본 색상
  const hex = getColorHex(type, classification);
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

/**
 * 필터 off 여부 판단 (포인트를 아예 숨길지)
 */
export function isVisible(classification, filters) {
  return !filters || filters[classification] !== false;
}
