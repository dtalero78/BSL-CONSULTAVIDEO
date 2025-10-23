import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import appConfig from './config/app.config';
import videoRoutes from './routes/video.routes';
import telemedicineRoutes from './routes/telemedicine.routes';
import { telemedicineSocketService } from './services/telemedicine-socket.service';

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
  })
);

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
if (appConfig.nodeEnv === 'development') {
  app.use(morgan('dev'));
}

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
║                                                           ║
║   WebSocket Services:                                     ║
║   - Telemedicine:  /telemedicine (Socket.io)              ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
