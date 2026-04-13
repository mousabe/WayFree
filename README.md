# WayFree

WayFree is a real-time spoken navigation prototype for blind and low-vision pedestrians. It uses a phone or laptop camera, streams frames to a vision-language model, and turns each scene into short navigation guidance focused on the walkable corridor ahead.

This repository is being prepared for open source as a public beta. The goal is to make the project easier to run, safer to evaluate, and more polished for contributors exploring the interface.

## Safety note

WayFree is an accessibility research prototype, not a certified mobility aid. It should be tested carefully, in controlled environments, and never treated as a sole source of safety-critical navigation information.

## What it does

- Captures live frames from the browser camera.
- Sends frames to a FastAPI + Socket.IO backend.
- Uses a multimodal Groq-hosted model to generate navigation guidance.
- Keeps short session memory to avoid repetitive narration.
- Speaks guidance aloud with browser text-to-speech.
- Shows structured guidance cards for:
  - immediate path
  - upcoming path
  - left/right clearance
  - surface and elevation
  - movement instruction
  - alert level
- Includes a frontend demo mode so contributors can explore the UI without a camera or API key.

## Stack

- Backend: FastAPI, Socket.IO, Groq, LangChain
- Frontend: React, Vite
- Transport: WebSocket streaming for real-time frame updates

## Project layout

```text
app/
  config.py
  main.py
  routers/vision.py
  services/guidance.py
  services/llava.py
  services/memory.py
client/
  src/App.jsx
  src/App.css
  src/index.css
test.py
```

## Local setup

### 1. Backend

Create and activate a virtual environment, then install dependencies:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Copy the example environment file and add your Groq key:

```bash
cp .env.example .env
```

Run the API:

```bash
uvicorn app.main:app --reload
```

The backend will be available at `http://localhost:8000`.

### 2. Frontend

Install the client dependencies:

```bash
cd client
npm install
```

Optionally create a frontend env file if your API is not on the default local URL:

```bash
cp .env.example .env
```

Start the frontend:

```bash
npm run dev
```

The Vite app will usually run at `http://localhost:5173`.

## API overview

### `GET /health`

Returns basic runtime information, including version, active sessions, and model name.

### `POST /vision/describe`

Accepts a single base64-encoded image and returns:

- `description`
- `alert_level`
- `summary`
- `sections`

This is useful for one-off testing, demos, and regression checks.

## Realtime flow

1. The frontend opens the camera and captures frames roughly every 900ms.
2. Frames are sent to the backend over Socket.IO.
3. The backend adds short per-session context and asks the model for navigation guidance.
4. Similar updates are filtered so the app does not repeat the same message every frame.
5. Structured guidance is sent back to the frontend and spoken aloud.

## Quick test

You can test the single-image endpoint with a local image:

```bash
python test.py /absolute/path/to/image.jpg
```

## Current product improvements

This version adds several improvements over the initial prototype:

- mobile-first interface instead of a plain demo panel
- structured guidance payloads for richer UI rendering
- per-session memory instead of shared global memory
- demo mode for contributors without a live backend path
- configurable backend/frontend environment variables
- more useful README and environment examples

## Next milestones

- add confidence and uncertainty signaling
- improve session analytics and debug tooling
- add tests around prompt parsing and guidance formatting
- support recorded video walkthrough demos
- expand accessibility options, including haptics on supported devices

## License

MIT. See [LICENSE](LICENSE).
