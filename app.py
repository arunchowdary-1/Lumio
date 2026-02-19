from flask import Flask, render_template, request, jsonify, redirect, url_for, session, flash
import sqlite3
import json
from datetime import datetime, date, timedelta
import math
import os
import hashlib
import secrets
from functools import wraps

app = Flask(__name__)
app.secret_key = secrets.token_hex(32)
DB = "study_planner.db"

# ─────────────────────────────────────────────
#  DATABASE SETUP
# ─────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    c.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT    NOT NULL,
            total_hours REAL    NOT NULL,
            priority    INTEGER NOT NULL DEFAULT 2,
            deadline    TEXT    NOT NULL,
            color       TEXT    NOT NULL DEFAULT '#4ECDC4',
            created_at  TEXT    DEFAULT (datetime('now'))
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_id  INTEGER NOT NULL,
            day_name    TEXT    NOT NULL,
            hours       REAL    NOT NULL,
            week_start  TEXT    NOT NULL,
            status      TEXT    DEFAULT 'pending',
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key     TEXT    NOT NULL,
            value   TEXT,
            user_id INTEGER NOT NULL DEFAULT 1,
            PRIMARY KEY (key, user_id)
        )
    """)

    c.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            username   TEXT    NOT NULL UNIQUE,
            email      TEXT    NOT NULL UNIQUE,
            password   TEXT    NOT NULL,
            created_at TEXT    DEFAULT (datetime('now'))
        )
    """)

    # Add user_id column to subjects if missing (for multi-user support)
    try:
        c.execute("ALTER TABLE subjects ADD COLUMN user_id INTEGER DEFAULT 1")
    except:
        pass

    # Add user_id column to settings if missing
    try:
        c.execute("ALTER TABLE settings ADD COLUMN user_id INTEGER DEFAULT 1")
    except:
        pass

    c.execute("INSERT OR IGNORE INTO settings VALUES ('hours_per_day', '5', 1)")

    conn.commit()
    conn.close()

# ─────────────────────────────────────────────
#  AUTH HELPERS
# ─────────────────────────────────────────────

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def current_user_id():
    return session.get('user_id', 1)

# ─────────────────────────────────────────────
#  AI PLANNER ENGINE
# ─────────────────────────────────────────────

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

def days_until(deadline_str):
    try:
        dl = datetime.strptime(deadline_str, "%Y-%m-%d").date()
        return max(1, (dl - date.today()).days)
    except:
        return 30

def ai_generate_plan(subjects, hours_per_day):
    """
    AI Planning Logic:
    1. Sort subjects by priority desc, then deadline asc (urgency)
    2. Assign sessions in blocks, capped by cognitive load per day
    3. High-priority subjects get morning-first slots
    4. Max 3h per subject per day to prevent burnout
    5. Return dict: {day: [(subject_id, hours), ...]}
    """
    plan = {d: [] for d in DAYS}
    if not subjects:
        return plan

    # Score = priority * 10 + (1/days_left)*100  → higher = more urgent
    def urgency(s):
        d = days_until(s["deadline"])
        return (s["priority"] * 10) + min(50, 100 / d)

    sorted_subs = sorted(subjects, key=urgency, reverse=True)

    day_idx = 0
    day_hours = 0.0

    for sub in sorted_subs:
        remaining = float(sub["total_hours"])
        while remaining > 0 and day_idx < 7:
            available = hours_per_day - day_hours
            if available <= 0:
                day_idx += 1
                day_hours = 0.0
                continue
            # Cap block size: high priority → 3h, medium → 2h, low → 1.5h
            max_block = 3 if sub["priority"] == 3 else (2 if sub["priority"] == 2 else 1.5)
            block = round(min(remaining, available, max_block), 1)
            plan[DAYS[day_idx]].append({"subject_id": sub["id"], "hours": block})
            remaining = round(remaining - block, 1)
            day_hours = round(day_hours + block, 1)
            if day_hours >= hours_per_day:
                day_idx += 1
                day_hours = 0.0

    return plan

def get_priority_order(subjects):
    """Return subjects sorted by AI urgency score."""
    def urgency(s):
        d = days_until(s["deadline"])
        return (s["priority"] * 10) + min(50, 100 / d)
    return sorted(subjects, key=urgency, reverse=True)

def calc_productivity_score(subjects, sessions):
    total_h = sum(s["total_hours"] for s in subjects)
    done_h  = sum(s["completed_hours"] for s in subjects)
    missed  = sum(1 for s in sessions if s["status"] == "missed")
    if total_h == 0:
        return 0
    base    = (done_h / total_h) * 100
    penalty = min(missed * 3, 25)
    return max(0, round(base - penalty))

def get_completed_hours(subject_id):
    conn = get_db()
    row = conn.execute(
        "SELECT COALESCE(SUM(hours),0) as h FROM sessions WHERE subject_id=? AND status='done'",
        (subject_id,)
    ).fetchone()
    conn.close()
    return round(row["h"], 1)

def get_week_start():
    today = date.today()
    return (today - timedelta(days=today.weekday())).isoformat()

# ─────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────

# ─────────────────────────────────────────────
#  AUTH ROUTES
# ─────────────────────────────────────────────

@app.route("/login", methods=["GET", "POST"])
def login():
    if 'user_id' in session:
        return redirect(url_for('index'))
    error = None
    if request.method == "POST":
        identifier = request.form.get("identifier", "").strip()
        password   = request.form.get("password", "")
        if not identifier or not password:
            error = "Please fill in all fields."
        else:
            conn = get_db()
            user = conn.execute(
                "SELECT * FROM users WHERE username=? OR email=?",
                (identifier, identifier)
            ).fetchone()
            conn.close()
            if not user:
                error = "No account found with that username or email."
            elif user["password"] != hash_password(password):
                error = "Incorrect password. Please try again."
            else:
                session['user_id']  = user['id']
                session['username'] = user['username']
                return redirect(url_for('index'))
    return render_template("login.html", error=error)

@app.route("/register", methods=["GET", "POST"])
def register():
    if 'user_id' in session:
        return redirect(url_for('index'))
    error = None
    success = None
    if request.method == "POST":
        username  = request.form.get("username", "").strip()
        email     = request.form.get("email", "").strip()
        password  = request.form.get("password", "")
        password2 = request.form.get("password2", "")
        if not username or not email or not password or not password2:
            error = "Please fill in all fields."
        elif len(username) < 3:
            error = "Username must be at least 3 characters."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."
        elif password != password2:
            error = "Passwords do not match."
        elif "@" not in email:
            error = "Please enter a valid email address."
        else:
            conn = get_db()
            existing = conn.execute(
                "SELECT id FROM users WHERE username=? OR email=?", (username, email)
            ).fetchone()
            if existing:
                error = "Username or email already registered."
                conn.close()
            else:
                conn.execute(
                    "INSERT INTO users (username, email, password) VALUES (?,?,?)",
                    (username, email, hash_password(password))
                )
                conn.commit()
                # Auto-add default settings for new user
                uid = conn.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()["id"]
                conn.execute("INSERT OR IGNORE INTO settings (key,value,user_id) VALUES ('hours_per_day','5',?)", (uid,))
                conn.commit()
                conn.close()
                success = "Account created! You can now log in."
    return render_template("register.html", error=error, success=success)

@app.route("/logout")
def logout():
    session.clear()
    return redirect(url_for('login'))

# ─────────────────────────────────────────────
#  MAIN APP ROUTE
# ─────────────────────────────────────────────

@app.route("/")
@login_required
def index():
    return render_template("index.html", username=session.get('username','Student'))

# ── Subjects ──────────────────────────────────

@app.route("/api/subjects", methods=["GET"])
@login_required
def get_subjects():
    uid  = current_user_id()
    conn = get_db()
    rows = conn.execute("SELECT * FROM subjects WHERE user_id=? ORDER BY priority DESC, deadline ASC", (uid,)).fetchall()
    conn.close()
    subjects = []
    for r in rows:
        s = dict(r)
        s["completed_hours"] = get_completed_hours(s["id"])
        s["days_left"]       = days_until(s["deadline"])
        s["pct"]             = round((s["completed_hours"] / s["total_hours"]) * 100) if s["total_hours"] else 0
        subjects.append(s)
    return jsonify(subjects)

@app.route("/api/subjects", methods=["POST"])
@login_required
def add_subject():
    data   = request.json
    uid    = current_user_id()
    colors = ["#FF6B6B","#4ECDC4","#FFE66D","#A78BFA","#F97316","#34D399","#60A5FA","#F472B6"]
    conn   = get_db()
    count  = conn.execute("SELECT COUNT(*) as c FROM subjects WHERE user_id=?", (uid,)).fetchone()["c"]
    color  = colors[count % len(colors)]
    conn.execute(
        "INSERT INTO subjects (name, total_hours, priority, deadline, color, user_id) VALUES (?,?,?,?,?,?)",
        (data["name"], float(data["total_hours"]), int(data["priority"]), data["deadline"], color, uid)
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/subjects/<int:sid>", methods=["DELETE"])
@login_required
def delete_subject(sid):
    conn = get_db()
    conn.execute("DELETE FROM subjects WHERE id=? AND user_id=?", (sid, current_user_id()))
    conn.execute("DELETE FROM sessions WHERE subject_id=?", (sid,))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/subjects/<int:sid>", methods=["PUT"])
@login_required
def update_subject(sid):
    data = request.json
    conn = get_db()
    conn.execute(
        "UPDATE subjects SET name=?, total_hours=?, priority=?, deadline=? WHERE id=? AND user_id=?",
        (data["name"], float(data["total_hours"]), int(data["priority"]), data["deadline"], sid, current_user_id())
    )
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

# ── Settings ──────────────────────────────────

@app.route("/api/settings", methods=["GET"])
@login_required
def get_settings():
    uid  = current_user_id()
    conn = get_db()
    rows = conn.execute("SELECT * FROM settings WHERE user_id=?", (uid,)).fetchall()
    conn.close()
    return jsonify({r["key"]: r["value"] for r in rows})

@app.route("/api/settings", methods=["POST"])
@login_required
def save_settings():
    uid  = current_user_id()
    data = request.json
    conn = get_db()
    for k, v in data.items():
        conn.execute("INSERT OR REPLACE INTO settings (key,value,user_id) VALUES (?,?,?)", (k, str(v), uid))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

# ── Plan Generation ───────────────────────────

@app.route("/api/generate_plan", methods=["POST"])
@login_required
def generate_plan():
    uid  = current_user_id()
    conn = get_db()

    rows     = conn.execute("SELECT * FROM subjects WHERE user_id=?", (uid,)).fetchall()
    subjects = [dict(r) for r in rows]

    hpd_row       = conn.execute("SELECT value FROM settings WHERE key='hours_per_day' AND user_id=?", (uid,)).fetchone()
    hours_per_day = float(hpd_row["value"]) if hpd_row else 5.0

    if not subjects:
        conn.close()
        return jsonify({"error": "No subjects added yet"}), 400

    plan       = ai_generate_plan(subjects, hours_per_day)
    week_start = get_week_start()

    conn.execute(
        "DELETE FROM sessions WHERE week_start=? AND subject_id IN (SELECT id FROM subjects WHERE user_id=?)",
        (week_start, uid)
    )

    for day, blocks in plan.items():
        for block in blocks:
            conn.execute(
                "INSERT INTO sessions (subject_id, day_name, hours, week_start, status) VALUES (?,?,?,?,?)",
                (block["subject_id"], day, block["hours"], week_start, "pending")
            )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "week_start": week_start})

# ── Sessions / Timetable ─────────────────────

@app.route("/api/timetable", methods=["GET"])
@login_required
def get_timetable():
    uid        = current_user_id()
    week_start = get_week_start()
    conn       = get_db()

    sessions = conn.execute("""
        SELECT s.*, sub.name as subject_name, sub.color, sub.priority, sub.deadline
        FROM sessions s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE s.week_start = ? AND sub.user_id = ?
        ORDER BY s.id
    """, (week_start, uid)).fetchall()

    conn.close()

    plan = {d: [] for d in DAYS}
    for row in sessions:
        r = dict(row)
        plan[r["day_name"]].append(r)

    return jsonify(plan)

@app.route("/api/sessions/<int:session_id>/status", methods=["POST"])
@login_required
def update_session_status(session_id):
    data   = request.json
    status = data.get("status")
    conn   = get_db()
    conn.execute("UPDATE sessions SET status=? WHERE id=?", (status, session_id))
    conn.commit()
    conn.close()
    return jsonify({"ok": True})

@app.route("/api/today", methods=["GET"])
@login_required
def get_today():
    uid        = current_user_id()
    today_name = date.today().strftime("%A")
    week_start = get_week_start()
    conn       = get_db()

    sessions = conn.execute("""
        SELECT s.*, sub.name as subject_name, sub.color, sub.priority, sub.deadline
        FROM sessions s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE s.week_start=? AND s.day_name=? AND sub.user_id=?
        ORDER BY sub.priority DESC
    """, (week_start, today_name, uid)).fetchall()

    conn.close()
    return jsonify([dict(r) for r in sessions])

@app.route("/api/adjust_missed", methods=["POST"])
@login_required
def adjust_missed():
    uid        = current_user_id()
    week_start = get_week_start()
    conn       = get_db()

    missed = conn.execute("""
        SELECT DISTINCT s.subject_id FROM sessions s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE s.week_start=? AND s.status='missed' AND sub.user_id=?
    """, (week_start, uid)).fetchall()
    missed_ids = [r["subject_id"] for r in missed]

    if not missed_ids:
        conn.close()
        return jsonify({"ok": False, "message": "No missed sessions found"})

    for sid in missed_ids:
        sub = conn.execute("SELECT priority FROM subjects WHERE id=?", (sid,)).fetchone()
        conn.execute("UPDATE subjects SET priority=? WHERE id=?", (min(3, sub["priority"] + 1), sid))

    conn.commit()

    rows     = conn.execute("SELECT * FROM subjects WHERE user_id=?", (uid,)).fetchall()
    subjects = [dict(r) for r in rows]
    hpd_row  = conn.execute("SELECT value FROM settings WHERE key='hours_per_day' AND user_id=?", (uid,)).fetchone()
    hours_per_day = float(hpd_row["value"]) if hpd_row else 5.0

    plan = ai_generate_plan(subjects, hours_per_day)

    conn.execute("""
        DELETE FROM sessions WHERE week_start=? AND status='pending'
        AND subject_id IN (SELECT id FROM subjects WHERE user_id=?)
    """, (week_start, uid))
    for day, blocks in plan.items():
        for block in blocks:
            conn.execute(
                "INSERT INTO sessions (subject_id, day_name, hours, week_start, status) VALUES (?,?,?,?,?)",
                (block["subject_id"], day, block["hours"], week_start, "pending")
            )
    conn.commit()
    conn.close()
    return jsonify({"ok": True, "adjusted": len(missed_ids)})

@app.route("/api/progress", methods=["GET"])
@login_required
def get_progress():
    uid      = current_user_id()
    conn     = get_db()
    rows     = conn.execute("SELECT * FROM subjects WHERE user_id=?", (uid,)).fetchall()
    subjects = []
    for r in rows:
        s = dict(r)
        s["completed_hours"] = get_completed_hours(s["id"])
        s["days_left"]       = days_until(s["deadline"])
        s["pct"]             = round((s["completed_hours"] / s["total_hours"]) * 100) if s["total_hours"] else 0
        remaining            = s["total_hours"] - s["completed_hours"]
        s["hours_per_day_needed"] = round(remaining / s["days_left"], 1) if s["days_left"] > 0 and remaining > 0 else 0
        subjects.append(s)

    week_start = get_week_start()
    sessions   = conn.execute("""
        SELECT s.* FROM sessions s
        JOIN subjects sub ON s.subject_id = sub.id
        WHERE s.week_start=? AND sub.user_id=?
    """, (week_start, uid)).fetchall()
    sessions   = [dict(r) for r in sessions]
    conn.close()

    score     = calc_productivity_score(subjects, sessions)
    total_h   = round(sum(s["total_hours"] for s in subjects), 1)
    done_h    = round(sum(s["completed_hours"] for s in subjects), 1)
    missed_n  = sum(1 for s in sessions if s["status"] == "missed")
    done_n    = sum(1 for s in sessions if s["status"] == "done")

    priority_order = get_priority_order(subjects)

    return jsonify({
        "score":          score,
        "total_hours":    total_h,
        "completed_hours":done_h,
        "missed_count":   missed_n,
        "done_count":     done_n,
        "subjects":       subjects,
        "priority_order": [s["id"] for s in priority_order],
    })

@app.route("/api/weekly_summary", methods=["GET"])
@login_required
def weekly_summary():
    uid        = current_user_id()
    week_start = get_week_start()
    conn       = get_db()
    summary    = {}
    for day in DAYS:
        rows = conn.execute("""
            SELECT s.* FROM sessions s
            JOIN subjects sub ON s.subject_id = sub.id
            WHERE s.week_start=? AND s.day_name=? AND sub.user_id=?
        """, (week_start, day, uid)).fetchall()
        rows = [dict(r) for r in rows]
        summary[day] = {
            "total":  round(sum(r["hours"] for r in rows), 1),
            "done":   sum(1 for r in rows if r["status"] == "done"),
            "missed": sum(1 for r in rows if r["status"] == "missed"),
            "pending":sum(1 for r in rows if r["status"] == "pending"),
        }
    conn.close()
    return jsonify(summary)


import os

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)

