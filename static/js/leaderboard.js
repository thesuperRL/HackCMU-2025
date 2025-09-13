const STORAGE_KEY = "lfq:scores";

// -------- utilities --------
const nowIso = () => new Date().toISOString();
const fmtTimeAgo = (iso) => {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
};

async function getScores() {
  try {
    const response = await fetch("/leaderboard-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request" }),
    });
    const data = await response.json();
    console.log("Status:", data);
    return data; // This will return the actual data
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return []; // Return empty array on error
  }
}

function setScores(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  dispatchEvent(new Event("lfq:scores-updated"));
}

// -------- rendering --------
const bodyEl = document.getElementById("leaderboardBody");
const emptyEl = document.getElementById("emptyState");
const lastSyncEl = document.getElementById("lastSync");
const searchEl = document.getElementById("searchInput");

const sortState = { key: "catches", dir: "asc" }; // default sort
const sortableHeaders = Array.from(document.querySelectorAll("th.sortable"));

async function computeRows(filterTerm = "") {
  const data = await getScores();
  console.log("Raw data:", data);

  // Handle different data types
  let rows = [];

  if (Array.isArray(data)) {
    // If data is already an array (your expected format)
    rows = data.map((item, index) => ({
      username: item.username,
      catches: item.catches,
      uid: item.uid,
      // Add other properties if they exist in your data
      id: index,
    }));
  } else if (typeof data === "object" && data !== null) {
    // If data is an object (original code expected format)
    rows = Object.entries(data).map(([username, v]) => ({
      username,
      ...v,
    }));
  } else {
    // Fallback - create empty array or handle error
    console.error("Unexpected data format:", data);
    rows = [];
  }

  console.log("Processed rows:", rows);

  const term = filterTerm.trim().toLowerCase();
  const filtered = term
    ? rows.filter((r) => r.username.toLowerCase().includes(term))
    : rows;

  // sort
  const dirFactor = sortState.dir === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    const k = sortState.key;

    // Handle different sort keys
    if (k === "updatedAt") {
      // If you don't have updatedAt in your data, you might want to remove or handle this
      const av = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const bv = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return (av - bv) * dirFactor;
    }

    if (k === "rank") {
      // computed after sorting by catches; keep stable
      return 0;
    }

    if (k === "username") {
      return a.username.localeCompare(b.username) * dirFactor;
    }

    // For numeric fields like "catches"
    const av = a[k] ?? 0;
    const bv = b[k] ?? 0;

    if (av === bv) {
      // Secondary sort by username
      return a.username.localeCompare(b.username) * dirFactor;
    }

    return (av - bv) * dirFactor;
  });

  // assign rank by catches
  const byScore = [...filtered].sort((a, b) => {
    if (a.catches !== b.catches) return b.catches - a.catches;
    return a.username.localeCompare(b.username);
  });
  const rankMap = new Map(byScore.map((r, i) => [r.uid, i + 1]));
  filtered.forEach((r) => (r.rank = rankMap.get(r.uid)));

  return filtered;
}

async function render() {
  const rows = await computeRows(searchEl.value);
  bodyEl.innerHTML = "";

  if (rows.length === 0) {
    emptyEl.hidden = false;
  } else {
    emptyEl.hidden = true;
    for (const r of rows) {
      var tr;
      var tdRank;
      var tdUser;
      var tdC;

      if (
        localStorage.getItem("lfq.user") != null &&
        (localStorage.getItem("lfq.user").uid = r.uid)
      ) {
        console.log("Current user same!!!");
        tr = document.createElement("tr");

        tdRank = document.createElement("td");
        tdRank.className = "rank";
        tdRank.classList.add("user_self");
        tdRank.textContent = r.rank ?? "—";

        tdUser = document.createElement("strong");
        tdUser.classList.add("user_self");
        tdUser.textContent = r.username;

        tdC = document.createElement("td");
        tdC.classList.add("user_self");
        tdC.textContent = r.catches ?? 0;
      } else {
        tr = document.createElement("tr");

        tdRank = document.createElement("td");
        tdRank.className = "rank";
        tdRank.textContent = r.rank ?? "—";

        tdUser = document.createElement("strong");
        tdUser.textContent = r.username;

        tdC = document.createElement("td");
        tdC.textContent = r.catches ?? 0;
      }

      tr.append(tdRank, tdUser, tdC);
      bodyEl.appendChild(tr);
    }
  }

  lastSyncEl.textContent = `Last sync: ${new Date().toLocaleTimeString()}`;
  // update header active state
  sortableHeaders.forEach((th) => {
    th.classList.remove("active", "asc", "desc");
    if (th.dataset.key === sortState.key) {
      th.classList.add("active", sortState.dir);
    }
  });
}

// -------- events & live updates --------
// sort handlers
sortableHeaders.forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.key;
    if (sortState.key === key) {
      sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
    } else {
      sortState.key = key;
      sortState.dir = key === "updatedAt" ? "desc" : "desc";
    }
    render();
  });
});

// search
searchEl.addEventListener("input", () => render());

// refresh button
document.getElementById("refreshBtn").addEventListener("click", render);

// seed demo data (now loads from JSON instead)
document.getElementById("seedBtn").addEventListener("click", () => {
  // Use the data from the JSON file if available
  const jsonData = window.leaderboardData || {};
  setScores(jsonData);
  render();
});

// allow other tabs/pages to update in real time
window.addEventListener("storage", (e) => {
  if (e.key === STORAGE_KEY) render();
});
window.addEventListener("lfq:scores-updated", render);

// periodic auto-refresh (in case something external updates storage)
setInterval(render, 5000);

// reset demo (reuse your footer button)
document.getElementById("resetDemo").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  render();
});

// initial render
render();
