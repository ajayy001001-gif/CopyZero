# CopyZero - Academic Integrity Platform

A web-based platform for assignment submission and AI-powered plagiarism detection.

## Overview

CopyZero provides a dual-role system for professors and students to manage academic assignments with automated plagiarism detection and evaluation.

**Key Features:**
- Role-based access (Professor/Student)
- Assignment creation and submission management
- AI-powered plagiarism, AI-text, and content-quality evaluation in a single pass
- Automated grading with detailed feedback

## Technology Stack

**Frontend:**
- React.js + Vite
- React Router
- Tailwind CSS
- Firebase Authentication

**Backend:**
- Node.js with Express
- Firebase Admin SDK (Auth + Firestore)
- NVIDIA NIM (DeepSeek V4 Flash) for AI evaluation

## Plagiarism & Evaluation System

A single NVIDIA NIM (DeepSeek V4 Flash) call evaluates each submission against:

1. **Student-to-student plagiarism** — compares the submission text against other submissions for the same assignment
2. **AI-generated text likelihood** — flags content that reads as AI-assisted
3. **Rubric criteria scoring** — scores the submission against the professor's rubric with reasoning per criterion

**Final Score Calculation:**
- Plagiarism Score = MIN(student-plagiarism, AI-detection)
- Final Grade = (Plagiarism × Weight%) + (Content Quality × Weight%)

The AI evaluation (`POST /api/professor/ollama-evaluate`) returns suggested scores for the professor to review; the professor then confirms via `POST /api/professor/evaluate`, which is what actually persists the score.

## Project Structure

```
academic-integrity/
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── professor/    # Professor dashboard, assignments, evaluation
│   │   │   └── student/       # Student dashboard, submission, view scores
│   │   ├── components/        # Reusable UI components
│   │   ├── services/          # API communication
│   │   └── context/           # Authentication context
│   └── public/
├── backend/
│   ├── src/
│   │   ├── controllers/       # Request handlers
│   │   ├── services/          # Business logic (NVIDIA NIM, Firestore)
│   │   ├── routes/            # API routes
│   │   ├── middleware/        # Auth, validation
│   │   └── utils/             # Helper functions
│   └── .env                   # Environment variables (not in repo)
└── firestore.rules            # Firestore security rules (deny-all; app is backend-only)
```

## Local Setup

### Prerequisites

- Node.js (v18+, native `fetch` is required)
- npm
- A Firebase project with Authentication (Email/Password) and Firestore enabled
- An NVIDIA NIM API key ([build.nvidia.com](https://build.nvidia.com)) for AI evaluation

### 1. Clone and install

```bash
git clone https://github.com/Ajay-1011-git/CopyZero.git
cd CopyZero
cd backend && npm install
cd ../frontend && npm install
```

### 2. Configure environment variables

Both `backend/` and `frontend/` need their own `.env` file. Copy the example and fill in real values — **never commit `.env`, it's gitignored on purpose.**

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**`backend/.env`:**
```env
PORT=5000
NODE_ENV=development
FRONTEND_URLS=http://localhost:5173

# Firebase Web API key (Project Settings > General > Web API Key) — used
# server-side to verify passwords via the Identity Toolkit REST API
FIREBASE_WEB_API_KEY=

# Firebase Admin credentials (Project Settings > Service Accounts > Generate new key)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# NVIDIA NIM for AI evaluation
NVIDIA_NIM_API_KEY=
NVIDIA_NIM_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_NIM_MODEL=deepseek-ai/deepseek-v4-flash
```

`FIREBASE_PRIVATE_KEY` must keep its `\n` sequences escaped (literal backslash-n), since `.env` files can't hold real multi-line values — the app un-escapes them at startup. Wrap the whole value in double quotes.

If `FIREBASE_PROJECT_ID`/`FIREBASE_CLIENT_EMAIL`/`FIREBASE_PRIVATE_KEY` are left empty, the backend falls back to a local `backend/firebase-service-account.json` file (also gitignored) — useful if you'd rather drop in the downloaded service-account JSON than split it into env vars.

> **Port 5000 on macOS:** macOS's AirPlay Receiver often already listens on port 5000. If the backend fails to bind, change `PORT` (e.g. `5001`) and update `VITE_API_URL` below to match.

**`frontend/.env`:**
```env
VITE_API_URL=http://localhost:5000

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

The `VITE_FIREBASE_*` values are your Firebase **web app** config (Project Settings > General > Your apps > SDK setup and configuration) — these are public client keys, safe to ship in a browser bundle, but still kept out of git so each environment can point at its own Firebase project.

### 3. Deploy Firestore rules (recommended)

This app only talks to Firestore through the backend's Admin SDK, so `firestore.rules` at the repo root denies all direct client access as defense-in-depth:

```bash
firebase deploy --only firestore:rules
```

### 4. Run it

```bash
# terminal 1
cd backend && npm run dev

# terminal 2
cd frontend && npm run dev
```

Backend runs on `http://localhost:5000` (or your custom `PORT`), frontend on `http://localhost:5173`. Sign up with a `@vit.ac.in` or `@vitstudent.ac.in` email (the app enforces this domain restriction) to get started.

## User Workflow

### Professor Flow

1. Login with VIT email (@vit.ac.in)
2. Create assignment with rubric criteria
3. Set plagiarism and content weightages
4. Students submit assignments
5. Auto-evaluate using AI or manually grade
6. Override scores if needed
7. View detailed analytics

### Student Flow

1. Login with VIT email (@vitstudent.ac.in)
2. View available assignments
3. Save drafts (optional blockchain verification)
4. Submit final assignment
5. View evaluation results
6. See detailed feedback and scores

## API Endpoints

**Authentication:**
- POST `/api/auth/signup` - Register new user
- POST `/api/auth/login` - User login
- GET `/api/auth/profile` - Get user profile

**Professor:**
- POST `/api/professor/assignments` - Create assignment
- POST `/api/professor/rubrics` - Create rubric
- GET `/api/professor/submissions/assignment/:id` - Get submissions
- POST `/api/professor/ollama-evaluate` - AI evaluation
- POST `/api/professor/evaluate` - Manual evaluation

**Student:**
- GET `/api/student/assignments` - Get available assignments
- POST `/api/student/submit` - Submit assignment
- POST `/api/student/drafts` - Save draft
- GET `/api/student/scores/assignment/:id` - View score

## Evaluation Model

- **NVIDIA NIM — deepseek-ai/deepseek-v4-flash**: one combined call per submission covering plagiarism comparison, AI-generated-text likelihood, and rubric-criteria scoring with reasoning.

The submission schema still carries `submissionType`/`blockchainTxHash` fields from an earlier design direction, but on-chain verification isn't currently wired up — those fields are unused placeholders today.

## Security

- VIT email domain verification (@vit.ac.in, @vitstudent.ac.in) on signup and login
- Real password verification on login via Firebase Identity Toolkit (no user-enumeration hints — generic 401 on any failure)
- Role-based access control, enforced server-side on every route
- Ownership checks on all professor-scoped resources (assignments, rubrics, scores)
- CORS origin allowlist, `helmet`, rate limiting (strict on `/api/auth/*`, general elsewhere)
- Firestore security rules deny all direct client access — the app only talks to Firestore through the backend's Admin SDK
- Secrets (Firebase Admin credentials, NVIDIA API key) loaded from environment variables, never committed
- Error responses are generic to clients; full errors are logged server-side only

## Known Limitations

- AI detection accuracy depends on the underlying model and isn't guaranteed
- NVIDIA NIM free tier has rate limits

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Contact

For questions or issues, please open an issue on GitHub.