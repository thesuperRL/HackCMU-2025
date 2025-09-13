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

// HOME STATS =======================
async function updateHomeStats() {
  const rankEl = document.getElementById("statTotalPoints"); // shows rank now
  const streakEl = document.getElementById("statStreak");
  const catchesEl = document.getElementById("statCatches");
  if (!rankEl && !streakEl && !catchesEl) return;

  const getLocalScores = () => {
    try {
      const raw = localStorage.getItem("lfq:scores");
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };
  let rows = [];
  try {
    const resp = await fetch("/leaderboard-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request" }),
    });
    const data = await resp.json();
    rows = Array.isArray(data) ? data : [];
  } catch {
    rows = [];
  }

  const local = getLocalScores();
  // Merge local with server, prefer local catches for current user
  const byUid = new Map();
  for (const r of rows) if (r && r.uid) byUid.set(r.uid, { ...r });
  for (const r of local) {
    if (!r || !r.uid) continue;
    if (!byUid.has(r.uid)) byUid.set(r.uid, { ...r });
    else {
      const cur = byUid.get(r.uid);
      const merged = { ...cur };
      if ((r.catches ?? 0) > (cur.catches ?? 0)) merged.catches = r.catches;
      if (r.username && !cur.username) merged.username = r.username;
      if (r.streak != null) merged.streak = r.streak;
      byUid.set(r.uid, merged);
    }
  }
  rows = Array.from(byUid.values());

  // sort by catches desc to compute rank
  rows.sort((a, b) => {
    const av = a.catches ?? 0,
      bv = b.catches ?? 0;
    if (av !== bv) return bv - av; // desc
    const an = (a.username || "").toLowerCase();
    const bn = (b.username || "").toLowerCase();
    return an.localeCompare(bn);
  });

  const cur = (() => {
    try {
      return JSON.parse(localStorage.getItem("lfq.user") || "null");
    } catch {
      return null;
    }
  })();
  const uid = cur && cur.uid;
  let my = null;
  let myRank = 0;
  if (uid) {
    for (let i = 0; i < rows.length; i++)
      if (rows[i].uid === uid) {
        my = rows[i];
        myRank = i + 1;
        break;
      }
  } else if (local.length) {
    // guest: take the latest entry (most recently updated) by order in storage
    my = local[local.length - 1];
    myRank = rows.findIndex((r) => r.uid === my.uid) + 1 || 0;
  }

  if (rankEl) rankEl.textContent = myRank || 0;
  if (streakEl) streakEl.textContent = my && my.streak ? my.streak : 0;
  if (catchesEl) catchesEl.textContent = my && my.catches ? my.catches : 0;
}

// Update on load and when local scores change
try {
  updateHomeStats();
} catch {}
window.addEventListener("storage", (e) => {
  if (e.key === "lfq:scores") updateHomeStats();
});
document.addEventListener("lfq:scores-updated", updateHomeStats);

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
    maxBounds: [
      [-85, -180],
      [85, 180],
    ],
    maxBoundsViscosity: 1.0,
    minZoom: 3,
    maxZoom: 19,
  });

  L.tileLayer(
    "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>',
      noWrap: true,
    }
  ).addTo(map);

  // Controls
  document.getElementById("centerPghBtn")?.addEventListener("click", () => {
    map.setView([40.44, -79.94], 9);
  });
  document.getElementById("resetUSBtn")?.addEventListener("click", () => {
    map.setView([39.8283, -98.5795], 4);
  });
  document.getElementById("refreshMapBtn")?.addEventListener("click", () => {
    try {
      refreshData && refreshData();
    } catch {}
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
      let hasMine = false;
      try {
        hasMine = cluster
          .getAllChildMarkers()
          .some((m) => m && m.options && m.options.isMine);
      } catch {}
      const classes =
        "marker-cluster marker-cluster-" +
        sizeClass +
        (hasMine ? " has-mine" : "");
      return new L.DivIcon({
        html: "<div><span>" + count + "</span></div>",
        className: classes,
        iconSize: L.point(
          sizeClass === "large" ? 60 : sizeClass === "medium" ? 44 : 30,
          sizeClass === "large" ? 60 : sizeClass === "medium" ? 44 : 30
        ),
      });
    },
  });

  function hexDumpToDataUrl(hexDump) {
    // Remove the "\x" parts and join into a continuous hex string
    const hexStr = hexDump.replace(/\\x/g, "");

    // Convert hex string → byte array
    const bytes = new Uint8Array(hexStr.length / 2);
    for (let i = 0; i < hexStr.length; i += 2) {
      bytes[i / 2] = parseInt(hexStr.substr(i, 2), 16);
    }

    // Convert bytes → binary string
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    // Encode as base64 and return Data URL
    const base64 = btoa(binary);
    return `data:image/jpeg;base64,${base64}`;
  }

  function addRows(rows) {
    // Rebuild markers each time based on fresh table data
    try {
      clusters.clearLayers();
    } catch {}
    let currentUserName = null;
    let currentUserEmail = null;
    try {
      const u = JSON.parse(localStorage.getItem("lfq.user") || "null");
      if (u) {
        currentUserName = (u.name || "").toLowerCase();
        currentUserEmail = (u.email || "").toLowerCase();
      }
    } catch {}
    // Pull the last report context for accurate popup targeting
    let lr = null;
    let lrTs = null;
    let reportedMarker = null;
    try {
      lr = JSON.parse(localStorage.getItem("lfq.lastReport") || "null");
      lrTs = lr?.timestamp || null;
    } catch {}

    function prettyDate(val) {
      if (val == null) return "";
      const raw = String(val)
        .trim()
        .replace(/^["']+|["']+$/g, "");
      if (!raw) return "";
      // Show human-friendly time when possible, else show raw
      try {
        // ISO 8601 with Z or timezone
        const d1 = new Date(raw);
        if (!isNaN(d1.valueOf())) return d1.toLocaleString();
        // Numeric epoch seconds or ms
        const n = Number(raw);
        if (isFinite(n) && n > 0) {
          const ms = n < 1e12 ? n * 1000 : n;
          const d2 = new Date(ms);
          if (!isNaN(d2.valueOf())) return d2.toLocaleString();
        }
      } catch {}
      return raw;
    }

    // Keep pins even if date fails to parse; we will display raw
    for (const row of rows) {
      // Normalize keys: trim + lowercase to be resilient to CSV header variations
      const norm = {};
      for (const k in row) {
        if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
        norm[String(k).trim().toLowerCase()] = row[k];
      }

      const lat = Number(norm["latitude"] ?? norm["lat"]);
      const lon = Number(norm["longitude"] ?? norm["lon"]);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      const displayName = norm["name"] ?? "Sighting";
      let popup = `<b>${displayName}</b><br>`;
      const date = norm["date"] ?? norm["timestampiso"] ?? norm["timestamp"];
      const dateStr = prettyDate(date);
      if (dateStr) popup += `<i>${dateStr}</i><br>`;
      const img = hexDumpToDataUrl(norm["image_bytes"]);
      console.log(norm["image_bytes"].substr(1, norm["image_bytes"].length));
      if (img) {
        console.log(img);
        popup += `<img class="lfq-pop-img" src="${img}" alt="Lanternfly" />`;
      }
      // Choose icon: default Leaflet pin for most; a blue SVG pin for current user's pins
      const rowNameLc = (norm["name"] || "").toLowerCase();
      const rowEmailLc = (norm["email"] || "").trim().toLowerCase();
      let marker;
      // Only use email for matching to avoid false positives
      if (currentUserEmail && rowEmailLc && rowEmailLc === currentUserEmail) {
        const svg = `<svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M12.5 0C5.6 0 0 5.6 0 12.5c0 9.4 12.5 28.5 12.5 28.5S25 21.9 25 12.5C25 5.6 19.4 0 12.5 0z" fill="#ef4444"/>
          <circle cx="12.5" cy="12.5" r="5.5" fill="#ffffff"/>
        </svg>`;
        const icon = L.divIcon({
          className: "lfq-pin",
          html: svg,
          iconSize: [25, 41],
          iconAnchor: [12, 41],
          popupAnchor: [0, -34],
        });
        marker = L.marker([lat, lon], { opacity: 1, icon, isMine: true });
      } else {
        marker = L.marker([lat, lon], { opacity: 1, isMine: false });
      }
      marker.bindPopup(popup);
      clusters.addLayer(marker);

      // If this row matches the last submitted report, remember its marker
      if (!reportedMarker) {
        const rowTs = String(
          norm["date"] ?? norm["timestampiso"] ?? norm["timestamp"] ?? ""
        );
        const tsMatch = lrTs && rowTs && rowTs === lrTs;
        const coordMatch =
          lr &&
          Math.abs(lat - Number(lr.latitude ?? lr.lat ?? NaN)) < 1e-5 &&
          Math.abs(lon - Number(lr.longitude ?? lr.lon ?? NaN)) < 1e-5;
        if (tsMatch || coordMatch) reportedMarker = marker;
      }
    }
    map.addLayer(clusters);
    // If coming from a fresh report, center on that location
    try {
      const lrLocal =
        lr || JSON.parse(localStorage.getItem("lfq.lastReport") || "null");
      if (lrLocal) {
        if (reportedMarker && typeof reportedMarker.getLatLng === "function") {
          const pos = reportedMarker.getLatLng();
          map.setView([pos.lat, pos.lng], 14);
          clusters.zoomToShowLayer(reportedMarker, () =>
            reportedMarker.openPopup()
          );
        } else if (
          isFinite(lrLocal.latitude ?? lrLocal.lat) &&
          isFinite(lrLocal.longitude ?? lrLocal.lon)
        ) {
          const la = Number(lrLocal.latitude ?? lrLocal.lat);
          const lo = Number(lrLocal.longitude ?? lrLocal.lon);
          if (Math.hypot(la, lo) > 0.001) {
            // avoid (0,0)
            map.setView([la, lo], 14);
            let nearest = null,
              best = Infinity;
            clusters.eachLayer((layer) => {
              if (typeof layer.getLatLng === "function") {
                const ll = layer.getLatLng();
                const d = map.distance([la, lo], ll);
                if (d < best) {
                  best = d;
                  nearest = layer;
                }
              }
            });
            if (nearest)
              clusters.zoomToShowLayer(nearest, () => nearest.openPopup());
          }
        } else {
          // If we haven't found the just-submitted report yet, retry a few times quickly
          try {
            const tries = Number(lrLocal.tries || 0);
            if (tries < 20) {
              lrLocal.tries = tries + 1;
              localStorage.setItem("lfq.lastReport", JSON.stringify(lrLocal));
            } else {
              localStorage.removeItem("lfq.lastReport");
            }
          } catch {}
        }
        // When we’ve centered and opened, clear the hint
        try {
          if (reportedMarker) localStorage.removeItem("lfq.lastReport");
        } catch {}
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

  async function refreshData() {
    const ok = await loadFromServer();
    // Initial load and continuous refresh based on table
    setInterval(refreshData, 2000000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshData();
    });
  }

  refreshData();
}

// Ensure pages that include only main.js still initialize the map
try {
  initMapIfPresent();
} catch (e) {
  console.warn("Map initialization failed:", e);
}
