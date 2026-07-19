import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import appConfig from './config/app.config';
import videoRoutes from './routes/video.routes';
import telemedicineRoutes from './routes/telemedicine.routes';
import medicalPanelRoutes from './routes/medical-panel.routes';
import twilioVoiceRoutes from './routes/twilio-voice.routes';
import tenantRoutes from './routes/tenant.routes';
import webhookRoutes from './routes/webhook.routes';
import whatsappChatRoutes from './routes/whatsapp-chat.routes';
import { telemedicineSocketService } from './services/telemedicine-socket.service';
import { sessionTracker } from './services/session-tracker.service';

const app: Application = express();
const httpServer = createServer(app);

// Initialize Socket.io with CORS configuration
const io = new Server(httpServer, {
  cors: {
    origin: appConfig.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
  },
});

// Initialize telemedicine socket service
telemedicineSocketService.initialize(io);
console.log('[Socket.io] Telemedicine service initialized');

// Initialize session tracker with Socket.io
sessionTracker.initialize(io);
console.log('[Socket.io] Session tracker initialized');

// Socket.io: Handle join-room event for doctors
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('join-room', (roomName: string) => {
    socket.join(roomName);
    console.log(`[Socket.io] Socket ${socket.id} joined room: ${roomName}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Middleware de seguridad - Configurado para servir archivos estaticos
app.use(
  helmet({
    contentSecurityPolicy: false, // Permitir carga de recursos del frontend
    crossOriginEmbedderPolicy: false, // Necesario para Twilio Video
  })
);

// CORS - Solo necesario si se accede desde otro dominio
app.use(
  cors({
    origin: appConfig.allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (appConfig.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

// ---------------------------------------------------------------------------
// Cutover redirect: enviar el tráfico WEB de medico-bsl.com a AWS.
// - Gated por REDIRECT_TO_AWS (default off) → activar/desactivar sin tocar código.
// - Solo redirige el host viejo (medico-bsl.com / www); en AWS (aws.medico-bsl.com)
//   no hace nada (evita loops).
// - NO redirige /api, /health ni /twilioVoz.mp3 (TwiML/audio de Twilio Voice y
//   webhooks) para no romper integraciones.
// - 302 (temporal) para que sea reversible al instante (el 301 lo cachean los
//   navegadores).
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  if (process.env.REDIRECT_TO_AWS !== 'true') return next();
  const host = (req.headers.host || '').split(':')[0].toLowerCase();
  if (host !== 'medico-bsl.com' && host !== 'www.medico-bsl.com') return next();
  const p = req.path;
  if (p.startsWith('/api') || p === '/health' || p === '/twilioVoz.mp3') return next();
  const target = (process.env.REDIRECT_TARGET || 'https://aws.medico-bsl.com') + req.originalUrl;
  return res.redirect(302, target);
});

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: appConfig.nodeEnv,
  });
});

// API Routes
app.use('/api/video', videoRoutes);
app.use('/api/telemedicine', telemedicineRoutes);
app.use('/api/medical-panel', medicalPanelRoutes);
app.use('/api/twilio', twilioVoiceRoutes);
app.use('/api/tenant', tenantRoutes);
app.use('/api/webhook', webhookRoutes);
// Chat de WhatsApp del panel médico (proxy a bsl-plataforma, tenant 'bsl').
app.use('/api/whatsapp-chat', whatsappChatRoutes);

// Servir archivos estaticos del frontend (despues de las rutas API)
const frontendPath = path.join(__dirname, '..', 'frontend-dist');
app.use(express.static(frontendPath));

// SPA fallback - Todas las rutas no API devuelven index.html
app.get('*', (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handler
app.use((err: Error, _req: Request, res: Response) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: appConfig.nodeEnv === 'development' ? err.message : undefined,
  });
});

// Start server
const PORT = appConfig.port;

httpServer.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎥  BSL CONSULTA VIDEO - Backend API                    ║
║                                                           ║
║   Server running on: http://localhost:${PORT}              ║
║   Environment: ${appConfig.nodeEnv.toUpperCase().padEnd(43)}║
║                                                           ║
║   API Endpoints:                                          ║
║   - Health Check:  GET  /health                           ║
║   - Video Token:   POST /api/video/token                  ║
║   - Create Room:   POST /api/video/rooms                  ║
║   - Get Room:      GET  /api/video/rooms/:roomName        ║
║   - Get Sessions:  GET  /api/telemedicine/sessions        ║
║   - Validate Sess: GET  /api/telemedicine/sessions/:room  ║
║   - Medical Panel: GET  /api/medical-panel/stats/:code    ║
║                                                           ║
║   WebSocket Services:                                     ║
║   - Telemedicine:  /telemedicine (Socket.io)              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
