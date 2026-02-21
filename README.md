# Object Detection Frontend

React web UI for labeling, training setup, live monitoring, and model comparison.

The main app lives at:

- `frontend/yolo-local-labeler`

## Quick Start

```powershell
cd frontend\yolo-local-labeler
npm install
npm run dev
```

- App URL: `http://localhost:5173`

## API Connection

Create `.env` in `frontend/yolo-local-labeler`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

The client normalizes to `/api/v1` automatically.

## Full Frontend Guide

See:

- `frontend/yolo-local-labeler/README.md`

