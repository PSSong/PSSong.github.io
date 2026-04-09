// 의존 모듈: 없음 (fetch API만 사용)
// 피의존 모듈: main.js
// 변경 시 영향: CONFIG.dataUrl → Phase 5에서 raw.githubusercontent.com URL로 교체 예정

export const CONFIG = {
  // TODO Phase 5: raw.githubusercontent.com/PSSong/pssong-blog/worldlens-data/data/positions.json
  dataUrl:         '/worldlens/positions.json',
  portsUrl:        '/worldlens/ports.json',
  topoUrl:         'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  refreshInterval: 300000,  // 5분 (ms)
};

/**
 * 지수 백오프 재시도 fetch
 * @param {string} url
 * @param {number} maxRetries
 */
async function fetchWithRetry(url, maxRetries = 3) {
  let delay = 1000;
  let lastErr;
  for (let i = 0; i < maxRetries; i++) {
    try {
      const resp = await fetch(url, { cache: 'no-cache' });
      if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
      return await resp.json();
    } catch (err) {
      lastErr = err;
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }
  throw lastErr;
}

/** positions.json 로드 */
export async function loadPositions() {
  return fetchWithRetry(CONFIG.dataUrl);
}

/** ports.json 로드 */
export async function loadPorts() {
  return fetchWithRetry(CONFIG.portsUrl);
}

/** TopoJSON world-atlas 로드 */
export async function loadTopo() {
  return fetchWithRetry(CONFIG.topoUrl);
}

let _refreshTimer = null;

/**
 * 5분 자동 갱신 시작
 * @param {function(data: object): void} onUpdate
 */
export function startAutoRefresh(onUpdate) {
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(async () => {
    try {
      const data = await loadPositions();
      onUpdate(data);
    } catch (err) {
      console.warn('[WorldLens] 자동 갱신 실패:', err.message);
    }
  }, CONFIG.refreshInterval);
}

/** 자동 갱신 중지 */
export function stopAutoRefresh() {
  if (_refreshTimer) {
    clearInterval(_refreshTimer);
    _refreshTimer = null;
  }
}
