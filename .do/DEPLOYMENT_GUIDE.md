# Guia de Despliegue en Digital Ocean App Platform

## Resumen

Este proyecto usa un archivo de configuracion `.do/app.yaml` que Digital Ocean detectara automaticamente. Este archivo configura:
- **Backend**: Servicio Node.js + Express + TypeScript en puerto 3000
- **Frontend**: Sitio estatico React + Vite servido por Nginx en puerto 80

---

## Pasos para Desplegar

### 1. Preparar el Repositorio Git

Asegurate de que todos los cambios esten commiteados y pusheados a GitHub/GitLab:

```bash
git add .
git commit -m "Add Digital Ocean deployment configuration"
git push origin main
```

### 2. Crear la App en Digital Ocean

1. Ve a [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
2. Click en **"Create App"**
3. Selecciona tu repositorio Git (conecta GitHub/GitLab si es necesario)
4. Selecciona la rama: **main**
5. Digital Ocean detectara automaticamente el archivo `.do/app.yaml`
6. Verifica que aparezcan dos componentes:
   - `backend` (Service)
   - `frontend` (Static Site)

### 3. Configurar Variables de Entorno

Digital Ocean pedira que configures las variables de entorno marcadas como SECRET. Ingresa tus credenciales de Twilio:

#### Variables del Backend (CRITICAS):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
JWT_SECRET=tu-secret-jwt-muy-seguro-aqui
```

**Donde obtener las credenciales de Twilio:**
- Ve a [Twilio Console](https://console.twilio.com/)
- **Account SID** y **Auth Token**: En el Dashboard principal
- **API Key SID** y **Secret**: En Account > API keys & tokens > Create API key

### 4. Configurar CORS (Importante!)

Despues del primer despliegue:

1. Copia la URL del frontend (ejemplo: `https://tu-app.ondigitalocean.app`)
2. Ve a **Settings > backend > Environment Variables**
3. Edita la variable `ALLOWED_ORIGINS`
4. Cambia el valor a: `https://tu-app.ondigitalocean.app`
5. Click **Save**

El backend se redesplegara automaticamente con la nueva configuracion de CORS.

### 5. Configurar la URL del Backend en el Frontend

Digital Ocean automaticamente inyecta la URL del backend en el frontend usando:
```
VITE_API_BASE_URL="${backend.PUBLIC_URL}"
```

Esto significa que el frontend siempre apuntara al backend correcto.

### 6. Desplegar

Click en **"Create Resources"** y espera a que Digital Ocean:
1. Clone tu repositorio
2. Construya ambas imagenes Docker
3. Despliegue los servicios
4. Asigne URLs publicas

El proceso toma aproximadamente 5-10 minutos.

---

## URLs Finales

Despues del despliegue, tendras:

- **Frontend**: `https://tu-app.ondigitalocean.app`
- **Backend**: `https://backend-tu-app.ondigitalocean.app`

---

## Verificacion

### 1. Verificar Backend

```bash
curl https://backend-tu-app.ondigitalocean.app/health
```

Deberia responder:
```json
{
  "status": "OK",
  "timestamp": "2025-10-21T...",
  "environment": "production"
}
```

### 2. Verificar Frontend

Abre el navegador en la URL del frontend y verifica:
- La pagina carga correctamente
- No hay errores de CORS en la consola del navegador
- Puedes crear/unirte a salas de video

---

## Configuracion de Archivos Clave

### `.do/app.yaml`

Este archivo ya esta creado y configurado con:
- Region: NYC (New York)
- Backend: Dockerfile deployment, puerto 3000
- Frontend: Static site con Nginx
- Health checks configurados
- Variables de entorno definidas

### Dockerfiles

Ambos servicios usan Dockerfiles multi-stage para builds optimizados:

**Backend** (`/workspaces/BSL-CONSULTAVIDEO/backend/Dockerfile`):
- Build con TypeScript
- Produccion con solo dependencias necesarias
- Expone puerto 3000

**Frontend** (`/workspaces/BSL-CONSULTAVIDEO/frontend/Dockerfile`):
- Build con Vite
- Servido con Nginx
- Configuracion de SPA (catchall route)

---

## Costos Estimados

Con la configuracion actual (Basic XXS instances):

- **Backend**: ~$5/mes
- **Frontend**: ~$0/mes (static sites son gratis hasta cierto limite)
- **Total**: ~$5/mes

Puedes escalar cambiando `instance_size_slug` en `.do/app.yaml`.

---

## Troubleshooting

### Error: "No components detected"

**Solucion**: Asegurate de que el archivo `.do/app.yaml` este en la raiz del repositorio y commiteado.

### Error de CORS

**Solucion**: Verifica que `ALLOWED_ORIGINS` en el backend incluya la URL exacta del frontend (con https://).

### Backend no inicia

**Solucion**: Verifica que todas las variables de entorno de Twilio esten configuradas correctamente.

### Frontend muestra error de red

**Solucion**: Verifica que `VITE_API_BASE_URL` apunte al backend correcto. Digital Ocean deberia configurar esto automaticamente.

---

## Comandos Utiles

### Ver logs del backend:
```bash
doctl apps logs <app-id> --component backend --follow
```

### Ver logs del frontend:
```bash
doctl apps logs <app-id> --component frontend --follow
```

### Redesplegar manualmente:
```bash
doctl apps create-deployment <app-id>
```

---

## Proximos Pasos

1. **Dominio personalizado**: Configura un dominio custom en Digital Ocean > Settings > Domains
2. **Monitoring**: Habilita alertas en Settings > Alerts
3. **Escalado**: Ajusta `instance_count` si necesitas mas capacidad
4. **Base de datos**: Agrega un Managed Database si necesitas persistencia

---

## Soporte

- [Digital Ocean App Platform Docs](https://docs.digitalocean.com/products/app-platform/)
- [Twilio Video Docs](https://www.twilio.com/docs/video)
- [Repositorio del Proyecto](https://github.com/tu-usuario/BSL-CONSULTAVIDEO)
