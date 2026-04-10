use wasm_bindgen::prelude::*;

// ── 투영 상수 (Azimuthal Equidistant, 북극 중심) ────────────────────────────
const MAP_CENTER: f64 = 500.0;
const MAP_RADIUS: f64 = 478.0;

// ── 색상 상수 ────────────────────────────────────────────────────────────────
const COLOR_AIRCRAFT_CIVILIAN:  &str = "#00DDFF";
const COLOR_AIRCRAFT_UNKNOWN:   &str = "#00AACC";
const COLOR_AIRCRAFT_MILITARY:  &str = "#FF4444";
const COLOR_VESSEL_CIVILIAN:    &str = "#FF8800";
const COLOR_VESSEL_UNKNOWN:     &str = "#CC6600";
const COLOR_VESSEL_MILITARY:    &str = "#FF2222";
const COLOR_SAT_CIVILIAN:       &str = "#FFDD00";
const COLOR_SAT_UNKNOWN:        &str = "#CCAA00";
const COLOR_SAT_MILITARY:       &str = "#FF6600";
const COLOR_PORT_MEGA:          &str = "#FFFFFF";
const COLOR_PORT_MAJOR:         &str = "#CCCCCC";
const COLOR_PORT_REGIONAL:      &str = "#888888";
const COLOR_PORT_MINOR:         &str = "#555555";
const COLOR_TYPHOON_TD:         &str = "#88BBFF";
const COLOR_TYPHOON_TS:         &str = "#AADDFF";
const COLOR_TYPHOON_1:          &str = "#FFDD00";
const COLOR_TYPHOON_2:          &str = "#FFAA00";
const COLOR_TYPHOON_3:          &str = "#FF6600";
const COLOR_TYPHOON_4:          &str = "#FF2200";
const COLOR_TYPHOON_5:          &str = "#CC0000";
const HIGHLIGHT: [&str; 3] = ["#00FF88", "#FF44AA", "#44EEFF"];
const COLOR_FALLBACK:           &str = "#FFFFFF";
const COLOR_DIMMED:             &str = "rgba(255,255,255,0.06)";

// ── 클러스터링 상수 ──────────────────────────────────────────────────────────
const CLUSTER_CELL:   f64 = 38.0;
const CLUSTER_THRESH: usize = 3;

// ── 나선 상수 ────────────────────────────────────────────────────────────────
const ARMS:  usize = 3;
const TURNS: f64   = 1.5;
const STEPS: usize = 32;

// ── 1. project ───────────────────────────────────────────────────────────────
// Azimuthal Equidistant, 북극(90°N) 중심.
// 의존: MAP_CENTER, MAP_RADIUS
// 피의존: JS globe.js wrapper
#[wasm_bindgen]
pub fn project(lon: f64, lat: f64) -> Vec<f64> {
    let lon_r = lon.to_radians();
    let lat_r = lat.to_radians();
    let c = std::f64::consts::FRAC_PI_2 - lat_r;
    let x = MAP_CENTER + MAP_RADIUS * c * lon_r.sin();
    let y = MAP_CENTER - MAP_RADIUS * c * lon_r.cos();
    vec![x, y]
}

// ── 2. spiral_path ───────────────────────────────────────────────────────────
// 3팔 아르키메데스 나선 SVG path. cw=true 북반구(지리적 반시계).
// 의존: ARMS, TURNS, STEPS
// 피의존: JS layers.js wrapper
#[wasm_bindgen]
pub fn spiral_path(r: f64, cw: bool) -> String {
    let eye_r = r * 0.15;
    let dir: f64 = if cw { 1.0 } else { -1.0 };
    let pi2 = std::f64::consts::TAU;
    let mut d = String::with_capacity(512);

    for arm in 0..ARMS {
        let offset = (arm as f64 / ARMS as f64) * pi2;
        for i in 0..=STEPS {
            let t     = i as f64 / STEPS as f64;
            let rr    = eye_r + (r - eye_r) * t;
            let angle = offset + dir * t * TURNS * pi2;
            let x     = rr * angle.cos();
            let y     = rr * angle.sin();
            if i == 0 {
                d.push_str(&format!("M{:.2},{:.2}", x, y));
            } else {
                d.push_str(&format!("L{:.2},{:.2}", x, y));
            }
        }
    }
    d
}

// ── 3. get_color ─────────────────────────────────────────────────────────────
// type_: "aircraft"|"vessel"|"satellite"|"port"|"typhoon"
// cls:   classification (lowercase) or port type or typhoon category
// country: item 국가 코드 (빈 문자열 허용)
// selected_json: JSON 배열 문자열 "[\"US\",\"CN\"]" (빈 배열 허용)
// 의존: COLOR_* 상수, HIGHLIGHT
// 피의존: JS classify_colors.js wrapper
#[wasm_bindgen]
pub fn get_color(type_: &str, cls: &str, country: &str, selected_json: &str) -> String {
    let selected = parse_string_array(selected_json);

    if !selected.is_empty() {
        if let Some(idx) = selected.iter().position(|s| s == country) {
            return HIGHLIGHT[idx.min(2)].to_string();
        }
        if type_ != "port" && type_ != "typhoon" {
            return COLOR_DIMMED.to_string();
        }
    }

    match type_ {
        "aircraft" => match cls {
            "civilian" => COLOR_AIRCRAFT_CIVILIAN,
            "military" => COLOR_AIRCRAFT_MILITARY,
            _          => COLOR_AIRCRAFT_UNKNOWN,
        },
        "vessel" => match cls {
            "civilian" => COLOR_VESSEL_CIVILIAN,
            "military" => COLOR_VESSEL_MILITARY,
            _          => COLOR_VESSEL_UNKNOWN,
        },
        "satellite" => match cls {
            "civilian" => COLOR_SAT_CIVILIAN,
            "military" => COLOR_SAT_MILITARY,
            _          => COLOR_SAT_UNKNOWN,
        },
        "port" => match cls {
            "mega"     => COLOR_PORT_MEGA,
            "major"    => COLOR_PORT_MAJOR,
            "regional" => COLOR_PORT_REGIONAL,
            "minor"    => COLOR_PORT_MINOR,
            _          => COLOR_PORT_MINOR,
        },
        "typhoon" => match cls {
            "TD" => COLOR_TYPHOON_TD,
            "TS" => COLOR_TYPHOON_TS,
            "1"  => COLOR_TYPHOON_1,
            "2"  => COLOR_TYPHOON_2,
            "3"  => COLOR_TYPHOON_3,
            "4"  => COLOR_TYPHOON_4,
            "5"  => COLOR_TYPHOON_5,
            _    => COLOR_TYPHOON_TS,
        },
        _ => COLOR_FALLBACK,
    }
    .to_string()
}

// ── 4. is_visible ─────────────────────────────────────────────────────────────
// cls: "civilian"|"unknown"|"military"
// filters_json: "{\"civilian\":true,\"unknown\":false,\"military\":true}"
// 의존: 없음
// 피의존: JS classify_colors.js wrapper
#[wasm_bindgen]
pub fn is_visible(cls: &str, filters_json: &str) -> bool {
    if filters_json.is_empty() { return true; }
    let key = format!("\"{}\"", cls);
    // "key":false → 비가시
    if let Some(pos) = filters_json.find(&key) {
        let rest = &filters_json[pos + key.len()..];
        let after = rest.trim_start_matches(|c: char| c == ':' || c == ' ');
        return !after.starts_with("false");
    }
    true
}

// ── 5. cluster_l1 ────────────────────────────────────────────────────────────
// coords: flat [lon0,lat0,lon1,lat1,...] (Float64Array from JS)
// meta_json: JSON 배열, 각 요소 {"cls":"civilian","country":"US","type":"aircraft"}
//            coords와 1:1 대응
// filters_json: {"civilian":true,"unknown":true,"military":true}
// 출력: {"clusters":[{cx,cy,count,color,r}],"points":[{x,y,color,type_}]}
//
// 의존: project(), get_color(), is_visible(), CLUSTER_CELL, CLUSTER_THRESH
// 피의존: JS layers.js wrapper
#[wasm_bindgen]
pub fn cluster_l1(coords: &[f64], meta_json: &str, filters_json: &str) -> String {
    if coords.len() % 2 != 0 { return empty_result(); }
    let n = coords.len() / 2;

    let metas = parse_meta_array(meta_json, n);

    // 그리드 집계
    // key: (bx, by) → (sum_x, sum_y, count, first_color, type_)
    let mut cells: std::collections::HashMap<(i32, i32), CellAcc> =
        std::collections::HashMap::new();

    for i in 0..n {
        let lon = coords[i * 2];
        let lat = coords[i * 2 + 1];
        let meta = &metas[i];

        if !is_visible(&meta.cls, filters_json) { continue; }

        let pt = project(lon, lat);
        let px = pt[0];
        let py = pt[1];

        let bx = (px / CLUSTER_CELL).floor() as i32;
        let by = (py / CLUSTER_CELL).floor() as i32;

        let acc = cells.entry((bx, by)).or_insert(CellAcc {
            sx: 0.0, sy: 0.0, count: 0,
            first_color: String::new(),
            type_: meta.type_.clone(),
        });
        acc.sx += px;
        acc.sy += py;
        acc.count += 1;
        if acc.first_color.is_empty() {
            acc.first_color = get_color(&meta.type_, &meta.cls, &meta.country, "[]");
        }
    }

    // 직렬화
    let base_r: f64 = 5.0; // BASE_R aircraft/vessel/satellite 평균
    let mut clusters_buf = String::new();
    let mut points_buf   = String::new();

    for acc in cells.values() {
        let cx = acc.sx / acc.count as f64;
        let cy = acc.sy / acc.count as f64;
        let color = &acc.first_color;

        if acc.count >= CLUSTER_THRESH {
            let r = base_r + 3.0 + (acc.count.min(20) as f64) * 0.4;
            if !clusters_buf.is_empty() { clusters_buf.push(','); }
            clusters_buf.push_str(&format!(
                "{{\"cx\":{:.2},\"cy\":{:.2},\"count\":{},\"color\":\"{}\",\"r\":{:.2}}}",
                cx, cy, acc.count, color, r
            ));
        } else {
            // 소규모 셀 → 개별 포인트 (재계산 없이 평균 위치 사용)
            if !points_buf.is_empty() { points_buf.push(','); }
            points_buf.push_str(&format!(
                "{{\"x\":{:.2},\"y\":{:.2},\"color\":\"{}\",\"type_\":\"{}\"}}",
                cx, cy, color, acc.type_
            ));
        }
    }

    format!("{{\"clusters\":[{}],\"points\":[{}]}}", clusters_buf, points_buf)
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

struct Meta {
    cls:     String,
    country: String,
    type_:   String,
}

struct CellAcc {
    sx:          f64,
    sy:          f64,
    count:       usize,
    first_color: String,
    type_:       String,
}

fn empty_result() -> String {
    "{\"clusters\":[],\"points\":[]}".to_string()
}

/// 최소 JSON 배열 파서: ["a","b","c"] → Vec<String>
fn parse_string_array(json: &str) -> Vec<String> {
    let s = json.trim();
    if !s.starts_with('[') { return vec![]; }
    let inner = &s[1..s.len().saturating_sub(1)];
    inner.split(',')
        .map(|t| t.trim().trim_matches('"').to_string())
        .filter(|t| !t.is_empty())
        .collect()
}

/// meta_json 파서: [{"cls":"...","country":"...","type":"..."}, ...]
/// serde 미사용 — 수동 파싱으로 바이너리 크기 절감
fn parse_meta_array(json: &str, expected: usize) -> Vec<Meta> {
    let mut result = Vec::with_capacity(expected);
    let s = json.trim();
    if !s.starts_with('[') {
        for _ in 0..expected { result.push(Meta { cls: "unknown".into(), country: String::new(), type_: "aircraft".into() }); }
        return result;
    }

    // 중괄호 단위로 분리 (중첩 없음)
    let mut depth = 0i32;
    let mut start = 0usize;
    let bytes = s.as_bytes();
    for (i, &b) in bytes.iter().enumerate() {
        match b {
            b'{' => { if depth == 0 { start = i; } depth += 1; }
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    let obj = &s[start..=i];
                    result.push(parse_meta_obj(obj));
                }
            }
            _ => {}
        }
    }
    // 파싱 개수 < expected 이면 기본값으로 채움
    while result.len() < expected {
        result.push(Meta { cls: "unknown".into(), country: String::new(), type_: "aircraft".into() });
    }
    result
}

/// {"cls":"civilian","country":"US","type":"aircraft"} 파싱
fn parse_meta_obj(obj: &str) -> Meta {
    Meta {
        cls:     extract_str(obj, "cls").unwrap_or("unknown").to_string(),
        country: extract_str(obj, "country").unwrap_or("").to_string(),
        type_:   extract_str(obj, "type").unwrap_or("aircraft").to_string(),
    }
}

/// JSON 객체에서 "key":"value" 추출 (단순 문자열 값만)
fn extract_str<'a>(obj: &'a str, key: &str) -> Option<&'a str> {
    let needle = format!("\"{}\"", key);
    let pos = obj.find(&needle)?;
    let after = obj[pos + needle.len()..].trim_start_matches(|c: char| c == ':' || c == ' ');
    if !after.starts_with('"') { return None; }
    let inner = &after[1..];
    let end = inner.find('"')?;
    Some(&inner[..end])
}
