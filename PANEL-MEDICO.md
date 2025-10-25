# Panel Médico - Documentación

## Descripción General

Panel médico completamente nuevo e independiente que replica la funcionalidad del código Wix (`MEDICO NEW.zzlc3.js`). Este panel permite a los médicos gestionar sus consultas y pacientes del día.

## Características

### Estadísticas del Día
- **Programados Hoy**: Número de pacientes con citas programadas para hoy
- **Atendidos Hoy**: Número de pacientes que ya fueron atendidos
- **Restantes Hoy**: Número de pacientes pendientes de atención

### Gestión de Pacientes
- Lista paginada de pacientes pendientes (10 por página)
- Búsqueda de pacientes por documento de identidad
- Información detallada de cada paciente:
  - Nombre completo
  - Documento de identidad
  - Celular
  - Empresa/Plan
  - Fecha de atención

### Acciones Disponibles
- **WhatsApp Simple**: Envía mensaje simple de recordatorio de cita
- **WhatsApp + Link**: Envía mensaje con link directo a la videollamada
- **No Contesta**: Marca al paciente como "No Contesta" y lo oculta de la lista
- **Colapsar/Expandir**: Minimiza la tarjeta del paciente para mejor visualización

## Acceso

**URL**: `http://localhost:5173/panel-medico` (desarrollo) o `/panel-medico` (producción)

### Login
1. Ingresa tu código de médico
2. Click en "Entrar"
3. El sistema carga automáticamente tus estadísticas y lista de pacientes

## Arquitectura Técnica

### Backend

#### Archivos Creados
- `backend/src/controllers/medical-panel.controller.ts` - Controlador de endpoints
- `backend/src/routes/medical-panel.routes.ts` - Definición de rutas
- `backend/src/services/medical-panel.service.ts` - Lógica de negocio

#### Endpoints API

**GET** `/api/medical-panel/stats/:medicoCode`
- Obtiene estadísticas del día para un médico
- Respuesta: `{ programadosHoy: number, atendidosHoy: number, restantesHoy: number }`

**GET** `/api/medical-panel/patients/pending/:medicoCode?page=0&pageSize=10`
- Obtiene lista paginada de pacientes pendientes
- Query params: `page`, `pageSize`
- Respuesta: `{ patients: Patient[], currentPage: number, totalPages: number, totalItems: number }`

**GET** `/api/medical-panel/patients/search/:documento?medicoCode=X`
- Busca un paciente por documento
- Respuesta: `Patient`

**GET** `/api/medical-panel/patients/details/:documento`
- Obtiene detalles completos de un paciente
- Respuesta: `PatientDetails`

**PATCH** `/api/medical-panel/patients/:patientId/no-answer`
- Marca un paciente como "No Contesta"
- Respuesta: `{ success: true, message: string }`

### Frontend

#### Archivos Creados
- `frontend/src/pages/MedicalPanelPage.tsx` - Página principal del panel
- `frontend/src/services/medical-panel.service.ts` - Cliente API

#### Flujo de Usuario

1. **Login**
   - Usuario ingresa código de médico
   - Sistema valida y carga datos

2. **Visualización**
   - Estadísticas en tarjetas en la parte superior
   - Lista de pacientes pendientes con paginación
   - Búsqueda por documento (opcional)

3. **Acciones sobre Paciente**
   - Click en botones de WhatsApp abre nueva ventana con mensaje
   - Click en "No Contesta" actualiza estado y oculta paciente
   - Click en flecha colapsa/expande tarjeta

4. **Actualizar Datos**
   - Click en botón "Actualizar" recarga estadísticas y pacientes

## Datos Simulados (Mock)

**IMPORTANTE**: Actualmente el sistema usa datos simulados. Para conectar a base de datos real:

1. Edita `backend/src/services/medical-panel.service.ts`
2. Reemplaza los comentarios `// TODO:` con queries reales
3. Conecta a tu base de datos (Wix Data, MongoDB, PostgreSQL, etc.)

### Ejemplo de Datos Mock

```typescript
{
  _id: '1',
  nombres: 'Juan Pérez',
  primerNombre: 'Juan',
  primerApellido: 'Pérez',
  numeroId: '1234567890',
  estado: 'Pendiente',
  foto: '',
  celular: '3001234567',
  fechaAtencion: new Date(),
  empresaListado: 'SANITHELP-JJ'
}
```

## Integración con Sistema Existente

El panel médico es **completamente independiente** y NO modifica ninguna funcionalidad existente:

- ✅ No modifica rutas de video existentes
- ✅ No modifica servicios de Twilio
- ✅ No modifica componentes de videollamada
- ✅ Usa su propio conjunto de endpoints (`/api/medical-panel/*`)
- ✅ Tiene su propia ruta (`/panel-medico`)

## Funcionalidad de WhatsApp

### Mensaje Simple
```
Hola [Nombre]. Te escribimos de BSL. Tienes una cita médica programada conmigo
```

### Mensaje con Link
```
Hola [Nombre]. Te escribimos de BSL. Tienes una cita médica programada conmigo

Conéctate al link:

https://tu-dominio.com/patient/consulta-xxx-yyy?nombre=Juan&apellido=Pérez
```

### Formato de Números
El sistema formatea automáticamente números telefónicos a formato internacional:
- `3001234567` → `+573001234567` (Colombia)
- `2441564651` → `+522441564651` (México)
- Soporta códigos de país: 1, 52, 54, 55, 34, 44, 49, 33

## Estilos y UI

El panel usa el mismo sistema de diseño que el resto de la aplicación:
- **Colores**: Tema oscuro consistente con BSL branding
- **Componentes**: TailwindCSS
- **Responsive**: Totalmente adaptable a móviles y tablets

## Testing

### Backend
```bash
cd backend
npm run dev
# Probar endpoints:
curl http://localhost:3000/api/medical-panel/stats/TEST123
```

### Frontend
```bash
cd frontend
npm run dev
# Abrir en navegador: http://localhost:5173/panel-medico
```

### Full Stack
```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev

# Navegar a: http://localhost:5173/panel-medico
```

## Deployment

El panel se despliega automáticamente con el resto de la aplicación:

```bash
# Build backend
cd backend && npm run build

# Build frontend
cd frontend && npm run build

# El backend sirve el frontend desde /panel-medico
```

## Próximos Pasos

### Para conectar a base de datos real:

1. **Instalar cliente de base de datos**
   ```bash
   cd backend
   npm install mongodb  # o tu DB preferida
   ```

2. **Configurar conexión**
   - Agregar credenciales en `.env`
   - Crear servicio de conexión

3. **Reemplazar mock data**
   - En `medical-panel.service.ts`, reemplazar los `// TODO:` con queries reales
   - Mantener las interfaces de tipos

4. **Migrar datos de Wix**
   - Exportar datos de tablas `HistoriaClinica` y `FORMULARIO`
   - Importar a nueva base de datos
   - Ajustar queries según estructura

## Soporte

Para soporte técnico, contacta via WhatsApp al +57 301 415 2706 (botón disponible en pantalla de login).

## Cambios vs Código Wix Original

| Característica | Wix | Panel Nuevo |
|---------------|-----|-------------|
| Plataforma | Wix Velo | React + Express |
| Base de Datos | Wix Data | Mock (configurable) |
| Paginación | Manual | Automática |
| WhatsApp | Web links | API links |
| Búsqueda | onChange event | Input controlado |
| Lightboxes | Wix lightbox | Pendiente (opcional) |
| Soporte | WhatsApp Web | WhatsApp API link |

## Notas Importantes

1. **Independencia Total**: Este panel NO afecta el sistema de videollamadas existente
2. **Datos Simulados**: Actualmente usa datos mock - configurar DB para producción
3. **Compatibilidad**: Diseñado para replicar funcionalidad Wix exactamente
4. **Extensibilidad**: Fácil agregar nuevas funcionalidades (estadísticas, reportes, etc.)
