// Initialize map if the page has one
try {
  initMapIfPresent();
} catch (e) {
  console.error(e);
}

let imgDataUrl = null,
  stream = null;
const nameInput = document.getElementById("nameInput");
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");
const openBtn = document.getElementById("openCam");
const snapBtn = document.getElementById("snap");
const closeBtn = document.getElementById("closeCam");
const confirmBtn = document.getElementById("confirm");
const video = document.getElementById("video");
const preview = document.getElementById("preview");
const canvas = document.getElementById("canvas");
const statusEl = document.getElementById("status");
const verifyMsg = document.getElementById("verifyMsg");

function getSavedUser() {
  try {
    return JSON.parse(localStorage.getItem("lfq.user") || "null");
  } catch {
    return null;
  }
}

function setStatus(m) {
  statusEl.textContent = m;
}
function enableConfirm() {
  confirmBtn.disabled = !imgDataUrl;
}
function analyzeImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = 256,
        h = 256;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0, w, h);
      const d = g.getImageData(0, 0, w, h).data;
      let reds = 0,
        dark = 0,
        varc = 0,
        n = w * h;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i],
          g1 = d[i + 1],
          b = d[i + 2];
        const mx = Math.max(r, g1, b),
          mn = Math.min(r, g1, b);
        const s = mx ? (mx - mn) / mx : 0;
        if (mx > 60 && s > 0.35 && r > g1 && r > b) reds++;
        if (mx < 40) dark++;
        if (mx - mn > 50) varc++;
      }
      const ok =
        (reds / n > 0.01 && varc / n > 0.08) ||
        (dark / n > 0.15 && varc / n > 0.1);
      resolve({ ok });
    };
    img.onerror = () => resolve({ ok: false });
    img.src = url;
  });
}

uploadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    imgDataUrl = r.result;
    preview.src = imgDataUrl;
    preview.style.display = "block";
    setStatus("Photo selected.");
    verifyMsg.textContent = "";
    enableConfirm();
  };
  r.readAsDataURL(file);
});

openBtn.addEventListener("click", async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    video.srcObject = stream;
    video.style.display = "block";
    snapBtn.disabled = false;
    closeBtn.disabled = false;
    setStatus("Camera open.");
  } catch (err) {
    alert("Could not open camera: " + err.message);
  }
});
snapBtn.addEventListener("click", () => {
  if (!stream) return;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
  imgDataUrl = canvas.toDataURL("image/jpeg", 0.9);
  preview.src = imgDataUrl;
  preview.style.display = "block";
  setStatus("Snapshot captured.");
  verifyMsg.textContent = "";
  enableConfirm();
  stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  video.style.display = "none";
  snapBtn.disabled = true;
  closeBtn.disabled = true;
});
closeBtn.addEventListener("click", () => {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  video.srcObject = null;
  video.style.display = "none";
  snapBtn.disabled = true;
  closeBtn.disabled = true;
  setStatus("Camera closed.");
});

confirmBtn.addEventListener("click", async () => {
  if (!imgDataUrl) {
    alert("Please select/take a photo first.");
    return;
  }
  // Test mode: verification
  const formData = new FormData();
  formData.append("file", imgDataUrl);

  fetch("/predict", {
    method: "POST",
    body: formData
  })
  .then(res => res.json())
  .then(data => {
    alert(`Prediction: Class ${data.class}, Confidence: ${(data.confidence * 100).toFixed(2)}%`);
  })
  .catch(err => console.error(err));


  // Test mode: skip verification, always submit
  const u = getSavedUser();
  if (!u) {
    setStatus("Please log in before submitting!");
    return;
  }
  verifyMsg.textContent = "Verification skipped (test). Submitting…";
  const name =
    nameInput.value.trim() || (u && (u.name || u.email)) || "Anonymous";
  const email = u && u.email ? u.email : "";
  const uid = u.uid;

  let lat = 0,
    lon = 0; // default fallback
  setStatus("Getting location…");
  try {
    const pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, {
        enableHighAccuracy: true,
        timeout: 12000,
      })
    );
    lat = pos.coords.latitude;
    lon = pos.coords.longitude;
  } catch (err) {
    setStatus("Location unavailable — submitting without precise location.");
  }

  try {
    const payload = {
      name,
      email,
      latitude: lat,
      longitude: lon,
      timestamp: new Date().toISOString(),
      image: imgDataUrl,
      uid: uid,
    };
    const resp = await fetch("/submit_report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await resp.json();
    if (resp.ok && json.status === "ok") {
      setStatus("Report submitted. Thank you!");
      verifyMsg.textContent = "";
      try {
        localStorage.setItem(
          "lfq.lastReport",
          JSON.stringify({
            latitude: lat,
            longitude: lon,
            timestamp: new Date().toISOString(),
            tries: 0,
          })
        );
      } catch {}
      // Update local leaderboard stats (catches + streak)
      try {
        const u = getSavedUser();
        const uid = u && u.uid ? u.uid : email || name || "guest";
        const username = name || (u && (u.name || u.email)) || "Anonymous";
        const today = new Date();
        const dayKey = today.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
        const key = "lfq:scores";
        const raw = localStorage.getItem(key);
        const arr = raw ? JSON.parse(raw) : [];
        const idx = Array.isArray(arr)
          ? arr.findIndex((r) => r && r.uid === uid)
          : -1;
        let entry =
          idx >= 0
            ? arr[idx]
            : { uid, username, catches: 0, streak: 0, lastDay: null };
        // streak logic
        const last = entry.lastDay;
        if (last === dayKey) {
          // same day: increment catches, keep streak
          entry.catches = (entry.catches || 0) + 1;
        } else {
          // new day
          // if yesterday, continue streak; else reset to 1
          const y = new Date(
            Date.UTC(
              today.getUTCFullYear(),
              today.getUTCMonth(),
              today.getUTCDate() - 1
            )
          );
          const yKey = y.toISOString().slice(0, 10);
          entry.streak = last === yKey ? (entry.streak || 0) + 1 : 1;
          entry.catches = (entry.catches || 0) + 1;
          entry.lastDay = dayKey;
        }
        // ensure lastDay set at least once
        if (!entry.lastDay) entry.lastDay = dayKey;
        if (idx >= 0) arr[idx] = entry;
        else arr.push(entry);
        localStorage.setItem(key, JSON.stringify(arr));
      } catch {}
      // Navigate to Home; indexing script will retry loading until the new row appears
      setTimeout(() => {
        window.location.href = "/?justReported=1";
      }, 900);
    } else {
      setStatus("Submission failed.");
      verifyMsg.textContent = json.message || "Please try again later.";
    }
  } catch (err) {
    setStatus("Submission error.");
  }
});

// Prefill name from Google user if available
(function () {
  const u = getSavedUser();
  if (u && (u.name || u.email) && !nameInput.value)
    nameInput.value = u.name || u.email;
})();
