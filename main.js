var map;
var hubLayer    = null;
var stopsLayer  = null;
var stopsVisible = false;

function getColor(count, max) {
  var r = count / max;
  if (r > 0.75) return '#f85149';
  if (r > 0.45) return '#e3702a';
  if (r > 0.20) return '#d29922';
  return '#58a6ff';
}

window.addEventListener('load', function () {
  // Confirm #map has real pixel dimensions before init
  var mapEl = document.getElementById('map');
  console.log('Map el size at init:', mapEl.offsetWidth, 'x', mapEl.offsetHeight);

  map = L.map('map', {
    center: [28.535, 77.215],
    zoom: 12,
    preferCanvas: true,
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    keepBuffer: 4,
  }).addTo(map);

  loadClusters();

  document.getElementById('k-slider').addEventListener('input', function () {
    document.getElementById('k-val').textContent = this.value;
  });

  document.getElementById('apply-k').addEventListener('click', function () {
    var k = parseInt(document.getElementById('k-slider').value, 10);
    document.getElementById('k-display').textContent = k;
    loadClusters(k);
  });

  document.getElementById('toggle-stops').addEventListener('click', toggleStops);

  window.addEventListener('resize', function () { map.invalidateSize(); });
});

function loadClusters(k) {
  var statsDiv = document.getElementById('stats');
  statsDiv.innerHTML = '<div class="loading-pulse"><div></div><div></div><div></div></div>';

  fetch(k ? '/api/clusters?k=' + k : '/api/clusters')
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function (data) {
      if (data.error) {
        statsDiv.innerHTML = '<p style="color:#f85149;padding:16px;font-size:0.82rem;">' + data.error + '</p>';
        return;
      }
      renderHubs(data.clusters || []);
      renderSidebar(data.clusters || [], data.total_stops);
    })
    .catch(function (err) {
      statsDiv.innerHTML = '<p style="color:#f85149;padding:16px;font-size:0.82rem;">Error: ' + err.message + '<br>Run: python generate_clusters.py</p>';
    });
}

function renderHubs(clusters) {
  if (hubLayer) hubLayer.clearLayers();
  hubLayer = L.layerGroup().addTo(map);

  var maxCount = 1;
  clusters.forEach(function (c) { maxCount = Math.max(maxCount, Number(c.stop_count) || 0); });

  var bounds = L.latLngBounds();
  var valid = 0;

  clusters.forEach(function (hub) {
    if (!Array.isArray(hub.center) || hub.center.length !== 2) return;

    var lat = Number(hub.center[0]);
    var lng = Number(hub.center[1]);
    if (isNaN(lat) || isNaN(lng)) return;

    // Auto-fix swapped coordinates
    if (Math.abs(lat) > 60 || lat < 5) { var t = lat; lat = lng; lng = t; }

    // Delhi bounds check
    if (lat < 28.2 || lat > 28.9 || lng < 76.8 || lng > 77.6) {
      console.warn('Out of Delhi bounds:', hub.hub_name, lat, lng);
      return;
    }

    var count  = Number(hub.stop_count) || 0;
    var color  = getColor(count, maxCount);
    var radius = 400 + (count / maxCount) * 1200;

    // Glow ring
    L.circle([lat, lng], {
      radius: radius * 1.5, color: color, weight: 0,
      fillColor: color, fillOpacity: 0.07, interactive: false
    }).addTo(hubLayer);

    // Main circle
    var circle = L.circle([lat, lng], {
      radius: radius, color: color, weight: 2,
      fillColor: color, fillOpacity: 0.3
    }).addTo(hubLayer);

    // Number label
    L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:28px;height:28px;background:' + color + ';color:#0d1117;font-family:monospace;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center;border-radius:50%;border:2px solid rgba(255,255,255,0.3);box-shadow:0 2px 8px rgba(0,0,0,0.5);">' + hub.hub_id + '</div>',
        iconSize: [28, 28], iconAnchor: [14, 14]
      }),
      interactive: false
    }).addTo(hubLayer);

    var stopLines = (hub.stops_assigned || []).slice(0, 15).map(function (s) {
      return '<span>• ' + s + '</span>';
    }).join('');

    circle.bindPopup(
      '<div class="popup-title">' + hub.hub_name + '</div>' +
      '<div class="popup-meta">Hub #' + hub.hub_id + ' &nbsp;·&nbsp; ' + count + ' stops</div>' +
      (stopLines ? '<div class="popup-stops">' + stopLines + '</div>' : ''),
      { maxWidth: 250 }
    );

    circle.on('click', function () {
      document.querySelectorAll('.hub-card').forEach(function (el) { el.classList.remove('hub-card--active'); });
      var card = document.getElementById('hub-card-' + hub.hub_id);
      if (card) { card.classList.add('hub-card--active'); card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    });

    bounds.extend([lat, lng]);
    valid++;
  });

  console.log('Rendered', valid, '/', clusters.length, 'hubs');

  if (valid > 0 && bounds.isValid()) {
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  } else {
    map.setView([28.54, 77.20], 12);
  }
}

function renderSidebar(clusters, totalStops) {
  var statsDiv = document.getElementById('stats');
  statsDiv.innerHTML = '';

  var maxCount = 1;
  clusters.forEach(function (c) { maxCount = Math.max(maxCount, Number(c.stop_count) || 0); });

  clusters.forEach(function (hub, i) {
    var count = Number(hub.stop_count) || 0;
    var color = getColor(count, maxCount);
    var pct   = Math.round((count / maxCount) * 100);

    var card = document.createElement('div');
    card.className = 'hub-card';
    card.id = 'hub-card-' + hub.hub_id;
    card.style.animationDelay = (i * 55) + 'ms';
    card.innerHTML =
      '<div class="hub-card-header"><span class="hub-name">' + hub.hub_name + '</span><span class="hub-rank">#' + hub.hub_id + '</span></div>' +
      '<div class="hub-bar-wrap"><div class="hub-bar" style="width:' + pct + '%;background:' + color + ';"></div></div>' +
      '<div class="hub-meta"><strong>' + count + '</strong> stops</div>';

    card.addEventListener('click', function () {
      if (!Array.isArray(hub.center) || hub.center.length !== 2) return;
      var lat = Number(hub.center[0]); var lng = Number(hub.center[1]);
      if (!isNaN(lat) && !isNaN(lng)) map.flyTo([lat, lng], 14, { duration: 1.2 });
      document.querySelectorAll('.hub-card').forEach(function (el) { el.classList.remove('hub-card--active'); });
      card.classList.add('hub-card--active');
    });

    statsDiv.appendChild(card);
  });

  if (totalStops) {
    document.getElementById('total-stops-label').textContent = Number(totalStops).toLocaleString();
  }
}

function toggleStops() {
  var btn = document.getElementById('toggle-stops');

  if (stopsVisible) {
    if (stopsLayer) stopsLayer.clearLayers();
    stopsVisible = false;
    btn.textContent = '⦿  Show All Stops';
    btn.classList.remove('active');
    return;
  }

  btn.textContent = 'Loading…';
  btn.disabled = true;

  fetch('/api/all-stops')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.error) { alert('Error: ' + data.error); btn.textContent = '⦿  Show All Stops'; btn.disabled = false; return; }
      if (stopsLayer) stopsLayer.clearLayers();
      stopsLayer = L.layerGroup().addTo(map);
      (data.stops || []).forEach(function (s) {
        var lat = Number(s.lat); var lon = Number(s.lon);
        if (isNaN(lat) || isNaN(lon)) return;
        L.circleMarker([lat, lon], { radius: 4, color: '#58a6ff', weight: 1, fillColor: '#58a6ff', fillOpacity: 0.8 })
          .addTo(stopsLayer).bindPopup('<b>' + (s.name || 'Bus Stop') + '</b>');
      });
      stopsVisible = true;
      btn.textContent = '⦿  Hide All Stops';
      btn.classList.add('active');
      btn.disabled = false;
    })
    .catch(function (err) { alert('Cannot load stops: ' + err.message); btn.textContent = '⦿  Show All Stops'; btn.disabled = false; });
}