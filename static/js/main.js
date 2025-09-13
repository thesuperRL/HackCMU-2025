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
    center: [40.44, -79.94],
    zoom: 9,
    scrollWheelZoom: true,
    tap: false,
  });

  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, &copy; <a href="https://carto.com/attribution">CARTO</a>',
  }).addTo(map);

  document.getElementById("recenter")?.addEventListener("click", () => {
    map.setView([40.44, -79.94], 9);
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
    for (const row of rows) {
      const lat = Number(row.latitude ?? row.lat ?? row.Latitude);
      const lon = Number(row.longitude ?? row.lon ?? row.Longitude);
      if (!isFinite(lat) || !isFinite(lon)) continue;
      let popup = `<b>${row.name || row.Name || "Sighting"}</b><br>`;
      const date = row.date || row.TimestampISO || row.timestamp;
      if (date) popup += `<i>${date}</i><br>`;
      const img = row.image_link || row.ImageDataURL || row.Image;
      if (img) popup += `<img src="${img}" alt="Lanternfly" width="120" />`;
      clusters.addLayer(L.marker([lat, lon], { opacity: 1 }).bindPopup(popup));
    }
    map.addLayer(clusters);
    if (clusters.getLayers().length > 0) {
      const bounds = clusters.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
    }
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
      const url = "/static/data/lanternflydata.csv";
      const res = await fetch(url, { cache: "no-cache" });
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

  (async () => {
    const ok = await loadFromServer();
    if (!ok) await loadFromCSV();
  })();
}

// Initialize map if the page has one
try { initMapIfPresent(); } catch (e) { console.error(e); }
