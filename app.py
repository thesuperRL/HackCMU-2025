from flask import Flask, request, jsonify, render_template
import os
import csv
import base64
import re
from datetime import datetime, timezone

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
                    "image_link": row.image_link,
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
            if m:
                ext = "jpg" if m.group(1) in ("jpeg","jpg") else "png"
                b64 = m.group(2)
                try:
                    img_bytes = base64.b64decode(b64)
                    uploads_dir = os.path.join(app.root_path, "static", "uploads")
                    os.makedirs(uploads_dir, exist_ok=True)
                    ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S%f")
                    fname = f"lf_{ts}.{ext}"
                    fpath = os.path.join(uploads_dir, fname)
                    with open(fpath, "wb") as out:
                        out.write(img_bytes)
                    # store web path
                    image = f"/static/uploads/{fname}"

                    # Prefer image-derived date over client-provided timestamp
                    image_date_iso = ""
                    try:
                        from PIL import Image, ExifTags  # type: ignore
                        exif_dt = ""
                        with Image.open(fpath) as im:
                            exif = im.getexif() or {}
                            if exif:
                                label_map = {ExifTags.TAGS.get(k, str(k)): v for k, v in exif.items()}
                                # Prefer DateTimeOriginal, then DateTime
                                exif_dt = label_map.get("DateTimeOriginal") or label_map.get("DateTime") or ""
                        if exif_dt:
                            # EXIF format: YYYY:MM:DD HH:MM:SS
                            try:
                                dt = datetime.strptime(exif_dt, "%Y:%m:%d %H:%M:%S").replace(tzinfo=None)
                                image_date_iso = dt.strftime("%Y-%m-%dT%H:%M:%S")
                            except Exception:
                                image_date_iso = ""
                    except Exception:
                        image_date_iso = ""

                    if not image_date_iso:
                        try:
                            mtime = os.path.getmtime(fpath)
                            image_date_iso = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
                        except Exception:
                            image_date_iso = ""

                    # Override with image-derived date if available; else keep client or fallback later
                    if image_date_iso:
                        date_iso = image_date_iso
                except Exception:
                    # fallback: keep original string if something goes wrong
                    pass

        insert_stmt = insert(maps).values(
            name = name,
            longitude = lon,
            latitude = lat,
            image_link = image,
            date = raw_ts,
            uid = uid,
        )

        with engine.begin() as conn:
            conn.execute(insert_stmt)
            print(f"Inserted row {index} with name: {name}")

        return jsonify({"status": "ok"})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400


@app.route("/admin/migrate_csv", methods=["POST", "GET"])
def migrate_csv_add_email():
    """Add Email column to CSV and populate with fake emails for rows missing it.
    Safe to run multiple times; preserves existing values.
    """
    try:
        csv_path = os.path.join(app.root_path, "static", "data", "lanternflydata.csv")
        if not os.path.exists(csv_path):
            return jsonify({"status": "error", "message": "CSV not found"}), 404

        # Load rows
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            fields = reader.fieldnames or []

        desired = ["Name", "Email", "Longitude", "Latitude", "Image", "Date"]

        # Build fake emails
        used = set()
        def mk_email(name, idx):
            base = re.sub(r"[^a-z0-9]+", "", (name or "").lower()) or f"user{idx}"
            email = f"{base}@example.com"
            i = 1
            while email in used:
                email = f"{base}{i}@example.com"
                i += 1
            used.add(email)
            return email

        out_rows = []
        updated = 0
        for idx, r in enumerate(rows, 1):
            name = r.get("Name") or r.get("name") or ""
            email = r.get("Email") or r.get("email") or ""
            lon = r.get("Longitude") or r.get("longitude") or ""
            lat = r.get("Latitude") or r.get("latitude") or ""
            img = r.get("Image") or r.get("image") or r.get("image_link") or ""
            date = r.get("Date") or r.get("date") or r.get("TimestampISO") or r.get("timestamp") or ""
            if not email:
                email = mk_email(name, idx)
                updated += 1
            out_rows.append({"Name": name, "Email": email, "Longitude": lon, "Latitude": lat, "Image": img, "Date": date})

        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=desired)
            w.writeheader()
            for r in out_rows:
                w.writerow(r)

        return jsonify({"status": "ok", "updated": updated, "total": len(out_rows)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)

def handler(event, context):
    return app(request.environ, lambda status, headers: (status, headers))