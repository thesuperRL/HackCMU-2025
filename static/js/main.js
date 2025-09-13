function sendToFlask(jsonData) {
  fetch("/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ account_json: jsonData }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Status:", data.status);
    });
}

function decodeJWT(token) {
  let base64Url = token.split(".")[1];
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  let jsonPayload = decodeURIComponent(
    atob(base64)
      .split("")
      .map(function (c) {
        return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2);
      })
      .join("")
  );
  return JSON.parse(jsonPayload);
}

function handleCredentialResponse(response) {
  console.log("Encoded JWT ID token: " + response.credential);

  const responsePayload = decodeJWT(response.credential);

  sendToFlask({
    name: responsePayload.name,
    email: responsePayload.email,
    id: responsePayload.sub,
  });

  const user = {
    name: responsePayload.name,
    email: responsePayload.email,
    picture: responsePayload.picture,
    uid: responsePayload.sub,
  };
  setUser(user);
  closeMenu();
}

// --- Minimal Google ID token decode (for name/email/photo) ---
function decodeJWT(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload);
  } catch {
    return {};
  }
}

// Store/autofill helpers
function setUser(u) {
  try {
    if (!u.since) u.since = new Date().toISOString();
    localStorage.setItem("lfq.user", JSON.stringify(u));
  } catch {}
  applyUserToUI(u);
}
function clearUser() {
  try {
    localStorage.removeItem("lfq.user");
  } catch {}
  applyUserToUI(null);
}
function applyUserToUI(u) {
  const btn = document.getElementById("profileBtn");
  const nameEl = document.getElementById("ddName");
  const emailEl = document.getElementById("ddEmail");
  const gisBlock = document.getElementById("gisBlock");

  if (u && (u.name || u.email)) {
    nameEl.textContent = u.name || "User";
    emailEl.textContent = u.email || "";
    if (u.picture) {
      btn.innerHTML = "";
      const img = new Image();
      img.src = u.picture;
      img.alt = u.name || "User";
      btn.appendChild(img);
    } else {
      btn.innerHTML = '<i class="bi bi-person-circle" aria-hidden="true"></i>';
    }
    // Hide Google Sign-In if logged in
    gisBlock.style.display = "none";
  } else {
    nameEl.textContent = "Guest";
    emailEl.textContent = "Not signed in";
    btn.innerHTML = '<i class="bi bi-person-circle" aria-hidden="true"></i>';
    gisBlock.style.display = "flex";
  }
}

// Render the Google button lazily when menu opens (fixes hidden-render issues)
let gisRendered = false;
function renderGoogleButtonIfNeeded() {
  if (gisRendered || !window.google || !google.accounts || !google.accounts.id)
    return;
  const el = document.getElementById("gisBtn");
  google.accounts.id.renderButton(el, {
    theme: "filled_blue",
    size: "large",
    type: "standard",
    shape: "pill",
    text: "signin_with",
  });
  gisRendered = true;
}

// Dropdown behavior
const btn = document.getElementById("profileBtn");
const menu = document.getElementById("profileMenu");
function openMenu() {
  menu.classList.remove("hidden");
  btn.setAttribute("aria-expanded", "true");
  renderGoogleButtonIfNeeded();
}
function closeMenu() {
  menu.classList.add("hidden");
  btn.setAttribute("aria-expanded", "false");
}
function toggleMenu() {
  menu.classList.contains("hidden") ? openMenu() : closeMenu();
}

if (btn && menu) {
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleMenu();
  });
  document.addEventListener("click", (e) => {
    if (!menu.classList.contains("hidden") && !menu.contains(e.target))
      closeMenu();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
}

const logoutEl = document.getElementById("logoutMenuBtn");
if (logoutEl) {
  logoutEl.addEventListener("click", () => {
    // Optional: call your backend logout here
    clearUser();
    closeMenu();
  });
}

// Load saved user if present
(function () {
  try {
    const saved = localStorage.getItem("lfq.user");
    applyUserToUI(saved ? JSON.parse(saved) : null);
  } catch {
    applyUserToUI(null);
  }
})();

// MAP ==============================

function initMapIfPresent() {
  const mapEl = document.getElementById("map");
  if (!mapEl || !window.L) return; // Only run on pages with a map

  const showMapError = (msg) => {
    const el = document.getElementById("mapError");
    if (!el) return;
    el.textContent = msg;
    el.style.display = "block";
  };

  const map = L.map("map", {
    // Start centered over the continental US
    center: [39.8283, -98.5795],
    zoom: 4,
    scrollWheelZoom: true,
    tap: false,
    maxBounds: [[-85, -180], [85, 180]],
    maxBoundsViscosity: 1.0,
    minZoom: 3,
    maxZoom: 19,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>',
    noWrap: true,
  }).addTo(map);

  // Controls
  document.getElementById("centerPghBtn")?.addEventListener("click", () => {
    map.setView([40.44, -79.94], 9);
  });
  document.getElementById("resetUSBtn")?.addEventListener("click", () => {
    map.setView([39.8283, -98.5795], 4);
  });
  document.getElementById("refreshMapBtn")?.addEventListener("click", () => {
    try { refreshData && refreshData(); } catch {}
  });

  const clusters = L.markerClusterGroup({
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    disableClusteringAtZoom: 18,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let sizeClass = "small";
      if (count >= 50 && count < 200) sizeClass = "medium";
      else if (count >= 200) sizeClass = "large";
      return new L.DivIcon({
        html: "<div><span>" + count + "</span></div>",
        className: "marker-cluster marker-cluster-" + sizeClass,
        iconSize: L.point(
          sizeClass === "large" ? 60 : sizeClass === "medium" ? 44 : 30,
          sizeClass === "large" ? 60 : sizeClass === "medium" ? 44 : 30
        ),
      });
    },
  });

  function addRows(rows) {
    // Rebuild markers each time based on fresh table data
    try { clusters.clearLayers(); } catch {}
    let currentUserName = null;
    let currentUserEmail = null;
    try {
      const u = JSON.parse(localStorage.getItem('lfq.user') || 'null');
      if (u) { currentUserName = (u.name||'').toLowerCase(); currentUserEmail = (u.email||'').toLowerCase(); }
    } catch {}
    // Pull the last report context for accurate popup targeting
    let lr = null; let lrTs = null; let reportedMarker = null;
    try { lr = JSON.parse(localStorage.getItem('lfq.lastReport') || 'null'); lrTs = lr?.timestamp || null; } catch {}

    for (const row of rows) {
      const lat = Number(row.latitude ?? row.lat ?? row.Latitude);
      const lon = Number(row.longitude ?? row.lon ?? row.Longitude);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const displayName = row.name || row.Name || "Sighting";
      let popup = `<b>${displayName}</b><br>`;
      const date = row.date || row.TimestampISO || row.timestamp || row.Date;
      if (date) popup += `<i>${date}</i><br>`;
      const img = row.image_link || row.ImageDataURL || row.Image;
      if (img) popup += `<img src="${img}" alt="Lanternfly" width="120" />`;
      // Choose icon: default Leaflet pin for most; a blue SVG pin for current user's pins
      const rowNameLc = (row.Name || row.name || '').toLowerCase();
      const rowEmailLc = (row.Email || row.email || '').toLowerCase();
      let marker;
      if ((currentUserEmail && rowEmailLc && rowEmailLc === currentUserEmail) ||
          (!currentUserEmail && currentUserName && rowNameLc && rowNameLc === currentUserName)) {
        const svg = `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#0ea5e9"/>
          <circle cx="12.5" cy="12.5" r="5.5" fill="#ffffff"/>
        </svg>`;
        const icon = L.divIcon({ className: 'lfq-pin', html: svg, iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [0,-34] });
        marker = L.marker([lat, lon], { opacity: 1, icon });
      } else {
        marker = L.marker([lat, lon], { opacity: 1 });
      }
      marker.bindPopup(popup);
      clusters.addLayer(marker);

      // If this row matches the last submitted report, remember its marker
      if (!reportedMarker) {
        const rowTs = (row.Date || row.date || row.TimestampISO || row.timestamp || '').toString();
        const tsMatch = lrTs && rowTs && rowTs === lrTs;
        const coordMatch = lr && Math.abs(lat - Number(lr.latitude ?? lr.lat ?? NaN)) < 1e-5 && Math.abs(lon - Number(lr.longitude ?? lr.lon ?? NaN)) < 1e-5;
        if (tsMatch || coordMatch) reportedMarker = marker;
      }
    }
    map.addLayer(clusters);
    // If coming from a fresh report, center on that location
    try {
      const lrLocal = lr || JSON.parse(localStorage.getItem('lfq.lastReport') || 'null');
      if (lrLocal) {
        if (reportedMarker && typeof reportedMarker.getLatLng === 'function') {
          const pos = reportedMarker.getLatLng();
          map.setView([pos.lat, pos.lng], 14);
          clusters.zoomToShowLayer(reportedMarker, () => reportedMarker.openPopup());
        } else if (isFinite(lrLocal.latitude ?? lrLocal.lat) && isFinite(lrLocal.longitude ?? lrLocal.lon)) {
          const la = Number(lrLocal.latitude ?? lrLocal.lat);
          const lo = Number(lrLocal.longitude ?? lrLocal.lon);
          if (Math.hypot(la, lo) > 0.001) { // avoid (0,0)
            map.setView([la, lo], 14);
            let nearest = null, best = Infinity;
            clusters.eachLayer(layer => {
              if (typeof layer.getLatLng === 'function') {
                const ll = layer.getLatLng();
                const d = map.distance([la, lo], ll);
                if (d < best) { best = d; nearest = layer; }
              }
            });
            if (nearest) clusters.zoomToShowLayer(nearest, () => nearest.openPopup());
          }
        }
        localStorage.removeItem('lfq.lastReport');
      }
    } catch {}
  }

  async function loadFromServer() {
    try {
      const resp = await fetch("/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      if (Array.isArray(data) && data.length) {
        addRows(data);
        return true;
      }
      return false;
    } catch (e) {
      console.warn("/locations failed, will try CSV:", e);
      return false;
    }
  }

  async function loadFromCSV() {
    try {
      const url = "/static/data/lanternflydata.csv?ts=" + Date.now();
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("CSV HTTP " + res.status);
      const text = await res.text();
      if (!window.Papa) throw new Error("PapaParse not loaded");
      const parsed = Papa.parse(text, { header: true, dynamicTyping: true });
      addRows(parsed.data || []);
      return true;
    } catch (e) {
      console.error("CSV load failed:", e);
      showMapError("Could not load map data.");
      return false;
    }
  }

  async function refreshData() {
    const ok = await loadFromServer();
    if (!ok) await loadFromCSV();
  }
  // Initial load and continuous refresh based on table
  refreshData();
  setInterval(refreshData, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshData(); });
}

// Initialize map if the page has one
try { initMapIfPresent(); } catch (e) { console.error(e); }
