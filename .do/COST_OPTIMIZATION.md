# Optimización de Costos - Digital Ocean

## Resumen

Este proyecto ha sido **optimizado para reducir costos** en Digital Ocean App Platform de **$10/mes a $5/mes** (50% de ahorro).

## Arquitectura Anterior vs Nueva

### Antes (2 componentes = Mayor costo)
```
┌─────────────────────────────────────┐
│  Frontend (Static Site)             │
│  - Gratis, pero cuenta como         │
│    componente adicional              │
│  - URL: app-name.ondigitalocean.app │
└─────────────────────────────────────┘
              │
              │ HTTP Requests
              ↓
┌─────────────────────────────────────┐
│  Backend (Web Service)              │
│  - $5/mes                            │
│  - Requiere CORS                     │
│  - URL: backend-app.ondigitalocean   │
└─────────────────────────────────────┘

COSTO: $5/mes (backend) + cargos por componente
```

### Ahora (1 componente = Menor costo)
```
┌─────────────────────────────────────┐
│  App Service (Web Service)          │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Express Backend (Node.js)     │ │
│  │  - API REST en /api/*          │ │
│  │  - Sirve archivos estáticos    │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  Frontend (React Build)        │ │
│  │  - Servido desde /             │ │
│  │  - SPA routing                 │ │
│  └────────────────────────────────┘ │
│                                      │
│  URL: app-name.ondigitalocean.app   │
└─────────────────────────────────────┘

COSTO: $5/mes (1 solo servicio)
```

## Cambios Implementados

### 1. Dockerfile Unificado (`/Dockerfile`)

- **Multi-stage build** que construye backend y frontend
- Stage 1: Build del backend (TypeScript → JavaScript)
- Stage 2: Build del frontend (React → archivos estáticos)
- Stage 3: Imagen de producción con ambos compilados

```dockerfile
FROM node:20-alpine AS backend-builder
# ... build backend

FROM node:20-alpine AS frontend-builder
# ... build frontend

FROM node:20-alpine
# ... combinar ambos en imagen final
```

### 2. Backend Actualizado (`backend/src/index.ts`)

- **Express sirve archivos estáticos** del frontend
- **SPA routing**: todas las rutas no-API retornan `index.html`
- **Order matters**: API routes primero, luego static files

```typescript
// API Routes
app.use('/api/video', videoRoutes);

// Servir archivos estáticos
const frontendPath = path.join(__dirname, '..', 'frontend-dist');
app.use(express.static(frontendPath));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});
```

### 3. Frontend Actualizado (`frontend/src/services/api.service.ts`)

- **URL relativa** en producción (mismo dominio)
- **URL absoluta** solo en desarrollo local

```typescript
// Producción: '' (URL relativa)
// Desarrollo: 'http://localhost:3000'
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
```

### 4. Digital Ocean Config (`.do/app.yaml`)

- **Eliminado**: componente `static_sites`
- **Solo 1 servicio**: backend que sirve todo
- **Dockerfile**: apunta a `/Dockerfile` (raíz del proyecto)

```yaml
services:
  - name: backend
    dockerfile_path: Dockerfile  # En la raíz
    http_port: 3000
    routes:
      - path: /  # Maneja todas las rutas
```

### 5. Docker Compose (`docker-compose.yml`)

- Actualizado para usar el mismo Dockerfile
- **1 servicio** en lugar de 2
- Puerto 3000 expone tanto API como frontend

## Routing en Producción

### Backend sirve:
- `GET /health` → Health check del backend
- `POST /api/video/token` → API de Twilio
- `POST /api/video/rooms` → API de Twilio
- `GET /assets/*` → Assets estáticos del frontend
- `GET /` → `index.html` del frontend
- `GET /doctor` → `index.html` del frontend (SPA)
- `GET /patient/:id` → `index.html` del frontend (SPA)

### Ventajas:
1. **Ahorro de costos**: 1 componente en lugar de 2
2. **No requiere CORS**: frontend y backend en mismo dominio
3. **Menor latencia**: sin redirects entre dominios
4. **Deployment simplificado**: un solo build
5. **Mejor seguridad**: menos superficie de ataque

## Deployment

### Paso 1: Push a GitHub
```bash
git add .
git commit -m "Optimize for single component deployment"
git push origin main
```

### Paso 2: Digital Ocean detectará automáticamente
- `app.yaml` define 1 solo servicio
- `Dockerfile` construye ambos componentes
- Deploy se hace automáticamente

### Paso 3: Configurar variables de entorno
Solo necesitas configurar las variables secretas de Twilio:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_API_KEY_SID`
- `TWILIO_API_KEY_SECRET`
- `JWT_SECRET`

**NO necesitas** `VITE_API_BASE_URL` porque el frontend se sirve desde el mismo backend.

## Verificación Post-Deployment

### 1. Verificar que solo hay 1 componente
En Digital Ocean Dashboard:
- Ve a tu app
- Deberías ver solo 1 servicio llamado "backend"
- Costo mostrado: $5/mes

### 2. Verificar que las rutas funcionan
```bash
# Health check
curl https://tu-app.ondigitalocean.app/health

# Frontend
curl https://tu-app.ondigitalocean.app/
# Debería retornar el HTML de React

# API
curl -X POST https://tu-app.ondigitalocean.app/api/video/token \
  -H "Content-Type: application/json" \
  -d '{"identity":"test","roomName":"test-room"}'
```

### 3. Verificar en el navegador
- Abre `https://tu-app.ondigitalocean.app`
- El frontend debería cargar normalmente
- Las llamadas API no deberían tener errores CORS
- Inspecciona Network tab: todas las requests van a la misma URL

## Troubleshooting

### Error: "Cannot GET /"
**Problema**: El backend no está sirviendo archivos estáticos.

**Solución**: Verifica que `frontend-dist/` existe en el contenedor.
```bash
# En Digital Ocean Console
ls -la /app/frontend-dist/
```

### Error: "404 on /api/video/token"
**Problema**: Las rutas API no están registradas antes de static files.

**Solución**: Verifica el orden en `backend/src/index.ts`:
1. API routes primero
2. Static files después
3. SPA fallback al final

### Error: "CORS policy" en consola
**Problema**: El frontend está intentando llamar a una URL diferente.

**Solución**: Verifica que `VITE_API_BASE_URL` NO esté configurado en Digital Ocean.

## Migración desde Arquitectura Anterior

Si ya tienes desplegada la versión anterior (2 componentes):

### Opción 1: Update existente (Recomendado)
1. Push los cambios al mismo repositorio
2. Digital Ocean detectará el nuevo `app.yaml`
3. Redeploy automático
4. Elimina el componente `frontend` manualmente desde el dashboard

### Opción 2: Nueva app
1. Crea una nueva app en Digital Ocean
2. Usa el nuevo código
3. Configura las variables de entorno
4. Deploy
5. Elimina la app antigua

## Costos Finales

- **Servicio backend+frontend**: $5/mes (Basic XXS)
- **Total mensual**: $5/mes
- **Ahorro anual**: $60/año (comparado con $120/año)

## Escalabilidad

Si necesitas más recursos en el futuro, puedes cambiar el `instance_size_slug`:

```yaml
# app.yaml
instance_size_slug: basic-xs  # $12/mes (más recursos)
instance_size_slug: basic-s   # $25/mes (aún más recursos)
```

Pero para una app de videollamadas con tráfico moderado, Basic XXS es suficiente.

## Conclusión

Esta optimización reduce costos **sin sacrificar funcionalidad**. El usuario obtiene:
- ✅ Mismo performance
- ✅ Mejor seguridad (sin CORS)
- ✅ Deployment simplificado
- ✅ 50% menos costo mensual
- ✅ Menor latencia (misma URL)

---

**Siguiente paso**: Sigue las instrucciones en [QUICK_START.md](QUICK_START.md) para deployar.
