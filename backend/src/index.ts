import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import appConfig from './config/app.config';
import videoRoutes from './routes/video.routes';

const app: Application = express();

// Middleware de seguridad
app.use(helmet());

// CORS
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

// Routes
app.use('/api/video', videoRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
  });
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

app.listen(PORT, () => {
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
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

export default app;
