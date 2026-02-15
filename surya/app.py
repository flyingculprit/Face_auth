from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import face_recognition
import numpy as np
import base64
import cv2
from pymongo import MongoClient

app = Flask(__name__)
app.secret_key = "salt"

# ---------------- MongoDB Setup ----------------
MONGO_URI = "mongodb+srv://commander:pass.bbqab.mongodb.net/facedb"
client = MongoClient(MONGO_URI)
db = client["facedb"]
users_col = db["user"]

# stricter threshold
THRESHOLD = 0.38
REQUIRED_SAMPLES = 5

# ---------------- Helpers ----------------
def image_from_base64(data_url):
    encoded = data_url.split(",")[1]
    img_bytes = base64.b64decode(encoded)
    nparr = np.frombuffer(img_bytes, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

def detect_landmarks_only(image):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    locs = face_recognition.face_locations(rgb)
    if len(locs) == 0:
        return None
    landmarks = face_recognition.face_landmarks(rgb, locs)[0]
    return landmarks

def get_embedding(image):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    locs = face_recognition.face_locations(rgb)
    if len(locs) == 0:
        return None
    enc = face_recognition.face_encodings(rgb, locs)[0]
    return enc

# ---------------- Pages ----------------
@app.route("/")
def index():
    return render_template("index.html")

@app.route("/register")
def register_page():
    return render_template("register.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/dashboard")
def dashboard():
    if "username" not in session:
        return redirect(url_for("login_page"))
    return render_template("dashboard.html", username=session["username"])

@app.route("/logout")
def logout():
    session.pop("username", None)
    return redirect(url_for("index"))

# ---------------- Register with 5 images ----------------
@app.route("/api/register", methods=["POST"])
def register():
    data = request.json
    username = data.get("username")
    images = data.get("images")  # list of base64 images

    if not username or username.strip() == "":
        return jsonify({"status": "error", "message": "Username is required"})

    if users_col.find_one({"username": username}):
        return jsonify({"status": "error", "message": "Username already exists"})

    if not images or len(images) < REQUIRED_SAMPLES:
        return jsonify({"status": "error", "message": f"Provide {REQUIRED_SAMPLES} face samples"})

    embeddings = []

    for img_data in images:
        img = image_from_base64(img_data)
        emb = get_embedding(img)
        if emb is None:
            return jsonify({"status": "error", "message": "Face not detected in one of the samples"})
        embeddings.append(emb.tolist())

    users_col.insert_one({
        "username": username,
        "embeddings": embeddings
    })

    return jsonify({"status": "ok", "message": "Registered successfully with 5 samples"})

# ---------------- Login ----------------
@app.route("/api/login", methods=["POST"])
def login():
    data = request.json
    username = data.get("username")
    image_data = data.get("image")

    if not username or username.strip() == "":
        return jsonify({"status": "error", "message": "Username is required"})

    user = users_col.find_one({"username": username})
    if not user:
        return jsonify({"status": "error", "message": "User not found"})

    img = image_from_base64(image_data)
    new_emb = get_embedding(img)
    if new_emb is None:
        return jsonify({"status": "error", "message": "No face detected"})

    stored_embeddings = [np.array(e) for e in user["embeddings"]]

    # compute distance to all stored samples
    dists = [np.linalg.norm(new_emb - e) for e in stored_embeddings]
    best_dist = min(dists)

    if best_dist < THRESHOLD:
        session["username"] = username
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "fail", "message": "Face does not match"})

# ---------------- Landmarks API (live mesh) ----------------
@app.route("/api/landmarks", methods=["POST"])
def landmarks_api():
    data = request.json
    image_data = data.get("image")
    img = image_from_base64(image_data)

    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    locs = face_recognition.face_locations(rgb)
    if len(locs) == 0:
        return jsonify({})

    landmarks = face_recognition.face_landmarks(rgb, locs)[0]
    return jsonify({"landmarks": landmarks})

# ---------------- Run ----------------
if __name__ == "__main__":
    app.run(debug=True)
