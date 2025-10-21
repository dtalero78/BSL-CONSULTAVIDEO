# 🎥 BSL Consulta Video

Aplicación de videollamadas profesionales construida con **Twilio Video**, **React** y **Node.js**.

## 📋 Características

- ✅ Videollamadas en tiempo real con múltiples participantes
- ✅ Controles de audio y video (mute/unmute)
- ✅ Interfaz moderna y responsiva
- ✅ Autenticación mediante tokens JWT
- ✅ Arquitectura escalable con Docker
- ✅ TypeScript en frontend y backend

## 🏗️ Arquitectura

```
BSL-CONSULTAVIDEO/
├── backend/              # API REST con Node.js + Express
├── frontend/             # Aplicación React con Vite
├── shared/               # Tipos TypeScript compartidos
├── infrastructure/       # Docker y configuración de deployment
└── docs/                # Documentación
```

## 🚀 Inicio Rápido

### Prerequisitos

- Node.js 20+
- npm o yarn
- Docker (opcional)
- Cuenta de Twilio con API Key

### Instalación

1. **Clonar el repositorio**

```bash
git clone https://github.com/tu-usuario/BSL-CONSULTAVIDEO.git
cd BSL-CONSULTAVIDEO
```

2. **Configurar variables de entorno**

Backend:
```bash
cd backend
cp .env.example .env
# Editar .env con tus credenciales de Twilio
```

Frontend:
```bash
cd frontend
cp .env.example .env
# Configurar VITE_API_BASE_URL si es necesario
```

3. **Instalar dependencias y ejecutar**

**Opción A: Desarrollo local**

Backend:
```bash
cd backend
npm install
npm run dev
# Servidor corriendo en http://localhost:3000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
# Aplicación corriendo en http://localhost:5173
```

**Opción B: Docker**

```bash
# En la raíz del proyecto
docker-compose up --build
# Aplicación completa (Backend + Frontend): http://localhost:3000
```

## 🔑 Configuración de Twilio

1. Crear cuenta en [Twilio](https://www.twilio.com/)
2. Obtener credenciales:
   - Account SID
   - Auth Token
3. Crear API Key para Twilio Video:
   - En el dashboard de Twilio: Tools > API Keys > Create API Key
   - Guardar el SID y Secret

4. Configurar en [backend/.env](backend/.env):
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_KEY_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 📡 API Endpoints

### Video

- `POST /api/video/token` - Generar token de acceso
- `POST /api/video/rooms` - Crear sala
- `GET /api/video/rooms/:roomName` - Obtener info de sala
- `POST /api/video/rooms/:roomName/end` - Finalizar sala
- `GET /api/video/rooms/:roomName/participants` - Listar participantes

## 🔗 Integración con Wix

Esta aplicación se puede integrar con tu panel de Wix para enviar automáticamente links de videollamada por WhatsApp.

**Características:**
- Generación automática de salas de consulta
- Link con datos del paciente pre-llenados
- Envío directo por WhatsApp desde Wix
- Experiencia fluida para el paciente (un solo clic para unirse)

**Documentación:**
- Ver [WIX_INTEGRATION.md](WIX_INTEGRATION.md) para instrucciones completas
- Código plug-and-play disponible en [wix-integration-snippet.js](wix-integration-snippet.js)

**Flujo:**
1. Médico hace clic en botón de WhatsApp en Wix
2. Se genera automáticamente un link de videollamada único
3. Link se envía al paciente por WhatsApp
4. Paciente abre link y se une con un solo clic

## 🧪 Testing

Backend:
```bash
cd backend
npm test
```

Frontend:
```bash
cd frontend
npm test
```

## 📦 Build para Producción

Backend:
```bash
cd backend
npm run build
npm start
```

Frontend:
```bash
cd frontend
npm run build
# Los archivos estáticos estarán en dist/
```

## 🐳 Docker

Construir y ejecutar con Docker Compose:

```bash
docker-compose up --build
```

Detener servicios:
```bash
docker-compose down
```

## ☁️ Despliegue en Digital Ocean

Esta aplicacion esta configurada para desplegarse facilmente en Digital Ocean App Platform con **arquitectura optimizada de costos**.

**Arquitectura simplificada:**
- Un solo componente (Backend) que sirve tanto API como frontend estatico
- Ahorro de costos: Solo pagas por 1 servicio en lugar de 2
- No se requiere CORS entre frontend/backend (misma URL)

**Pasos rapidos:**
1. Push tu codigo a GitHub/GitLab
2. Ve a [Digital Ocean App Platform](https://cloud.digitalocean.com/apps)
3. Click "Create App" y selecciona tu repositorio
4. Digital Ocean detectara automaticamente la configuracion en `.do/app.yaml`
5. Configura las variables de entorno de Twilio
6. Deploy!

**Como funciona:**
- El `Dockerfile` construye ambos proyectos (backend + frontend)
- El backend Express sirve:
  - `/health` → Health check
  - `/api/*` → API REST
  - `/*` → Frontend estatico (React SPA)
- Digital Ocean solo necesita levantar 1 contenedor

**Documentacion completa:**
- Ver [.do/DEPLOYMENT_GUIDE.md](.do/DEPLOYMENT_GUIDE.md) para instrucciones detalladas
- Configuracion ya lista en `.do/app.yaml`
- Health checks y CORS pre-configurados

**Costos:** $5/mes (1 servicio Basic XXS)

## 📚 Documentación Adicional

- [Arquitectura del Sistema](docs/architecture/README.md)
- [API Documentation](docs/api/README.md)
- [Guía de Usuario](docs/user-guide/README.md)

## 🤖 Subagentes Claude Recomendados

Para el desarrollo y mantenimiento de este proyecto, se recomienda usar los siguientes subagentes especializados:

1. **Architecture Agent** - Diseño y decisiones de arquitectura
2. **Backend Developer Agent** - Desarrollo de API y servicios
3. **Frontend Developer Agent** - Componentes React y UI/UX
4. **Real-Time Communications Agent** - Especialista en Twilio Video
5. **Security Agent** - Seguridad y autenticación
6. **Testing Agent** - Tests y QA
7. **DevOps Agent** - CI/CD y deployment
8. **Documentation Agent** - Documentación técnica
9. **Database Agent** - Gestión de datos
10. **Monitoring Agent** - Observabilidad y logs

Ver [agentes.txt](agentes.txt) para más detalles sobre cada subagente.

## 🛠️ Stack Tecnológico

**Backend:**
- Node.js 20
- Express 4
- TypeScript
- Twilio Video SDK
- JWT

**Frontend:**
- React 18
- TypeScript
- Vite
- TailwindCSS
- Twilio Video SDK

**DevOps:**
- Docker
- Docker Compose
- GitHub Actions (CI/CD)

## 📄 Licencia

MIT

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📞 Soporte

Para preguntas o problemas, abre un issue en GitHub.

---

**Desarrollado con ❤️ usando Twilio Video**
