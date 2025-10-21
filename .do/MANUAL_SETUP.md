# Configuracion Manual en Digital Ocean (Sin app.yaml)

Si prefieres no usar el archivo `app.yaml` y configurar todo manualmente en la interfaz de Digital Ocean, sigue estos pasos:

## Opcion 1: Configurar Via UI

### Paso 1: Crear el Backend

1. Ve a [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
2. Click **"Create App"**
3. Selecciona tu repositorio Git
4. Click **"Edit Plan"** para configurar manualmente

**Configuracion del Backend:**
- **Name**: `backend`
- **Type**: Web Service
- **Source Directory**: `backend`
- **Build Command**: (dejar en blanco, usa Dockerfile)
- **Dockerfile Path**: `backend/Dockerfile`
- **HTTP Port**: `3000`
- **HTTP Request Routes**: `/`

**Environment Variables:**
```
NODE_ENV=production
PORT=3000
TWILIO_ACCOUNT_SID=[tu_valor] (marcarlo como Secret)
TWILIO_AUTH_TOKEN=[tu_valor] (marcarlo como Secret)
TWILIO_API_KEY_SID=[tu_valor] (marcarlo como Secret)
TWILIO_API_KEY_SECRET=[tu_valor] (marcarlo como Secret)
JWT_SECRET=[tu_valor] (marcarlo como Secret)
ALLOWED_ORIGINS=https://[tu-app].ondigitalocean.app
```

**Health Check:**
- **Path**: `/health`
- **Initial Delay**: 10 seconds
- **Period**: 10 seconds
- **Timeout**: 5 seconds

**Instance:**
- **Size**: Basic XXS ($5/month)
- **Count**: 1

### Paso 2: Crear el Frontend

Click **"Add Component"** > **"Static Site"**

**Configuracion del Frontend:**
- **Name**: `frontend`
- **Type**: Static Site
- **Source Directory**: `frontend`
- **Build Command**: `npm ci && npm run build`
- **Output Directory**: `dist`

**Environment Variables:**
```
VITE_API_BASE_URL=${backend.PUBLIC_URL}
```

**Routes:**
- **Catchall Document**: `index.html` (importante para SPA)

### Paso 3: Deploy

Click **"Create Resources"** y espera el despliegue.

---

## Opcion 2: Usar Solo Backend con Dockerfile

Si solo quieres desplegar el backend:

### Backend Stand-alone

1. Click **"Create App"**
2. Selecciona tu repositorio
3. **Source Directory**: `backend`
4. **Dockerfile Path**: `backend/Dockerfile`
5. Configura environment variables
6. Deploy

**URLs:**
- Backend: `https://tu-app.ondigitalocean.app`

---

## Opcion 3: Configurar con doctl CLI

Si prefieres usar la linea de comandos:

### Instalar doctl

```bash
# macOS
brew install doctl

# Linux
cd ~
wget https://github.com/digitalocean/doctl/releases/download/v1.98.1/doctl-1.98.1-linux-amd64.tar.gz
tar xf ~/doctl-1.98.1-linux-amd64.tar.gz
sudo mv ~/doctl /usr/local/bin
```

### Autenticar

```bash
doctl auth init
```

### Crear App

```bash
doctl apps create --spec .do/app.yaml
```

### Ver Apps

```bash
doctl apps list
```

### Ver Logs

```bash
doctl apps logs <app-id> --component backend --follow
```

---

## Comparacion de Opciones

| Opcion | Ventaja | Desventaja |
|--------|---------|------------|
| **app.yaml (Recomendado)** | Configuracion versionada, facil de mantener | Requiere commit |
| **UI Manual** | Visual, interactivo | Dificil de mantener, no versionado |
| **doctl CLI** | Automatizable, scriptable | Curva de aprendizaje |

---

## Troubleshooting

### Error: "Cannot find source directory"

**Solucion**: Asegurate de que `source_dir` apunte correctamente:
- Backend: `backend` (no `./backend` o `/backend`)
- Frontend: `frontend`

### Error: "Dockerfile not found"

**Solucion**: Verifica que `dockerfile_path` incluya el directorio:
- Correcto: `backend/Dockerfile`
- Incorrecto: `Dockerfile`

### Frontend no se comunica con Backend

**Solucion**: Verifica que `VITE_API_BASE_URL` use la sintaxis correcta:
```
${backend.PUBLIC_URL}
```

### CORS Error

**Solucion**: Actualiza `ALLOWED_ORIGINS` en el backend para incluir la URL completa del frontend:
```
ALLOWED_ORIGINS=https://tu-app.ondigitalocean.app
```

---

## Recomendacion Final

**Usa `app.yaml`** (ya creado en este proyecto). Es:
- Mas facil de mantener
- Versionable en Git
- Reproducible
- La forma recomendada por Digital Ocean

Solo configura manualmente si tienes requisitos especiales que no se pueden expresar en YAML.
