from flask import Flask, request, jsonify, render_template
import os
import csv
import base64
import re
from datetime import datetime, timezone
from PIL import Image
import numpy as np
from tensorflow.keras.models import load_model
import cv2
from tensorflow.keras.preprocessing import image
from ultralytics import YOLO
import matplotlib.pyplot as plt

from sqlalchemy import create_engine, text, select, insert, update, MetaData, Table, exists
from sqlalchemy.orm import sessionmaker

app = Flask(__name__)

# Allow running without DB for local/dev
DISABLE_DB = os.getenv("DISABLE_DB", "0") == "1"

DATABASE_URL = "postgresql://neondb_owner:npg_IynsOvqCp54B@ep-solitary-waterfall-aeaz3n0s-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
engine = None
SessionLocal = None
metadata = MetaData()

accounts = None
maps = None

if not DISABLE_DB:
    try:
        engine = create_engine(DATABASE_URL, echo=True)
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        accounts = Table("user", metadata, autoload_with=engine)
        maps = Table("maps", metadata, autoload_with=engine)
    except Exception as e:
        print(f"[WARN] DB init failed: {e}. Falling back to DISABLE_DB mode.")
        DISABLE_DB = True

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/info")
def info():
    return render_template("info.html")

@app.route("/leaderboard")
def leaderboard():
    return render_template("leaderboard.html")

@app.route("/learn")
def learn():
    return render_template("learn.html")

@app.route("/map")
def map():
    return render_template("map.html")

@app.route("/report")
def report():
    return render_template("report.html")

@app.route("/profile")
def profile():
    return render_template("profile.html")

@app.route("/achievements")
def achievements():
    return render_template("achievements.html")

@app.route("/send", methods=["POST"])
def receive_data():
    data = request.get_json()
    account_json = data.get("account_json")  # variable sent from JS
    print(f"Received from JS: {account_json}")

    insert_stmt = insert(accounts).values(
        google_name=account_json.get("name"),
        google_email=account_json.get("email"),
        google_uid=account_json.get("id"),
    )

    with engine.begin() as conn:
        conn.execute(insert_stmt)
        print(f"Created new user with email: {account_json.get('email')}")

    # Return something back to JS
    return jsonify({
        "status": "success",
        "py_variable": f"Hello {account_json.get('name')}, your email is {account_json.get('email')}"
    })


@app.route("/leaderboard-data", methods=["POST"])
def give_leaderboard_data():
    data = request.get_json()
    account_json = data.get("account_json")  # variable sent from JS
    print(f"Received from JS: {account_json}")

    leaderboardData = []

    if not DISABLE_DB and accounts is not None and engine is not None:
        query = select(accounts)
        with engine.begin() as conn:
            conn.execute(query)
            for row in conn.execute(query):
                leaderboardData.append({
                    "username": row.google_name,
                    "catches": row.count,
                    "uid": row.google_uid,
                })
    else:
        print("[INFO] DB disabled; returning empty leaderboard")

    # Return something back to JS
    return jsonify(leaderboardData)


@app.route("/locations", methods=["POST"])
def give_locations():
    data = request.get_json()
    location_json = data.get("location_json")  # variable sent from JS
    print(f"Received from JS: {location_json}")

    mapsData = []

    if not DISABLE_DB and maps is not None and engine is not None:
        query = select(maps)
        with engine.begin() as conn:
            conn.execute(query)
            for row in conn.execute(query):
                mapsData.append({
                    "name": row.name,
                    "longitude": row.longitude,
                    "latitude": row.latitude,
                    "image_bytes": row.image_bytes,
                    "date": row.date,
                })
    else:
        print("[INFO] DB disabled; returning CSV-only data (client will load CSV)")

    # Return something back to JS
    return jsonify(mapsData)

@app.route("/submit_report", methods=["POST"])
def submit_report():
    try:
        data = request.get_json(force=True)
        name = (data.get("name") or "").strip() or "Anonymous"
        email = (data.get("email") or "").strip()
        lat = float(data.get("latitude"))
        lon = float(data.get("longitude"))
        image = data.get("image") or ""
        raw_ts = (data.get("timestamp") or "").strip()
        uid = data.get("uid")

        def parse_iso(ts: str) -> str:
            if not ts:
                return ""
            try:
                s = ts.strip()
                # Accept trailing Z by converting to +00:00
                if s.endswith("Z"):
                    s2 = s[:-1] + "+00:00"
                else:
                    s2 = s
                dt = datetime.fromisoformat(s2)
                if not dt.tzinfo:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc).isoformat()
            except Exception:
                return ""

        # Start with client timestamp (may be empty)
        client_date_iso = parse_iso(raw_ts)
        date_iso = client_date_iso

        # If image is a data URL, persist it to static/uploads and store the file path instead
        if image.startswith("data:image"):
            m = re.match(r"^data:image\/(png|jpeg|jpg);base64,(.+)$", image)
            img_bytes = None
            if m:
                ext = "jpg" if m.group(1) in ("jpeg","jpg") else "png"
                b64 = m.group(2)
                try:
                    img_bytes = base64.b64decode(b64)
                    uploads_dir = os.path.join(app.root_path, "static", "uploads")
                    os.makedirs(uploads_dir, exist_ok=True)
                    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S%f")
                except Exception:
                    # fallback: keep original string if something goes wrong
                    pass

        insert_stmt = insert(maps).values(
            name = name,
            longitude = lon,
            latitude = lat,
            image_bytes = img_bytes,
            date = raw_ts,
            uid = uid,
        )
        update_stmt = update(accounts).where(accounts.c.google_uid == uid).values(count=accounts.c.count + 1)

        with engine.begin() as conn:
            conn.execute(insert_stmt)
            conn.execute(update_stmt)
            print(f"Inserted row {index} with name: {name}")

        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400
    
model1 = YOLO("yolov5s.pt")   
def crop_objects(image_path, conf_thresh=0.5):
    """
    Returns cropped objects as a list of NumPy arrays (in memory)
    """
    img = cv2.imread(image_path)
    results = model1(image_path)[0]  # get predictions

    cropped_images = []
    for i, box in enumerate(results.boxes.xyxy):
        conf = results.boxes.conf[i].item()
        if conf < conf_thresh:
            continue  # skip low-confidence boxes
        x1, y1, x2, y2 = map(int, box)
        crop = img[y1:y2, x1:x2]
        cropped_images.append(crop)  # keep in memory

    return cropped_images
# Load your trained model once at startup
model = load_model("my_model.h5")

@app.route("/predict", methods=["POST"])
def predict():
    # Ensure a file was uploaded
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400
    file = request.files["file"]
    crops = crop_objects("file", conf_thresh=0.25)
    if(len(crops)==0):
        predicted_class=1
    else:
        resized = cv2.resize(crops[0], (224, 224))
        img_array = np.expand_dims(resized / 255.0, axis=0)  # normalize & add batch dim
        # Make prediction
        pred = model.predict(img_array)
        predicted_class = np.argmax(pred, axis=1)[0]
        confidence = pred[0][predicted_class]
        if(predicted_class==0 and confidence<0.9):
            predicted_class=1
    return jsonify({ "class": predicted_class, "confidence": confidence})
if __name__ == "__main__":
    app.run(debug=True)

def handler(event, context):
    return app(request.environ, lambda status, headers: (status, headers))