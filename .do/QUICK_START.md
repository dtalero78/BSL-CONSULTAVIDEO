# Quick Start: Desplegar en Digital Ocean en 5 Minutos

## TL;DR

```bash
# 1. Commit y push
git add .
git commit -m "Add Digital Ocean deployment"
git push origin main

# 2. Ve a Digital Ocean
# https://cloud.digitalocean.com/apps

# 3. Create App > Selecciona tu repo

# 4. Configura estas variables de entorno:
TWILIO_ACCOUNT_SID=ACxxxxx...
TWILIO_AUTH_TOKEN=xxxxx...
TWILIO_API_KEY_SID=SKxxxxx...
TWILIO_API_KEY_SECRET=xxxxx...
JWT_SECRET=tu-secret-seguro

# 5. Deploy!
```

## Post-Deployment (Importante!)

Despues del primer despliegue:

### 1. Configura CORS
```
Settings > backend > Environment Variables
Edita ALLOWED_ORIGINS
Valor: https://tu-app.ondigitalocean.app
```

### 2. Verifica
```bash
# Backend health check
curl https://backend-tu-app.ondigitalocean.app/health

# Frontend
# Abre https://tu-app.ondigitalocean.app en el navegador
```

## Estructura de URLs

Digital Ocean asignara automaticamente:

- Frontend: `https://[app-name].ondigitalocean.app`
- Backend: `https://backend-[app-name].ondigitalocean.app`

## Troubleshooting Rapido

| Problema | Solucion |
|----------|----------|
| No detecta componentes | Verifica que `.do/app.yaml` este commiteado |
| Error de CORS | Actualiza `ALLOWED_ORIGINS` con la URL del frontend |
| Backend no inicia | Verifica las credenciales de Twilio |
| Frontend error 404 | Normal durante build, espera 5-10 min |

## Costos

- **Backend**: $5/mes (Basic XXS)
- **Frontend**: Gratis (static site)
- **Total**: ~$5/mes

## Siguiente Paso

Lee la [Guia Completa](DEPLOYMENT_GUIDE.md) para configuracion avanzada.
