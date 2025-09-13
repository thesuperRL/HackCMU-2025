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

document.getElementById("logoutMenuBtn").addEventListener("click", () => {
  // Optional: call your backend logout here
  clearUser();
  closeMenu();
});

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

const CSV_URL = "static/data/lanternflydata.csv";

const showMapError = (msg) => {
  const el = document.getElementById("mapError");
  el.textContent = msg;
  el.style.display = "block";
};

var map = L.map("map", {
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

var clusters = L.markerClusterGroup({
  maxClusterRadius: 60,
  spiderfyOnMaxZoom: true,
  showCoverageOnHover: false,
  disableClusteringAtZoom: 18,
  iconCreateFunction: function (cluster) {
    var count = cluster.getChildCount();
    var sizeClass = "small";
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

(async () => {
  try {
    const res = await fetch(CSV_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`CSV HTTP ${res.status}`);
    const csvString = await res.text();

    const parsed = Papa.parse(csvString, { header: true, dynamicTyping: true });
    const data = parsed.data || [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (!row || !row.Latitude || !row.Longitude) continue;

      var popupContent = `<b>${row.Name || "Sighting"}</b><br>`;
      if (row.Date) popupContent += `<i>${row.Date}</i><br>`;
      if (row.Image)
        popupContent += `<img src="${row.Image}" alt="${
          row.Name || "Lanternfly"
        }" width="120" />`;

      var marker = L.marker([row.Latitude, row.Longitude], {
        opacity: 1,
      }).bindPopup(popupContent);
      clusters.addLayer(marker);
    }

    map.addLayer(clusters);

    if (clusters.getLayers().length > 0) {
      var bounds = clusters.getBounds();
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.1));
    }
  } catch (err) {
    console.error("Error loading CSV:", err);
    showMapError(
      "Could not load data. Check CSV path and that you’re serving over http(s)."
    );
  }
})();
