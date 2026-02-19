# 📚 StudyAI — Intelligent Study Planner

A full-stack AI-powered study planner built with **HTML + CSS + JavaScript** (frontend) and **Python Flask + SQLite** (backend).

---

## 🗂 Project Structure

```
study_planner/
├── app.py                  ← Flask backend (all routes + AI planner engine)
├── requirements.txt        ← Python dependencies
├── study_planner.db        ← SQLite database (auto-created on first run)
├── templates/
│   └── index.html          ← Main HTML template
└── static/
    ├── css/
    │   └── style.css       ← Full stylesheet
    └── js/
        └── app.js          ← All frontend JavaScript
```

---

## ⚙️ Setup & Run

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the app
```bash
python app.py
```

### 3. Open in browser
```
http://localhost:5000
```

---

## 🚀 Features

### ◈ Setup Tab
- Add subjects with name, total study hours, priority, and exam deadline
- Adjust available hours per day via slider
- Remove subjects anytime
- AI tip banner with study science insights

### ▦ Timetable Tab
- **AI-generated weekly schedule** using priority + urgency scoring and spaced repetition
- Click **✓ Done** or **✕ Missed** on any session block
- Priority ranking panel (AI-ranked by deadline + priority)
- **Auto-adjust missed tasks** button re-prioritizes and regenerates plan

### ◉ Today Tab
- Shows only today's sessions
- Mark sessions as Done or Missed
- **Pomodoro Timer** (25min focus / 5min break)
- Missed sessions sidebar with auto-adjust button
- Pomodoro block recommendations per session

### ◐ Progress Tab
- **Productivity Score (0–100%)** with letter grade (S/A/B/C/D)
- Subject-by-subject progress bars with "hours/day needed" calculation
- ⚠ Tight deadline warnings
- Stats: total hours, completed hours, missed sessions, done sessions
- Daily task summary across the full week

---

## 🧠 AI Planning Engine

The AI planner (`ai_generate_plan` in `app.py`) works as follows:

1. **Urgency Score** = `(priority × 10) + min(50, 100/days_left)`  
   Higher urgency → scheduled earlier in the week
2. **Session block sizes** capped by priority:
   - High priority → max 3h/day
   - Medium → max 2h/day  
   - Low → max 1.5h/day
3. **Daily cognitive load** capped at user-set hours/day
4. **Missed task adjustment**: bumps missed subjects' priority and regenerates

---

## 🗃 Database Schema (SQLite)

```sql
subjects  (id, name, total_hours, priority, deadline, color, created_at)
sessions  (id, subject_id, day_name, hours, week_start, status)
settings  (key, value)
```

---

## 🔌 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/subjects` | List all subjects with progress |
| POST | `/api/subjects` | Add new subject |
| DELETE | `/api/subjects/<id>` | Delete subject |
| GET | `/api/settings` | Get settings |
| POST | `/api/settings` | Save settings |
| POST | `/api/generate_plan` | Run AI planner, save sessions |
| GET | `/api/timetable` | Get this week's timetable |
| POST | `/api/sessions/<id>/status` | Mark session done/missed/pending |
| GET | `/api/today` | Get today's sessions |
| POST | `/api/adjust_missed` | Adjust missed tasks, regenerate |
| GET | `/api/progress` | Productivity score + analytics |
| GET | `/api/weekly_summary` | Per-day session summary |

---

## 💡 Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML5, CSS3, Vanilla JS (ES6+) |
| Backend | Python 3.x + Flask |
| Database | SQLite (via Python `sqlite3` module) |
| Fonts | Google Fonts (Syne + DM Sans) |
