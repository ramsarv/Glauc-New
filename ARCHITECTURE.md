# Glauc — Full Stack Architecture  v3.0

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER'S PHONE                            │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           GlaucApp.jsx  (React Native Web)           │   │
│  │                                                      │   │
│  │  Onboarding → Camera → Processing → Results → Trend │   │
│  └──────────────────────┬───────────────────────────────┘   │
└─────────────────────────┼───────────────────────────────────┘
                          │  HTTPS  (JWT auth on every request)
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              NODE.JS GATEWAY  (glauc-gateway/server.js)     │
│                                                             │
│  • Auth (JWT, 30-day tokens)                                │
│  • Rate limiting (10 scans/day per user)                    │
│  • Image compression via Sharp (JPEG, 1024px max)           │
│  • User database (SQLite / better-sqlite3)                  │
│  • Anonymises user IDs before forwarding to Python          │
│  • Proxies: /predict  /explain  /history  /trend            │
│  • Reminder scheduling (APNs / FCM in production)           │
└──────────────────────┬──────────────────────────────────────┘
                       │  HTTP  (internal, same VPC)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            PYTHON MODEL SERVER  (glauc_api.py)              │
│                                                             │
│  FastAPI + asyncio.Queue (explanation worker)               │
│                                                             │
│  ┌─────────────────────┐   ┌──────────────────────────┐    │
│  │   DINOv3 ViT-B/14   │   │   Qwen3-VL-8B-Instruct   │    │
│  │   + Demographics    │   │   (async, background)    │    │
│  │   + MC Dropout (30) │   │                          │    │
│  │   + TTA (×8 views)  │   └──────────────────────────┘    │
│  │   + Temperature Cal │                                    │
│  └─────────────────────┘                                    │
│                                                             │
│  glauc_analysis.py                                          │
│   • GradCAM heatmaps                                        │
│   • Reliability diagram + ECE                               │
│   • Longitudinal SQLite DB  (glauc_predictions.db)         │
│   • Trend / rate-of-change queries                          │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
glauc/
├── app/
│   └── GlaucApp.jsx              React Native Web — all 6 screens
│
├── glauc-gateway/
│   ├── server.js                 Node.js Express API gateway
│   ├── package.json
│   └── .env                     JWT_SECRET, PYTHON_API_URL, PORT
│
├── model/
│   ├── glauc_model.py            DINOv3 training pipeline v3.0
│   ├── glauc_api.py              FastAPI model server v3.0
│   ├── glauc_analysis.py         GradCAM, calibration, longitudinal DB
│   └── requirements.txt
│
└── glauc_outputs/                generated at training time
    ├── best_model.pt
    ├── vocab.json
    ├── training_curves.png
    ├── prediction_analysis.png
    ├── gradcam_grid.png
    ├── reliability_diagram.png
    ├── calibration_summary.json
    ├── bias_audit.txt
    ├── predictions.csv
    ├── explanations_report.txt
    └── glauc_predictions.db      longitudinal prediction store
```

## Setup

### 1. Python model server

```bash
cd model/
pip install -r requirements.txt

# Train the model (requires eye image dataset)
python glauc_model.py

# Start the model API
uvicorn glauc_api:app --host 0.0.0.0 --port 8000
```

### 2. Node.js gateway

```bash
cd glauc-gateway/
npm install

# Create .env file
echo "JWT_SECRET=$(openssl rand -hex 32)" >> .env
echo "PYTHON_API_URL=http://localhost:8000" >> .env
echo "PORT=3000" >> .env

# Start
npm start
```

### 3. React app

```bash
# Option A: Expo (iOS + Android native)
npx create-expo-app glauc-app
# Copy GlaucApp.jsx → App.js
# npm install and npx expo start

# Option B: Web only (Vite)
npm create vite@latest glauc-web -- --template react
# Copy GlaucApp.jsx → src/App.jsx
# npm install && npm run dev
```

## API Reference

All app endpoints go through the Node gateway on port 3000.

```
POST /auth/register      { email, password, name }  → { token, user }
POST /auth/login         { email, password }         → { token, user }
GET  /auth/me            (auth)                      → user profile

POST /scan               (auth, multipart)           → prediction + job_id
  Fields: file, gender, race, age, datetime_str
GET  /scan/explain/:id   (auth)                      → explanation or "pending"

GET  /history            (auth)                      → all past predictions
GET  /trend              (auth)                      → trend + rate of change
POST /reminder           (auth) { enabled: bool }    → toggle 90-day reminder
```

## Design System

| Token        | Value     | Usage                        |
|--------------|-----------|------------------------------|
| obsidian     | #0A0A0F   | Primary background           |
| amber        | #C8922A   | Primary accent (iris gold)   |
| amberHi      | #E5A832   | Button highlight             |
| cream        | #F2EDE4   | Primary text                 |
| creamMid     | #B8B0A0   | Secondary text               |
| teal         | #2AADA0   | Positive / improving         |
| red          | #C84040   | Elevated risk / warning      |
| Playfair Display | serif | Display headings             |
| DM Sans      | sans-serif | Body + UI text               |

## Production Checklist

- [ ] Replace JWT_SECRET with cryptographically random 64-char hex
- [ ] Set CORS to your specific app domain
- [ ] Deploy Python server on GPU instance (A100 recommended)
- [ ] Add HTTPS termination (nginx + certbot or Cloudflare)
- [ ] Configure APNs/FCM credentials for push reminders
- [ ] Set up database backups for glauc_predictions.db
- [ ] Add Sentry for error monitoring
- [ ] Run bias audit before public launch — see bias_audit.txt
- [ ] Get regulatory opinion on SaMD classification before launch
- [ ] Complete clinical validation study before making health claims
