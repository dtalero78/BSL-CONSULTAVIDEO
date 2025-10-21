# Digital Ocean Deployment Configuration

Esta carpeta contiene toda la configuracion necesaria para desplegar BSL-CONSULTAVIDEO en Digital Ocean App Platform.

## Archivos Disponibles

### 1. `app.yaml` - Configuracion Principal
**Archivo de configuracion de Digital Ocean App Platform**

- Define la estructura de la aplicacion (backend + frontend)
- Configura variables de entorno
- Establece health checks
- Especifica recursos y escalado

**Este es el archivo mas importante.** Digital Ocean lo detectara automaticamente.

---

### 2. `QUICK_START.md` - Inicio Rapido (5 minutos)
**Para usuarios que quieren desplegar YA**

- Comandos copy-paste
- Pasos minimos
- Sin explicaciones extensas
- Perfecto para despliegue rapido

**Lee esto si**: Tienes prisa y quieres desplegar ahora.

---

### 3. `DEPLOYMENT_GUIDE.md` - Guia Completa
**Documentacion detallada paso a paso**

- Explicaciones completas
- Configuracion de variables de entorno
- Troubleshooting
- Post-deployment tasks
- Costos estimados
- Comandos utiles

**Lee esto si**: Quieres entender todo el proceso a fondo.

---

### 4. `MANUAL_SETUP.md` - Configuracion Manual
**Alternativas a app.yaml**

- Configuracion via UI de Digital Ocean
- Configuracion via doctl CLI
- Comparacion de opciones
- Para casos especiales

**Lee esto si**: Prefieres configurar manualmente o tienes requisitos especiales.

---

### 5. `CHECKLIST.md` - Lista de Verificacion
**Checklist interactivo para el despliegue**

- Pre-deployment checks
- Durante el despliegue
- Post-deployment validation
- Troubleshooting steps

**Usa esto**: Para asegurar que no olvidas ningun paso.

---

## Como Usar Esta Configuracion

### Opcion 1: Despliegue Rapido (Recomendado)

```bash
# 1. Commit y push
git add .
git commit -m "Add Digital Ocean deployment"
git push origin main

# 2. Ve a Digital Ocean
open https://cloud.digitalocean.com/apps

# 3. Create App > Selecciona tu repo
# Digital Ocean detectara app.yaml automaticamente

# 4. Configura variables de entorno
# 5. Deploy!
```

Ver [QUICK_START.md](QUICK_START.md) para detalles.

---

### Opcion 2: Lectura Completa

1. Lee [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) completamente
2. Usa [CHECKLIST.md](CHECKLIST.md) durante el despliegue
3. Consulta [MANUAL_SETUP.md](MANUAL_SETUP.md) si necesitas configurar manualmente

---

## Estructura de la Aplicacion

```
BSL-CONSULTAVIDEO/
├── Dockerfile                  # Build unificado (Backend + Frontend)
├── backend/                    # Node.js + Express API
│   ├── package.json           # Dependencies
│   └── src/                   # Source code
├── frontend/                   # React + Vite SPA
│   ├── package.json           # Dependencies
│   └── src/                   # Source code
└── .do/                       # Digital Ocean config (AQUI ESTAS)
    ├── app.yaml              # Configuracion principal (1 servicio)
    ├── QUICK_START.md        # Inicio rapido
    ├── DEPLOYMENT_GUIDE.md   # Guia completa
    ├── MANUAL_SETUP.md       # Setup manual
    └── CHECKLIST.md          # Checklist
```

**Nota**: El `Dockerfile` en la raiz construye ambos proyectos y los combina en un solo contenedor.

---

## Componentes Desplegados

**ARQUITECTURA OPTIMIZADA DE COSTOS**

Digital Ocean creara **UN SOLO COMPONENTE** que sirve tanto API como frontend:

### App Service (Backend + Frontend)
- **Tipo**: Web Service (Dockerfile)
- **Puerto**: 3000
- **Dockerfile**: `Dockerfile` (en la raiz del proyecto)
- **URL**: `https://<app-name>.ondigitalocean.app`
- **Health Check**: `/health`
- **Rutas**:
  - `/health` → Health check
  - `/api/*` → API REST del backend
  - `/*` → Frontend estatico (React SPA)

**Ventajas:**
- Solo 1 componente = Solo 1 costo ($5/mes)
- No requiere CORS (mismo dominio)
- Deployment simplificado
- Menor latencia (sin redirects)

---

## Variables de Entorno Requeridas

### Secrets (configurar en Digital Ocean)
```
TWILIO_ACCOUNT_SID=ACxxxxx...
TWILIO_AUTH_TOKEN=xxxxx...
TWILIO_API_KEY_SID=SKxxxxx...
TWILIO_API_KEY_SECRET=xxxxx...
JWT_SECRET=your-secret-here
```

### Publicas (ya configuradas en app.yaml)
```
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=${APP_URL}
```

**Nota**: Ya NO necesitas `VITE_API_BASE_URL` porque el frontend se sirve desde el mismo backend.

---

## Costos Estimados

- **Servicio unificado (Backend + Frontend)**: $5/mes (Basic XXS)
- **Total**: $5/mes

**Ahorro**: Antes eran 2 componentes. Ahora es 1 solo componente.

Puedes escalar cambiando `instance_size_slug` en `app.yaml`.

---

## Soporte y Recursos

- [Digital Ocean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [Digital Ocean Pricing](https://www.digitalocean.com/pricing/app-platform)
- [Twilio Video Docs](https://www.twilio.com/docs/video)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

---

## Que Hacer Ahora?

1. **Primera vez desplegando?** → Lee [QUICK_START.md](QUICK_START.md)
2. **Quieres entender todo?** → Lee [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
3. **Prefieres configurar manualmente?** → Lee [MANUAL_SETUP.md](MANUAL_SETUP.md)
4. **Durante el despliegue?** → Usa [CHECKLIST.md](CHECKLIST.md)

---

**Nota**: Todos los archivos estan optimizados para facilitar el despliegue. No necesitas modificarlos a menos que tengas requisitos especificos.
