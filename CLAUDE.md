# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BSL Consulta Video is a Twilio-based video calling application integrated with Wix for medical consultations. It features a React frontend, Node.js/Express backend, and WhatsApp messaging via Twilio WhatsApp API.

## Development Commands

### Backend
```bash
cd backend
npm install              # Install dependencies
npm run dev             # Start development server (nodemon + ts-node)
npm run build           # Compile TypeScript to dist/
npm start               # Run production build
npm test                # Run Jest tests
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
```

### Frontend
```bash
cd frontend
npm install              # Install dependencies
npm run dev             # Start Vite dev server (http://localhost:5173)
npm run build           # Build for production (outputs to dist/)
npm run preview         # Preview production build
npm run lint            # ESLint check
npm run lint:fix        # ESLint auto-fix
```

### Full Stack Build (for deployment)
```bash
# From backend/
npm run build
# From frontend/
npm run build
# Backend serves frontend from dist/ → backend/frontend-dist/
```

## Architecture

### Single-Component Deployment Model

**Critical Design Pattern**: The application uses a cost-optimized single-component architecture for Digital Ocean deployment.

- **One server serves everything**: The Express backend (port 3000) serves both API routes AND static frontend files
- **Build process**: Frontend builds to `frontend/dist/`, which gets copied to `backend/frontend-dist/` in Docker
- **Routing logic** (in `backend/src/index.ts`):
  1. `/health` → Health check endpoint
  2. `/api/video/*` → API routes (Twilio video operations)
  3. `/*` → Serves static frontend files (React SPA)
  4. All non-API routes → Fall back to `index.html` (for client-side routing)

**Why this matters**: In development, frontend runs on :5173 and backend on :3000 (requires CORS). In production, both are served from :3000 (no CORS needed). The `VITE_API_BASE_URL` env var controls this:
- Development: `VITE_API_BASE_URL=http://localhost:3000`
- Production: `VITE_API_BASE_URL=""` (empty = relative URLs)

### Wix Integration Pattern

**Critical Constraint**: Wix Velo has a limitation where you **cannot dynamically change button `.link` properties inside `onClick` handlers**. The browser processes the link before the onClick executes.

**Solution Pattern** (in `backend/panel-consultamedica-wix.json`):
1. Generate room name INSIDE the `onClick` handler (not in `$w.onReady`)
2. Configure both doctor and patient links ATOMICALLY in the same onClick
3. Send patient link via backend `sendTextMessage()` API (not WhatsApp Web links)
4. Configure doctor button link IMMEDIATELY after room generation to ensure same room

**Example**:
```javascript
$w('#whpTwilio').onClick(async () => {
    const roomName = generarNombreSala();  // Generate ONCE
    const patientLink = construirLinkVideollamada(...);
    const doctorLink = construirLinkDoctor(roomName, ...);

    // Configure doctor button ATOMICALLY
    $w('#iniciarConsultaTwilio').link = doctorLink;
    $w('#iniciarConsultaTwilio').target = "_blank";

    // Send to patient via backend API
    await sendTextMessage(phone, patientLink);
});
```

**Wrong Pattern** (causes different rooms):
```javascript
// BAD: Generating room in onReady or using wixLocation.to()
$w.onReady(() => {
    const roomName = generarNombreSala();  // This runs on page load, not click
    // ... causes doctor and patient to be in different rooms
});
```

### Session Tracking and Reporting

**Architecture**: Backend-based event tracking (NOT Wix-based) to generate WhatsApp reports.

**Flow**:
1. Frontend calls `POST /api/video/events/participant-connected` when joining room (with role: 'doctor'|'patient')
2. Frontend calls `POST /api/video/events/participant-disconnected` when leaving room
3. `SessionTrackerService` (singleton) maintains in-memory session state
4. When ALL participants disconnect, service generates formatted report and sends via WHAPI to 573008021701
5. Session is cleaned up from memory

**Key files**:
- `backend/src/services/session-tracker.service.ts` - Core tracking logic
- `frontend/src/hooks/useVideoRoom.ts` - Calls tracking endpoints (lines 71-78, 118-135)
- `frontend/src/components/VideoRoom.tsx` - Passes `role` prop
- Page components (`DoctorRoomPage.tsx`, `PatientPage.tsx`) - Provide role information

**Important**: Tracking calls are wrapped in try/catch to never break video functionality if tracking fails.

### Twilio Video Integration

**Token-based authentication**: Backend generates short-lived JWT tokens (1 hour TTL) using Twilio API Key.

**Room connection flow**:
1. User enters name and clicks "Join"
2. Frontend calls `POST /api/video/token` with identity and roomName
3. Backend generates Twilio access token with VideoGrant
4. Frontend uses token to connect via `twilio-video` SDK
5. Twilio automatically creates room if it doesn't exist

**Track attachment pattern** (critical for video rendering):
Twilio tracks must be attached to DOM elements in specific useEffect patterns. See `frontend/src/components/Participant.tsx` for the two-useEffect pattern used for reliable track rendering.

### Virtual Background and Blur Effects

**Architecture**: Uses `@twilio/video-processors` with locally hosted assets to avoid CDN permission issues.

**Implementation**:
- **Hook**: `frontend/src/hooks/useBackgroundEffects.ts` - Manages blur and virtual background processors
- **Component**: `frontend/src/components/BackgroundControls.tsx` - UI dropdown menu in bottom control bar
- **Assets**: `frontend/public/twilio-processors/` - TensorFlow Lite models and WASM files (5.1 MB)

**Critical**: Assets MUST be hosted locally (not from Twilio CDN) due to 403 Forbidden errors. The `assetsPath` must point to `/twilio-processors`.

**Features**:
- Gaussian blur background (15px radius)
- Virtual background replacement (office, nature, abstract presets)
- Only visible for doctors (`role === 'doctor'`)
- Located in bottom control bar (first button, left side)

**How it works**:
1. User clicks background button in control bar
2. Dropdown menu shows options (blur, virtual backgrounds, remove)
3. Processor loads TFLite model for person segmentation (~2-3 MB, cached after first load)
4. Effect applied to `LocalVideoTrack` via `track.addProcessor()`
5. Real-time processing without disconnecting from call

### Phone Number Formatting (International Support)

**Function**: `formatTelefono()` in `backend/panel-consultamedica-wix.json`

**Supported formats**:
- International with parentheses: `(+52) 2441564651` → `+522441564651`
- With plus prefix: `+13053392098` → `+13053392098`
- Without plus: `13053455190` → `+13053455190`
- Colombian local: `3001234567` → `+573001234567`

**Country codes recognized**: 1 (USA/Canada), 52 (Mexico), 57 (Colombia), 54 (Argentina), 55 (Brazil), 34 (Spain), 44 (UK), 49 (Germany), 33 (France)

**Usage**:
- For WhatsApp Web links: Use full number with `+`
- For `sendTextMessage()`: Remove `+` prefix (use `.substring(1)`)

## Key Files and Their Roles

### Backend
- `src/index.ts` - Express app setup, serves both API and static frontend
- `src/services/twilio.service.ts` - Token generation, room management
- `src/services/session-tracker.service.ts` - Session lifecycle tracking, WhatsApp reporting
- `src/controllers/video.controller.ts` - Video API endpoints
- `src/routes/video.routes.ts` - API route definitions

### Frontend
- `src/hooks/useVideoRoom.ts` - Core Twilio Video integration logic (connect, disconnect, tracks)
- `src/hooks/useBackgroundEffects.ts` - Manages blur and virtual background processors
- `src/components/VideoRoom.tsx` - Main video UI (grid layout, controls)
- `src/components/VideoControls.tsx` - Bottom control bar (mic, camera, backgrounds, hang up)
- `src/components/BackgroundControls.tsx` - Dropdown menu for background effects
- `src/components/Participant.tsx` - Individual participant video/audio rendering
- `src/pages/DoctorRoomPage.tsx` - Doctor joins pre-generated room from Wix
- `src/pages/PatientPage.tsx` - Patient joins from WhatsApp link with pre-filled info
- `src/services/api.service.ts` - Axios client for backend API calls
- `public/twilio-processors/` - TFLite models and WASM for background effects (DO NOT DELETE)

### Wix Integration
- `backend/wix.json` - Main repeater page (patient list with stats)
- `backend/panel-consultamedica-wix.json` - Consultation panel lightbox with videollamada button and status indicator

## Environment Variables

### Backend (.env)
```bash
# Twilio credentials (required for video calls and WhatsApp)
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=xxxxxx
TWILIO_API_KEY_SID=SKxxxxxx
TWILIO_API_KEY_SECRET=xxxxxx

# Twilio WhatsApp Configuration - Required for session reports and Wix integration
TWILIO_WHATSAPP_FROM=whatsapp:+3153369631
TWILIO_WHATSAPP_TEMPLATE_SID=HXc8473cfd60cd378314355e17e736d24d

# Server config
PORT=3000
NODE_ENV=development|production
ALLOWED_ORIGINS=http://localhost:5173  # Only needed in development
```

### Frontend (.env)
```bash
# Empty for production (uses relative URLs), localhost:3000 for dev
VITE_API_BASE_URL=http://localhost:3000  # Development only
```

## URL Patterns

- `/` - Home page (patient or doctor flow selection)
- `/patient/:roomName?nombre=X&apellido=Y&doctor=Z` - Patient joins room (pre-filled from Wix)
- `/doctor/:roomName?doctor=CODE` - Doctor joins specific room from Wix panel
- `/doctor` - Manual doctor room creation page

## Digital Ocean Deployment

Deployment is fully automated via `.do/app.yaml` configuration.

**Build process**:
1. Digital Ocean runs `Dockerfile` multi-stage build
2. Stage 1: Builds backend TypeScript
3. Stage 2: Builds frontend React app
4. Stage 3: Combines both into single image
5. Backend serves API on `/api/*` and frontend on `/*`

**Health check**: `GET /health` returns `{"status":"OK",...}`

**Cost**: $5/month (single Basic XXS service)

## Common Patterns

### Adding a new API endpoint
1. Add method to appropriate service (`backend/src/services/`)
2. Add controller method (`backend/src/controllers/`)
3. Register route (`backend/src/routes/`)
4. Add API client method (`frontend/src/services/api.service.ts`)

### Room name generation
Always use the pattern: `consulta-${timestamp36}-${random5}` (see `generarNombreSala()` in Wix files)

### WhatsApp message sending
Use `sendTextMessage(phoneWithoutPlus, message)` from Wix backend module, NOT WhatsApp Web links.

### Wix Status Indicators
When performing async operations in Wix, show user feedback:
```javascript
// Before operation
$w('#estadoWhp').text = "📤 ENVIANDO LINK...";
$w('#estadoWhp').show();

// On success
$w('#estadoWhp').text = "✅ MENSAJE ENVIADO";

// On error
$w('#estadoWhp').text = "❌ ERROR AL ENVIAR";
```

### Wix Data Queries
Main repeater in `wix.json` displays:
- **programadosHoy**: Count of patients scheduled today (by `fechaAtencion`)
- **atendidosHoy**: Count of patients attended today (by `fechaConsulta`)
- **restantesHoy**: Count scheduled today with empty `fechaConsulta`
- Patient list filtered by: `medico`, `fechaAtencion` (today), `isEmpty("fechaConsulta")`, sorted ascending

### Critical Wix Events
- `numeroId_click_1`: Opens consultation panel lightbox
- `whpTwilio.onClick`: Generates room, sends WhatsApp link, configures doctor button
- `iniciarConsultaTwilio`: Opens doctor video room (link set dynamically in whpTwilio.onClick)

## Testing Notes

- Backend has Jest configured but tests not yet implemented
- Frontend has test infrastructure but no test files yet
- Manual testing workflow: Start backend, start frontend, test video call flow with two browser windows/devices

## Known Issues and Solutions

### Virtual Backgrounds
- **Issue**: ERR_NAME_NOT_RESOLVED when using Twilio CDN
- **Solution**: Assets MUST be hosted locally in `frontend/public/twilio-processors/`
- **Don't**: Delete or move the `twilio-processors` folder (5.1 MB of TFLite models)

### WhatsApp Integration
- **Issue**: Different room names for doctor and patient
- **Solution**: Generate room name ONCE in onClick, configure both links atomically
- **Don't**: Generate room in `$w.onReady` or use separate onClick handlers

### Phone Number Format
- **Issue**: International numbers not recognized
- **Solution**: Use `formatTelefono()` which supports multiple country codes
- **Note**: Twilio WhatsApp API accepts numbers with or without `+` prefix (service handles both formats automatically)
