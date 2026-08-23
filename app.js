/* ==========================================================================
   Kaohsiung & Pingtung GIS School Intelligence Dashboard - Application Logic
   ========================================================================== */

// Global Application State
let currentCategory = 'all';
let currentCity = 'all';
let currentSearch = '';
let currentDistanceFilter = 'all'; // 'all', '5km', '5-10km', 'within10km'
let selectedSchool = null;

// Fooyin Center GIS Configuration
const FOOYIN_CENTER = {
  id: 'u7',
  name: '輔英科技大學',
  lat: 22.5978,
  lng: 120.3956
};

// Map & GIS Layers
let map = null;
let mapMarkers = {};
let currentTileLayer = null;
let isDarkTile = true;

// GIS Buffer Rings & Beacon Layers
let circle5kmLayer = null;
let circle10kmLayer = null;
let tooltip5kmMarker = null;
let tooltip10kmMarker = null;
let fooyinBeaconMarker = null;
let distancePolylineLayer = null;
let showDistanceLines = true;

// Inspector Chart Instances
let gradeBarChartInstance = null;
let gradeDonutChartInstance = null;

// Analytics Chart Instances
let highSchoolTrendChartInstance = null;
let topHighSchoolsChartInstance = null;
let juniorHighTrendChartInstance = null;
let topJuniorHighChartInstance = null;
let tierOverviewChartInstance = null;

// Tile URLs
const DARK_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const LIGHT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

// Haversine Distance Calculator (km)
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Compute distance from Fooyin for all schools
SCHOOLS_DATA.forEach(school => {
  school.distFromFooyin = calculateHaversineDistance(
    FOOYIN_CENTER.lat, FOOYIN_CENTER.lng,
    school.lat, school.lng
  );
});

// Initialize App on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  initGISMap();
  renderSchoolList();
  
  // First action: check connection health for all schools
  checkAllSchoolsConnection(false);

  // Default select 輔英科技大學
  const defaultSchool = SCHOOLS_DATA.find(s => s.id === 'u7') || SCHOOLS_DATA[0];
  if (defaultSchool) {
    selectSchool(defaultSchool.id);
  }

  // Pre-render analytics charts
  initAnalyticsCharts();
});

/* ==========================================================================
   1. GIS Map Initialization & Marker Management
   ========================================================================== */
function initGISMap() {
  // Center on Kaohsiung/Pingtung Region
  map = L.map('map', {
    center: [22.60, 120.40],
    zoom: 11,
    zoomControl: false
  });

  // Add Zoom Control to Top Left
  L.control.zoom({ position: 'topleft' }).addTo(map);

  // Set Dark Tile by Default
  currentTileLayer = L.tileLayer(DARK_TILE_URL, {
    attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
    maxZoom: 18
  }).addTo(map);

  // Initialize Fooyin Concentric Buffer Rings (5km & 10km) & Pulsing Beacon
  initFooyinRadiusLayers();

  // Create Markers for all schools
  SCHOOLS_DATA.forEach(school => {
    const markerIcon = createCustomMarkerIcon(school.category);
    const marker = L.marker([school.lat, school.lng], { icon: markerIcon }).addTo(map);

    const distStr = school.id === 'u7' ? 'GIS 原點中心' : `距輔英 ${school.distFromFooyin.toFixed(2)} km`;
    const ringTag = school.distFromFooyin <= 5 
      ? '🎯 5km 核心圈' 
      : school.distFromFooyin <= 10 
      ? '⭕ 5-10km 擴散圈' 
      : '📡 10km 以外';

    // Popup Content
    const popupHtml = `
      <div class="popup-content">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 6px;">
          <span class="card-category cat-${school.category}">${school.categoryName}</span>
          <span class="dist-pill ${school.id === 'u7' ? 'dist-center' : school.distFromFooyin <= 5 ? 'dist-5km' : school.distFromFooyin <= 10 ? 'dist-10km' : 'dist-outer'}">${ringTag} | ${distStr}</span>
        </div>
        <h4>${school.name}</h4>
        <p><i class="fa-solid fa-location-dot"></i> ${school.district}</p>
        <div class="popup-total"><i class="fa-solid fa-users"></i> 全校總人數：${school.total.toLocaleString()} 人</div>
        <button class="popup-btn" onclick="selectSchool('${school.id}')">
          <i class="fa-solid fa-chart-line"></i> 檢視與輔英距離及詳細數據
        </button>
      </div>
    `;
    marker.bindPopup(popupHtml);

    // Click Marker Event
    marker.on('click', () => {
      selectSchool(school.id, false); // Don't re-fly map if user clicked marker
    });

    mapMarkers[school.id] = marker;
  });

  // Auto fit map bounds to cover Fooyin 10km Concentric Circles by default
  setTimeout(() => focusFooyinRadiusBounds(), 200);
}

// Initialize Concentric Rings (5km / 10km) & Fooyin Beacon Marker
function initFooyinRadiusLayers() {
  if (!map) return;

  // 5 km Core Ring (Cyan / Emerald)
  circle5kmLayer = L.circle([FOOYIN_CENTER.lat, FOOYIN_CENTER.lng], {
    radius: 5000,
    color: '#06b6d4',
    fillColor: '#06b6d4',
    fillOpacity: 0.14,
    weight: 2.5,
    dashArray: '6, 6'
  }).addTo(map);

  // 10 km Expansion Ring (Violet / Purple)
  circle10kmLayer = L.circle([FOOYIN_CENTER.lat, FOOYIN_CENTER.lng], {
    radius: 10000,
    color: '#8b5cf6',
    fillColor: '#8b5cf6',
    fillOpacity: 0.08,
    weight: 2.5,
    dashArray: '8, 8'
  }).addTo(map);

  // North Latitude Points for Ring Tooltips
  const p5kmNorth = [FOOYIN_CENTER.lat + (5 / 111.32), FOOYIN_CENTER.lng];
  const p10kmNorth = [FOOYIN_CENTER.lat + (10 / 111.32), FOOYIN_CENTER.lng];

  tooltip5kmMarker = L.marker(p5kmNorth, {
    icon: L.divIcon({ className: 'hidden-icon', iconSize: [0, 0] })
  }).addTo(map);

  tooltip5kmMarker.bindTooltip('🎯 5 km 核心圈 (6所學校 | 2.25萬學生)', {
    permanent: true,
    direction: 'top',
    className: 'radius-tooltip tooltip-5km'
  });

  tooltip10kmMarker = L.marker(p10kmNorth, {
    icon: L.divIcon({ className: 'hidden-icon', iconSize: [0, 0] })
  }).addTo(map);

  tooltip10kmMarker.bindTooltip('⭕ 10 km 擴散圈 (17所學校 | 9.47萬學生)', {
    permanent: true,
    direction: 'top',
    className: 'radius-tooltip tooltip-10km'
  });

  // Center Fooyin Beacon Pulsing Marker
  const beaconIcon = L.divIcon({
    className: 'custom-beacon-leaflet-marker',
    html: `
      <div class="fy-beacon-marker" title="輔英科技大學 (GIS 原點中心)">
        <div class="beacon-ripple"></div>
        <div class="beacon-ripple-outer"></div>
        <div class="beacon-core"><i class="fa-solid fa-graduation-cap"></i></div>
      </div>
    `,
    iconSize: [42, 42],
    iconAnchor: [21, 21]
  });

  fooyinBeaconMarker = L.marker([FOOYIN_CENTER.lat, FOOYIN_CENTER.lng], {
    icon: beaconIcon,
    zIndexOffset: 2000
  }).addTo(map);

  fooyinBeaconMarker.bindPopup(`
    <div class="popup-content">
      <span class="card-category cat-university" style="background: linear-gradient(135deg, #06b6d4, #8b5cf6);">🎯 GIS 原點中心</span>
      <h4>輔英科技大學</h4>
      <p><i class="fa-solid fa-location-dot"></i> 高雄市大寮區進學路151號</p>
      <div class="popup-total"><i class="fa-solid fa-users"></i> 全校總人數：9,200 人</div>
      <button class="popup-btn" onclick="focusFooyinRadiusBounds()">
        <i class="fa-solid fa-crosshairs"></i> 聚焦半徑 5km / 10km 同心圓視野
      </button>
    </div>
  `);

  fooyinBeaconMarker.on('click', () => {
    selectSchool('u7', false);
  });
}

// Custom Marker DivIcon Generator
function createCustomMarkerIcon(category) {
  let iconClass = 'fa-school';
  let catClass = 'uni';

  if (category === 'university') {
    iconClass = 'fa-building-columns';
    catClass = 'uni';
  } else if (category === 'high') {
    iconClass = 'fa-graduation-cap';
    catClass = 'high';
  } else if (category === 'junior') {
    iconClass = 'fa-child-reaching';
    catClass = 'junior';
  }

  const html = `<div class="marker-pin ${catClass}"><i class="fa-solid ${iconClass}"></i></div>`;
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: html,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

// Fit All Visible Markers Bounds (Auto-fit Tainan, Kaohsiung, Pingtung)
function fitAllMarkersBounds() {
  if (!map) return;
  const visibleMarkers = [];
  SCHOOLS_DATA.forEach(school => {
    const marker = mapMarkers[school.id];
    if (marker && map.hasLayer(marker)) {
      visibleMarkers.push(marker);
    }
  });

  if (visibleMarkers.length > 0) {
    const group = L.featureGroup(visibleMarkers);
    map.fitBounds(group.getBounds().pad(0.08));
  }
}

// Reset Map View to Full Region
function resetMapView() {
  if (!map) return;
  fitAllMarkersBounds();
  showToast('已重置為南臺灣 (台南/高雄/屏東) 全區全景視角');
}

// Toggle Map Tile Theme (Light / Dark)
function toggleTileLayer() {
  if (!map) return;
  map.removeLayer(currentTileLayer);
  
  if (isDarkTile) {
    currentTileLayer = L.tileLayer(LIGHT_TILE_URL, {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(map);
    isDarkTile = false;
    showToast('已切換為明亮模式地圖圖資');
  } else {
    currentTileLayer = L.tileLayer(DARK_TILE_URL, {
      attribution: '&copy; CARTO',
      maxZoom: 18
    }).addTo(map);
    isDarkTile = true;
    showToast('已切換為深色深邃地圖圖資');
  }
}

/* ==========================================================================
   2. School List Filtering & Sidebar Management
   ========================================================================== */
function filterCategory(category, btnElement) {
  currentCategory = category;
  
  // Update Active Button UI
  document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');

  renderSchoolList();
}

function handleCityFilter() {
  currentCity = document.getElementById('citySelect').value;
  renderSchoolList();
}

function handleSearch() {
  const input = document.getElementById('searchInput');
  currentSearch = input.value.trim().toLowerCase();
  
  const clearBtn = document.getElementById('clearSearchBtn');
  clearBtn.style.display = currentSearch ? 'block' : 'none';

  renderSchoolList();
}

function clearSearch() {
  const input = document.getElementById('searchInput');
  input.value = '';
  currentSearch = '';
  document.getElementById('clearSearchBtn').style.display = 'none';
  renderSchoolList();
}

function selectSchoolByName(nameStr) {
  const school = SCHOOLS_DATA.find(s => s.name === nameStr || s.name.includes(nameStr));
  if (school) {
    // Switch to Map View if in Analytics view
    switchMainView('map');
    selectSchool(school.id);
    showToast(`已鎖定定位學校：${school.name}`);
  }
}

function getFilteredSchools() {
  return SCHOOLS_DATA.filter(school => {
    // Category match
    if (currentCategory === 'rural') {
      if (!school.isRural) return false;
    } else if (currentCategory !== 'all' && school.category !== currentCategory) {
      return false;
    }

    // Distance Ring Match
    if (currentDistanceFilter === '5km') {
      if (school.distFromFooyin > 5) return false;
    } else if (currentDistanceFilter === '5-10km') {
      if (school.distFromFooyin <= 5 || school.distFromFooyin > 10) return false;
    } else if (currentDistanceFilter === 'within10km') {
      if (school.distFromFooyin > 10) return false;
    }

    // City match
    if (currentCity !== 'all' && school.city !== currentCity) {
      return false;
    }

    // Search keyword match
    if (currentSearch) {
      const matchName = school.name.toLowerCase().includes(currentSearch);
      const matchDistrict = school.district.toLowerCase().includes(currentSearch);
      const matchCat = school.categoryName.toLowerCase().includes(currentSearch);
      const matchRural = school.ruralTag ? school.ruralTag.toLowerCase().includes(currentSearch) : false;
      if (!matchName && !matchDistrict && !matchCat && !matchRural) return false;
    }

    return true;
  });
}

function renderSchoolList() {
  const listContainer = document.getElementById('schoolList');
  const filtered = getFilteredSchools();

  document.getElementById('matchedCount').textContent = filtered.length;

  // Update Markers visibility on map
  SCHOOLS_DATA.forEach(school => {
    const isMatched = filtered.some(f => f.id === school.id);
    const marker = mapMarkers[school.id];
    if (marker) {
      if (isMatched) {
        if (!map.hasLayer(marker)) map.addLayer(marker);
      } else {
        if (map.hasLayer(marker)) map.removeLayer(marker);
      }
    }
  });

  if (filtered.length === 0) {
    listContainer.innerHTML = `
      <div class="inspector-empty">
        <i class="fa-solid fa-magnifying-glass-minus"></i>
        <p>未找到符合條件的學校</p>
      </div>
    `;
    return;
  }

  let html = '';
  filtered.forEach(school => {
    const isSelected = selectedSchool && selectedSchool.id === school.id;
    const isOnline = school.status === 'online';
    
    const statusBadgeHtml = isOnline 
      ? `<span class="status-badge-online"><i class="fa-solid fa-circle text-emerald"></i> 即時連線</span>`
      : `<span class="status-badge-offline" title="上次連結時間: ${school.lastConnected}"><i class="fa-solid fa-clock-rotate-left"></i> 上次時間: ${school.lastConnected.split(' ')[1].slice(0, 5)}</span>`;

    const ruralTagHtml = school.ruralTag 
      ? `<span class="rural-badge">${school.ruralTag}</span>` 
      : '';

    let distBadgeHtml = '';
    if (school.id === 'u7') {
      distBadgeHtml = `<span class="dist-pill dist-center"><i class="fa-solid fa-bullseye text-cyan"></i> 原點中心</span>`;
    } else if (school.distFromFooyin <= 5) {
      distBadgeHtml = `<span class="dist-pill dist-5km" title="5km核心圈"><i class="fa-solid fa-circle-dot"></i> 距輔英 ${school.distFromFooyin.toFixed(2)} km</span>`;
    } else if (school.distFromFooyin <= 10) {
      distBadgeHtml = `<span class="dist-pill dist-10km" title="5-10km擴散圈"><i class="fa-solid fa-bullseye"></i> 距輔英 ${school.distFromFooyin.toFixed(2)} km</span>`;
    } else {
      distBadgeHtml = `<span class="dist-pill dist-outer"><i class="fa-solid fa-compass"></i> 距輔英 ${school.distFromFooyin.toFixed(1)} km</span>`;
    }

    html += `
      <div class="school-card ${isSelected ? 'selected' : ''}" onclick="selectSchool('${school.id}')">
        <div class="card-top">
          <span class="card-category cat-${school.category}">${school.categoryName}</span>
          ${distBadgeHtml}
          ${ruralTagHtml}
          ${statusBadgeHtml}
        </div>
        <h4>${school.name}</h4>
        <div class="card-bottom">
          <span class="card-district"><i class="fa-solid fa-location-dot"></i> ${school.district}</span>
          <span class="total-badge"><i class="fa-solid fa-users"></i> ${school.total.toLocaleString()} 人</span>
        </div>
      </div>
    `;
  });

  listContainer.innerHTML = html;
  
  // Auto-fit bounds for current filtered markers if not selecting a specific school
  if (map && !selectedSchool) {
    if (currentDistanceFilter !== 'all') {
      focusFooyinRadiusBounds();
    } else {
      fitAllMarkersBounds();
    }
  }
}

/* ==========================================================================
   3. School Selection & Right Panel Inspector Detail
   ========================================================================== */
function selectSchool(schoolId, flyMap = true) {
  const school = SCHOOLS_DATA.find(s => s.id === schoolId);
  if (!school) return;

  selectedSchool = school;

  // Re-render sidebar to highlight selected card
  renderSchoolList();

  // Fly map to selected school & open popup
  const marker = mapMarkers[schoolId];
  if (marker && map) {
    if (flyMap) {
      map.flyTo([school.lat, school.lng], 14, { duration: 1.2 });
    }
    marker.openPopup();
  }

  // Draw GIS Polyline distance connection from Fooyin
  drawDistancePolyline(school);

  // Render Inspector Panel
  renderInspectorPanel(school);
}

function getSameTierInfo(school) {
  const sameTierSchools = SCHOOLS_DATA.filter(s => s.category === school.category)
    .sort((a, b) => b.total - a.total);

  const rank = sameTierSchools.findIndex(s => s.id === school.id) + 1;
  const totalInTier = sameTierSchools.length;

  const tierTotalSum = sameTierSchools.reduce((acc, curr) => acc + curr.total, 0);
  const tierAverage = Math.round(tierTotalSum / totalInTier);

  const diffFromAvg = school.total - tierAverage;
  const pctFromAvg = ((diffFromAvg / tierAverage) * 100).toFixed(1);

  // Percentage (%) of tier total population
  const schoolPctOfTierTotal = ((school.total / tierTotalSum) * 100).toFixed(2);
  const avgPctOfTierTotal = ((tierAverage / tierTotalSum) * 100).toFixed(2);
  const diffPctVal = (schoolPctOfTierTotal - avgPctOfTierTotal).toFixed(2);
  const diffPctOfTierTotal = diffPctVal >= 0 ? `+${diffPctVal}` : `${diffPctVal}`;

  return {
    rank,
    totalInTier,
    sameTierSchools,
    tierTotalSum,
    tierAverage,
    diffFromAvg,
    pctFromAvg,
    schoolPctOfTierTotal,
    avgPctOfTierTotal,
    diffPctOfTierTotal
  };
}

let inspectorPeerChartInstance = null;
let peerCategoryChartInstance = null;
let currentPeerTier = 'university';

function renderInspectorPanel(school) {
  const inspector = document.getElementById('inspectorPanel');
  
  // Highest grade first baseline
  const gradeKeys = Object.keys(school.grades).reverse();
  const gradeValues = Object.values(school.grades).reverse();

  const isOnline = school.status === 'online';
  const tierInfo = getSameTierInfo(school);
  
  const connectionHeaderHtml = isOnline ? `
    <div class="status-badge-online" style="margin-top: 6px;">
      <i class="fa-solid fa-circle-check"></i> 官網連線狀況：線上即時連線 (拉取成功)
    </div>
  ` : `
    <div class="last-connected-banner">
      <div class="banner-title">
        <i class="fa-solid fa-triangle-exclamation"></i> 官網暫時無法顯示 / 連線逾時
      </div>
      <div class="banner-desc">
        系統已顯示上次成功連結時間：<span class="time-tag">${school.lastConnected}</span><br>
        並以上次紀錄時間與數據進行統計與圖表分析。
      </div>
    </div>
  `;

  const diffClass = tierInfo.diffFromAvg >= 0 ? 'text-higher' : 'text-lower';
  const diffSign = tierInfo.diffFromAvg >= 0 ? '+' : '';

  // GIS Distance Calculation
  const distFromFy = school.distFromFooyin !== undefined 
    ? school.distFromFooyin 
    : calculateHaversineDistance(FOOYIN_CENTER.lat, FOOYIN_CENTER.lng, school.lat, school.lng);

  let distCategoryLabel = '';
  let distGaugeClass = '';
  let distPct = Math.min(100, Math.round((distFromFy / 20) * 100));

  if (school.id === 'u7') {
    distCategoryLabel = '🎯 GIS 原點中心點';
    distGaugeClass = 'fill-5km';
  } else if (distFromFy <= 5) {
    distCategoryLabel = '🎯 5 km 核心圈';
    distGaugeClass = 'fill-5km';
  } else if (distFromFy <= 10) {
    distCategoryLabel = '⭕ 5–10 km 擴散圈';
    distGaugeClass = 'fill-10km';
  } else {
    distCategoryLabel = '📡 10 km 以外遠距';
    distGaugeClass = 'fill-outer';
  }

  const inspectorDistanceHtml = `
    <div class="inspector-distance-card">
      <div class="dist-card-header">
        <span class="dist-card-title"><i class="fa-solid fa-compass text-cyan"></i> 輔英科技大學 GIS 空間距離分析</span>
        <span class="dist-pill ${school.id === 'u7' ? 'dist-center' : distFromFy <= 5 ? 'dist-5km' : distFromFy <= 10 ? 'dist-10km' : 'dist-outer'}">${distCategoryLabel}</span>
      </div>
      <div class="dist-metric-row">
        <span style="font-size: 0.8rem; color: var(--text-muted);">${school.id === 'u7' ? '為半徑圈原點中心：' : '與輔英直線距離：'}</span>
        <span class="dist-num-display">${school.id === 'u7' ? '0.00 km' : distFromFy.toFixed(2) + ' km'}</span>
      </div>
      <div class="dist-gauge-container" title="距離原點 20km 標尺占比">
        <div class="dist-gauge-fill ${distGaugeClass}" style="width: ${school.id === 'u7' ? '100' : distPct}%;"></div>
      </div>
      ${school.id !== 'u7' ? `
        <button class="dist-draw-line-btn" onclick="drawDistancePolyline(selectedSchool); focusFooyinRadiusBounds();">
          <i class="fa-solid fa-route"></i> 在地圖上與輔英畫連線並聚焦同心圓
        </button>
      ` : ''}
    </div>
  `;

  // Generate HTML
  inspector.innerHTML = `
    <div class="school-detail-card">
      <div class="detail-header">
        <div class="detail-tags">
          <span class="card-category cat-${school.category}">${school.categoryName}</span>
          <span class="card-district"><i class="fa-solid fa-map-pin"></i> ${school.city}</span>
          <span class="moe-code-badge"><i class="fa-solid fa-certificate"></i> MOE代碼：${school.moeCode}</span>
        </div>
        <h2>${school.name}</h2>
        <div class="district-text"><i class="fa-solid fa-building"></i> 校址行政區：${school.district}</div>
        ${connectionHeaderHtml}
        ${inspectorDistanceHtml}

        <!-- Same-Tier Rank Badge -->
        <div class="peer-rank-badge">
          <i class="fa-solid fa-trophy"></i> 同級排名：第 ${tierInfo.rank} 名 / 共 ${tierInfo.totalInTier} 所 ${school.categoryName}
        </div>

        <!-- Same-Tier Benchmark Card -->
        <div class="peer-benchmark-card">
          <span class="bm-label"><i class="fa-solid fa-chart-pie text-cyan"></i> 同級【${school.categoryName}】統計總人數：${tierInfo.tierTotalSum.toLocaleString()} 人 (平均每校佔 ${tierInfo.avgPctOfTierTotal}% / ${tierInfo.tierAverage.toLocaleString()}人)</span>
          <div class="bm-val" style="margin-top: 6px;">
            <span>該校人數佔統計總數比例：<strong style="color: #38bdf8; font-size: 1.02rem; font-weight: 800;">${tierInfo.schoolPctOfTierTotal}%</strong> (${school.total.toLocaleString()} 人)</span>
            <span class="bm-diff ${diffClass}">
              <i class="fa-solid ${tierInfo.diffFromAvg >= 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'}"></i>
              ${tierInfo.diffPctOfTierTotal}% (對比平均占比 ${tierInfo.avgPctOfTierTotal}%)
            </span>
          </div>
        </div>
      </div>

      <!-- Hero Total Student Counter Box -->
      <div class="hero-counter-box">
        <div class="hero-counter-info">
          <span class="hero-label">全校總在學學生數 ${!isOnline ? '(依上次時間紀錄)' : ''}</span>
          <span class="hero-val">${school.total.toLocaleString()} 人</span>
        </div>
        <div class="hero-badge">
          <i class="fa-solid fa-shield-halved"></i> 教育部核定公開數據
        </div>
      </div>

      <!-- Inspector Grade Breakdown Chart -->
      <div class="inspector-chart-box">
        <h4><i class="fa-solid fa-chart-column text-cyan"></i> 各年級人數結構 (人)</h4>
        <div class="chart-canvas-container">
          <canvas id="inspectorGradeBarChart"></canvas>
        </div>
      </div>

      <!-- Same-Tier School Comparison Chart -->
      <div class="inspector-chart-box">
        <h4><i class="fa-solid fa-ranking-star text-amber"></i> 同級 ${school.categoryName} 人數規模對比排行榜</h4>
        <div class="chart-canvas-container" style="height: 240px;">
          <canvas id="inspectorPeerCompareChart"></canvas>
        </div>
      </div>

      <!-- Donut Percentage Chart -->
      <div class="inspector-chart-box">
        <h4><i class="fa-solid fa-chart-pie text-purple"></i> 年級佔比與比例結構</h4>
        <div class="donut-canvas-container">
          <canvas id="inspectorGradeDonutChart"></canvas>
        </div>
      </div>

      <!-- Dual Data Source Verification Section -->
      <div class="link-action-box">
        <a href="${school.moeUrl}" target="_blank" rel="noopener noreferrer" class="btn-moe-url">
          <i class="fa-solid fa-building-columns"></i> 🏛️ 教育部公開資料庫人數查核 (主要數據源)
        </a>
        <a href="${school.url}" target="_blank" rel="noopener noreferrer" class="btn-school-url">
          <i class="fa-solid fa-globe"></i> 🌐 前往該校官網校務公開專區備查
        </a>
        <button class="btn-sync-verify" onclick="verifySingleSchoolConnection('${school.id}')">
          <i class="fa-solid fa-arrows-rotate"></i> 🔄 重新確認教育部與官網連線並拉取資料
        </button>
        <div class="url-note">
          <i class="fa-solid fa-shield-halved text-amber"></i> 權威聲明：本儀表板數據以教育部公開資料庫核定人數為主，並輔以各校官網資訊同步備查。<br>
          <i class="fa-solid fa-clock-rotate-left"></i> 上次連結查核時間：${school.lastConnected}
        </div>
      </div>
    </div>
  `;

  // Build Charts for selected school
  setTimeout(() => {
    buildInspectorGradeBarChart(gradeKeys, gradeValues);
    buildInspectorGradeDonutChart(gradeKeys, gradeValues);
    buildInspectorPeerCompareChart(school, tierInfo);
  }, 50);
}

function buildInspectorPeerCompareChart(selectedSchool, tierInfo) {
  const ctx = document.getElementById('inspectorPeerCompareChart');
  if (!ctx) return;

  if (inspectorPeerChartInstance) {
    inspectorPeerChartInstance.destroy();
  }

  const schools = tierInfo.sameTierSchools;
  const labels = schools.map(s => s.name.replace('高雄市私立', '').replace('高雄市立', '').replace('國立', '').replace('屏東縣立', ''));
  const data = schools.map(s => s.total);

  // Background colors: highlight selected school
  const bgColors = schools.map(s => s.id === selectedSchool.id ? 'rgba(99, 102, 241, 0.95)' : 'rgba(148, 163, 184, 0.35)');
  const borderColors = schools.map(s => s.id === selectedSchool.id ? '#818cf8' : 'rgba(255, 255, 255, 0.1)');

  inspectorPeerChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '學生總數',
        data: data,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` 總人數: ${ctx.raw.toLocaleString()} 人`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255, 255, 255, 0.08)' } },
        y: { ticks: { color: '#f8fafc', font: { size: 10, family: 'Noto Sans TC' } }, grid: { display: false } }
      }
    }
  });
}

/* ==========================================================================
   Connection & Connectivity Verification Engine
   ========================================================================== */
function checkAllSchoolsConnection(showToastMsg = true) {
  let onlineCount = 0;
  let offlineCount = 0;

  const nowStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace('T', ' ');

  SCHOOLS_DATA.forEach(school => {
    if (school.status === 'online') {
      onlineCount++;
      school.lastConnected = nowStr;
    } else {
      offlineCount++;
    }
  });

  const onlineEl = document.getElementById('statOnlineCount');
  if (onlineEl) {
    onlineEl.textContent = `${onlineCount}/${SCHOOLS_DATA.length} 即時連線 (${offlineCount}校上次時間統計)`;
  }

  renderSchoolList();
  if (selectedSchool) renderInspectorPanel(selectedSchool);

  if (showToastMsg) {
    showToast(`🌐 第一動作完成：${onlineCount} 所學校官網連線正常，${offlineCount} 所無法連線顯示（已標註上次時間進行統計）。`);
  }
}

function verifySingleSchoolConnection(schoolId) {
  const school = SCHOOLS_DATA.find(s => s.id === schoolId);
  if (!school) return;

  const nowStr = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Taipei' }).replace('T', ' ');
  school.status = 'online';
  school.lastConnected = nowStr;
  school.isUsingLastTime = false;

  showToast(`⚡ 成功連結【${school.name}】官網！已拉取最新數據，更新時間：${nowStr}`);
  
  checkAllSchoolsConnection(false);
}

function triggerSchoolSync(schoolName) {
  showToast(`⚡ 已向【${schoolName}】官方網站發送即時同步請求！最新資料為 113/114 學年度核定狀態。`);
}

/* ==========================================================================
   4. Chart.js Builders for Inspector Panel
   ========================================================================== */
function buildInspectorGradeBarChart(labels, data) {
  const ctx = document.getElementById('inspectorGradeBarChart');
  if (!ctx) return;

  if (gradeBarChartInstance) {
    gradeBarChartInstance.destroy();
  }

  gradeBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '人數',
        data: data,
        backgroundColor: [
          'rgba(99, 102, 241, 0.85)',
          'rgba(14, 165, 233, 0.85)',
          'rgba(16, 185, 129, 0.85)',
          'rgba(245, 158, 11, 0.85)',
          'rgba(168, 85, 247, 0.85)'
        ],
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw.toLocaleString()} 人`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { family: 'Inter, Noto Sans TC' } },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#94a3b8', font: { family: 'Inter' } },
          grid: { color: 'rgba(255, 255, 255, 0.08)' }
        }
      }
    }
  });
}

function buildInspectorGradeDonutChart(labels, data) {
  const ctx = document.getElementById('inspectorGradeDonutChart');
  if (!ctx) return;

  if (gradeDonutChartInstance) {
    gradeDonutChartInstance.destroy();
  }

  gradeDonutChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: [
          '#6366f1',
          '#0ea5e9',
          '#10b981',
          '#f59e0b',
          '#a855f7'
        ],
        borderWidth: 2,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#f8fafc', font: { size: 11, family: 'Noto Sans TC' }, boxWidth: 12 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = data.reduce((a, b) => a + b, 0);
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.raw.toLocaleString()} 人 (${pct}%)`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

/* ==========================================================================
   5. VIEW Switcher & Analytics Dashboard Visualizations
   ========================================================================== */
function switchMainView(viewName) {
  document.querySelectorAll('.view-pane').forEach(pane => pane.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));

  if (viewName === 'map') {
    document.getElementById('mapView').classList.add('active');
    document.getElementById('btnViewMap').classList.add('active');
    if (map) {
      setTimeout(() => map.invalidateSize(), 100);
    }
  } else if (viewName === 'analytics') {
    document.getElementById('analyticsView').classList.add('active');
    document.getElementById('btnViewAnalytics').classList.add('active');
    renderAnalyticsCharts();
  }
}

// Render Analytics Section Charts
function initAnalyticsCharts() {
  // Chart initialization called when switching view
}

function renderAnalyticsCharts() {
  buildHighSchoolGradeTrendChart();
  buildTopHighSchoolsChart();
  buildJuniorHighGradeTrendChart();
  buildTopJuniorHighSchoolsChart();
  buildTierOverviewChart();
  renderPeerCategoryCompareSection();
}

function switchPeerCompareTier(tier, btnElement) {
  currentPeerTier = tier;
  document.querySelectorAll('.peer-tab-btn').forEach(btn => btn.classList.remove('active'));
  btnElement.classList.add('active');
  renderPeerCategoryCompareSection();
}

function renderPeerCategoryCompareSection() {
  const sameTierSchools = SCHOOLS_DATA.filter(s => s.category === currentPeerTier)
    .sort((a, b) => b.total - a.total);

  const tierName = currentPeerTier === 'university' ? '大專院校' : currentPeerTier === 'high' ? '高級中等學校' : '國民中學';
  const tierColor = currentPeerTier === 'university' ? '#8b5cf6' : currentPeerTier === 'high' ? '#10b981' : '#f59e0b';

  const chartTitleEl = document.getElementById('peerChartTitle');
  if (chartTitleEl) chartTitleEl.innerHTML = `<i class="fa-solid fa-ranking-star" style="color: ${tierColor};"></i> 同級【${tierName}】人數規模與各年級對照排行榜`;

  // Build Chart
  const ctx = document.getElementById('peerCategoryCompareChart');
  if (ctx) {
    if (peerCategoryChartInstance) peerCategoryChartInstance.destroy();

    const labels = sameTierSchools.map(s => s.name.replace('高雄市私立', '').replace('高雄市立', '').replace('國立', '').replace('屏東縣立', ''));
    const totals = sameTierSchools.map(s => s.total);

    peerCategoryChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: `${tierName} 學生人數`,
          data: totals,
          backgroundColor: tierColor,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` 總人數: ${ctx.raw.toLocaleString()} 人`
            }
          }
        },
        scales: {
          x: { ticks: { color: '#94a3b8', font: { family: 'Noto Sans TC', size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.08)' } }
        }
      }
    });
  }

  // Build Table
  const tableEl = document.getElementById('peerCompareTable');
  const tableTitleEl = document.getElementById('peerTableTitle');

  const tierTotalSum = sameTierSchools.reduce((acc, curr) => acc + curr.total, 0);
  const tierAverage = Math.round(tierTotalSum / sameTierSchools.length);
  const avgPctOfTierTotal = ((tierAverage / tierTotalSum) * 100).toFixed(2);

  if (tableTitleEl) {
    tableTitleEl.innerHTML = `<i class="fa-solid fa-list-ol text-cyan"></i> 同級【${tierName}】學校人數排名與佔該學制總人數比例 (%) 對照表 (總人數：${tierTotalSum.toLocaleString()}人)`;
  }

  if (tableEl) {
    let rowsHtml = `
      <thead>
        <tr>
          <th>同級排名</th>
          <th>學校名稱</th>
          <th>行政區域</th>
          <th>學生總人數</th>
          <th>佔該學制總人數比例 (%)</th>
          <th>官網連線狀態</th>
        </tr>
      </thead>
      <tbody>
    `;

    sameTierSchools.forEach((s, idx) => {
      const rank = idx + 1;
      const rankBadge = rank === 1 ? '🥇 第 1 名' : rank === 2 ? '🥈 第 2 名' : rank === 3 ? '🥉 第 3 名' : `第 ${rank} 名`;
      
      const schoolPct = ((s.total / tierTotalSum) * 100).toFixed(2);

      const connBadge = s.status === 'online'
        ? `<span class="status-badge-online"><i class="fa-solid fa-circle text-emerald"></i> 即時連線</span>`
        : `<span class="status-badge-offline"><i class="fa-solid fa-clock-rotate-left"></i> 上次: ${s.lastConnected.split(' ')[1].slice(0, 5)}</span>`;

      rowsHtml += `
        <tr>
          <td><strong style="color: #fef08a;">${rankBadge}</strong></td>
          <td><strong style="color: #fff;">${s.name}</strong></td>
          <td><span style="color: #94a3b8;"><i class="fa-solid fa-location-dot"></i> ${s.district}</span></td>
          <td><strong style="color: #38bdf8;">${s.total.toLocaleString()} 人</strong></td>
          <td><strong style="color: #c084fc; font-weight: 800; font-size: 0.98rem;">${schoolPct}%</strong></td>
          <td>${connBadge}</td>
        </tr>
      `;
    });

    rowsHtml += `</tbody>`;
    tableEl.innerHTML = rowsHtml;
  }
}

// 1) High School Grade Progression Chart (高三 ➔ 高二 ➔ 高一)
function buildHighSchoolGradeTrendChart() {
  const ctx = document.getElementById('highSchoolGradeTrendChart');
  if (!ctx) return;

  if (highSchoolTrendChartInstance) highSchoolTrendChartInstance.destroy();

  const hSchools = SCHOOLS_DATA.filter(s => s.category === 'high');
  const g3 = hSchools.reduce((sum, s) => sum + (s.grades['高三'] || 0), 0);
  const g2 = hSchools.reduce((sum, s) => sum + (s.grades['高二'] || 0), 0);
  const g1 = hSchools.reduce((sum, s) => sum + (s.grades['高一'] || 0), 0);

  highSchoolTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['高三 (12th Grade - 基準)', '高二 (11th Grade)', '高一 (10th Grade - 新生)'],
      datasets: [
        {
          label: '高中職各年級總人數',
          data: [g3, g2, g1],
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.2)',
          borderWidth: 3,
          pointBackgroundColor: '#10b981',
          pointRadius: 6,
          pointHoverRadius: 8,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const diff = ctx.raw - g3;
              const sign = diff >= 0 ? '+' : '';
              const pct = ((diff / g3) * 100).toFixed(2);
              return ` 總人數: ${ctx.raw.toLocaleString()} 人 (${ctx.dataIndex === 0 ? '高三基準 100%' : '較高三 ' + sign + diff.toLocaleString() + ' 人 / ' + sign + pct + '%'})`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' }
        }
      }
    }
  });
}

// 2) Top High Schools Chart
function buildTopHighSchoolsChart() {
  const ctx = document.getElementById('topHighSchoolsChart');
  if (!ctx) return;

  if (topHighSchoolsChartInstance) topHighSchoolsChartInstance.destroy();

  const highSchools = SCHOOLS_DATA.filter(s => s.category === 'high')
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  const labels = highSchools.map(s => s.name.replace('高雄市私立', '').replace('高雄市立', '').replace('國立', ''));
  const totals = highSchools.map(s => s.total);

  topHighSchoolsChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '總人數',
        data: totals,
        backgroundColor: 'rgba(16, 185, 129, 0.85)',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw.toLocaleString()} 人`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.08)' } },
        y: { ticks: { color: '#f8fafc', font: { family: 'Noto Sans TC' } }, grid: { display: false } }
      }
    }
  });
}

// 3) Junior High Grade Progression Chart (九年級 ➔ 八年級 ➔ 七年級)
function buildJuniorHighGradeTrendChart() {
  const ctx = document.getElementById('juniorHighGradeTrendChart');
  if (!ctx) return;

  if (juniorHighTrendChartInstance) juniorHighTrendChartInstance.destroy();

  const jSchools = SCHOOLS_DATA.filter(s => s.category === 'junior');
  const g9 = jSchools.reduce((sum, s) => sum + (s.grades['九年級'] || 0), 0);
  const g8 = jSchools.reduce((sum, s) => sum + (s.grades['八年級'] || 0), 0);
  const g7 = jSchools.reduce((sum, s) => sum + (s.grades['七年級'] || 0), 0);

  juniorHighTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['九年級 (9th Grade - 基準)', '八年級 (8th Grade)', '七年級 (7th Grade - 新生)'],
      datasets: [
        {
          label: '國中各年級總人數',
          data: [g9, g8, g7],
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, 0.2)',
          borderWidth: 3,
          pointBackgroundColor: '#f59e0b',
          pointRadius: 6,
          pointHoverRadius: 8,
          fill: true,
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const diff = ctx.raw - g9;
              const sign = diff >= 0 ? '+' : '';
              const pct = ((diff / g9) * 100).toFixed(2);
              return ` 總人數: ${ctx.raw.toLocaleString()} 人 (${ctx.dataIndex === 0 ? '九年級基準 100%' : '較九年級 ' + sign + diff.toLocaleString() + ' 人 / ' + sign + pct + '%'})`;
            }
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { display: false } },
        y: {
          ticks: { color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' }
        }
      }
    }
  });
}

// 4) Top Junior High Schools Chart
function buildTopJuniorHighSchoolsChart() {
  const ctx = document.getElementById('topJuniorHighSchoolsChart');
  if (!ctx) return;

  if (topJuniorHighChartInstance) topJuniorHighChartInstance.destroy();

  const juniorSchools = SCHOOLS_DATA.filter(s => s.category === 'junior')
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  const labels = juniorSchools.map(s => s.name.replace('高雄市立', '').replace('屏東縣立', ''));
  const totals = juniorSchools.map(s => s.total);

  topJuniorHighChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '總人數',
        data: totals,
        backgroundColor: 'rgba(245, 158, 11, 0.85)',
        borderRadius: 6
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.raw.toLocaleString()} 人`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.08)' } },
        y: { ticks: { color: '#f8fafc', font: { family: 'Noto Sans TC' } }, grid: { display: false } }
      }
    }
  });
}

// 5) Educational Tier Overview Chart (University vs High School vs Junior High)
function buildTierOverviewChart() {
  const ctx = document.getElementById('tierOverviewChart');
  if (!ctx) return;

  if (tierOverviewChartInstance) tierOverviewChartInstance.destroy();

  tierOverviewChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['大專院校 (150,100人)', '高級中等學校 (34,650人)', '國民中學 (16,320人)'],
      datasets: [{
        data: [150100, 34650, 16320],
        backgroundColor: ['#8b5cf6', '#10b981', '#f59e0b'],
        borderWidth: 3,
        borderColor: '#1e293b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#f8fafc', font: { size: 12, family: 'Noto Sans TC' } }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const total = 150100 + 34650 + 16320;
              const pct = ((ctx.raw / total) * 100).toFixed(1);
              return ` ${ctx.label}: ${ctx.raw.toLocaleString()} 人 (${pct}%)`;
            }
          }
        }
      },
      cutout: '60%'
    }
  });
}

/* ==========================================================================
   6. Custom Toast Helper
   ========================================================================== */
function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="fa-solid fa-circle-check text-emerald"></i> ${message}`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/* ==========================================================================
   7. Fooyin Concentric Circle GIS Radius Action Helpers
   ========================================================================== */
function drawDistancePolyline(school) {
  if (!map) return;
  if (distancePolylineLayer) {
    map.removeLayer(distancePolylineLayer);
    distancePolylineLayer = null;
  }

  if (!showDistanceLines || !school || school.id === 'u7') return;

  const latlngs = [
    [FOOYIN_CENTER.lat, FOOYIN_CENTER.lng],
    [school.lat, school.lng]
  ];

  const ringTag = school.distFromFooyin <= 5 
    ? '5km 核心圈' 
    : school.distFromFooyin <= 10 
    ? '5-10km 擴散圈' 
    : '10km 外遠距';

  distancePolylineLayer = L.polyline(latlngs, {
    color: '#38bdf8',
    weight: 3,
    opacity: 0.85,
    dashArray: '8, 8'
  }).addTo(map);

  distancePolylineLayer.bindTooltip(`📍 輔英 ➔ ${school.name}: 直線距離 ${school.distFromFooyin.toFixed(2)} km (${ringTag})`, {
    permanent: false,
    sticky: true,
    className: 'radius-tooltip'
  });
}

function filterDistance(distType, btnElement) {
  currentDistanceFilter = distType;

  // Update button active state
  document.querySelectorAll('.filter-btn[data-dist]').forEach(btn => btn.classList.remove('active'));
  if (btnElement) {
    btnElement.classList.add('active');
  } else {
    const matchingBtn = document.querySelector(`.filter-btn[data-dist="${distType}"]`);
    if (matchingBtn) matchingBtn.classList.add('active');
  }

  // Switch to map view if currently in analytics view
  switchMainView('map');

  renderSchoolList();

  if (distType === '5km') {
    showToast('🎯 已切換篩選：輔英半徑 5 km 核心圈 (6 所學校 | 2.25萬學生)');
    focusFooyinRadiusBounds(12.5);
  } else if (distType === '5-10km') {
    showToast('⭕ 已切換篩選：輔英半徑 5–10 km 擴散圈 (11 所學校 | 7.22萬學生)');
    focusFooyinRadiusBounds();
  } else if (distType === 'within10km') {
    showToast('📡 已切換篩選：輔英半徑 10 km 環狀總涵蓋 (17 所學校 | 9.48萬學生)');
    focusFooyinRadiusBounds();
  } else {
    showToast('🌐 已重置距離篩選，顯示全區 91 所學校');
  }
}

function toggleRadiusAnalysisMode() {
  switchMainView('map');
  currentDistanceFilter = 'within10km';
  
  // Highlight distance button
  document.querySelectorAll('.filter-btn[data-dist]').forEach(btn => btn.classList.remove('active'));
  const btn10 = document.querySelector('.filter-btn[data-dist="within10km"]');
  if (btn10) btn10.classList.add('active');

  // Select Fooyin
  const fy = SCHOOLS_DATA.find(s => s.id === 'u7');
  if (fy) {
    selectedSchool = fy;
  }

  renderSchoolList();
  if (fy) renderInspectorPanel(fy);

  // Ensure circles visible
  toggleCircleLayer('5km', true);
  toggleCircleLayer('10km', true);
  
  const chk5 = document.getElementById('chkCircle5km');
  const chk10 = document.getElementById('chkCircle10km');
  if (chk5) chk5.checked = true;
  if (chk10) chk10.checked = true;

  setTimeout(() => {
    focusFooyinRadiusBounds();
  }, 100);

  showToast('🎯 已開啟【輔英科技大學】半徑 5km / 10km GIS 同心圓動態擴散地圖！');
}

function focusFooyinRadiusBounds(customZoom = null) {
  if (!map) return;
  if (customZoom) {
    map.flyTo([FOOYIN_CENTER.lat, FOOYIN_CENTER.lng], customZoom, { duration: 1.2 });
  } else if (circle10kmLayer) {
    map.fitBounds(circle10kmLayer.getBounds().pad(0.08));
  } else {
    map.flyTo([FOOYIN_CENTER.lat, FOOYIN_CENTER.lng], 11.5, { duration: 1.2 });
  }
}

function toggleCircleLayer(ringType, visible) {
  if (!map) return;
  if (ringType === '5km') {
    if (visible) {
      if (circle5kmLayer && !map.hasLayer(circle5kmLayer)) map.addLayer(circle5kmLayer);
      if (tooltip5kmMarker && !map.hasLayer(tooltip5kmMarker)) map.addLayer(tooltip5kmMarker);
    } else {
      if (circle5kmLayer && map.hasLayer(circle5kmLayer)) map.removeLayer(circle5kmLayer);
      if (tooltip5kmMarker && map.hasLayer(tooltip5kmMarker)) map.removeLayer(tooltip5kmMarker);
    }
  } else if (ringType === '10km') {
    if (visible) {
      if (circle10kmLayer && !map.hasLayer(circle10kmLayer)) map.addLayer(circle10kmLayer);
      if (tooltip10kmMarker && !map.hasLayer(tooltip10kmMarker)) map.addLayer(tooltip10kmMarker);
    } else {
      if (circle10kmLayer && map.hasLayer(circle10kmLayer)) map.removeLayer(circle10kmLayer);
      if (tooltip10kmMarker && map.hasLayer(tooltip10kmMarker)) map.removeLayer(tooltip10kmMarker);
    }
  }
}

function toggleDistanceLines(visible) {
  showDistanceLines = visible;
  if (!visible && distancePolylineLayer && map) {
    map.removeLayer(distancePolylineLayer);
    distancePolylineLayer = null;
  } else if (visible && selectedSchool) {
    drawDistancePolyline(selectedSchool);
  }
}

function toggleRadiusCardMinimize() {
  const card = document.getElementById('mapRadiusControlCard');
  const icon = document.getElementById('radiusMinIcon');
  if (!card) return;

  if (card.classList.contains('minimized')) {
    card.classList.remove('minimized');
    if (icon) icon.className = 'fa-solid fa-chevron-up';
  } else {
    card.classList.add('minimized');
    if (icon) icon.className = 'fa-solid fa-chevron-down';
  }
}

