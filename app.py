from flask import Flask, request, jsonify, render_template
import os

from sqlalchemy import create_engine, text, select, insert, update, MetaData, Table, exists
from sqlalchemy.orm import sessionmaker

app = Flask(__name__)

DATABASE_URL = "postgresql://neondb_owner:npg_IynsOvqCp54B@ep-solitary-waterfall-aeaz3n0s-pooler.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
engine = create_engine(DATABASE_URL, echo=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
metadata = MetaData()

accounts = Table("user", metadata, autoload_with=engine)
maps = Table("maps", metadata, autoload_with=engine)

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
        print(f"Created new user with email: {account_json.get("email")}")

    # Return something back to JS
    return jsonify({
        "status": "success",
        "py_variable": f"Hello {account_json.get("name")}, your email is {account_json.get("email")}"
    })


@app.route("/leaderboard-data", methods=["POST"])
def give_leaderboard_data():
    data = request.get_json()
    account_json = data.get("account_json")  # variable sent from JS
    print(f"Received from JS: {account_json}")

    leaderboardData = []

    query = select(accounts)

    with engine.begin() as conn:
        conn.execute(query)
        for row in conn.execute(query)  :
            leaderboardData.append({
                "username": row.google_name,
                "catches": row.count,
                "uid": row.google_uid,
            })

    # Return something back to JS
    return jsonify(leaderboardData)


@app.route("/locations", methods=["POST"])
def give_locations():
    data = request.get_json()
    location_json = data.get("location_json")  # variable sent from JS
    print(f"Received from JS: {location_json}")

    mapsData = []

    query = select(maps)

    with engine.begin() as conn:
        conn.execute(query)
        for row in conn.execute(query)  :
            mapsData.append({
                "name": row.name,
                "longitude": row.longitude,
                "latitude": row.latitude,
                "image_link": row.image_link,
                "date": row.date,
            })

    # Return something back to JS
    return jsonify(mapsData)

if __name__ == "__main__":
    app.run(debug=True)
