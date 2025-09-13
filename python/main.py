from flask import Flask, request, jsonify, render_template

app = Flask(__name__)

@app.route("/")
def index():
    return render_template("index.html")

# Endpoint to receive data from JavaScript
@app.route("/send", methods=["POST"])
def receive_data():
    data = request.get_json()
    account_json = data.get("account_json")  # variable sent from JS
    print(f"Received from JS: {account_json}")

    #TODO: do stuff with account_json

    # Send back a confirmation as response
    return jsonify({"status": "success"})

if __name__ == "__main__":
    app.run(debug=True)
