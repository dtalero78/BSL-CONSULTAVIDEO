# Integracion de BSL-CONSULTAVIDEO con Wix

Este documento explica como integrar tu aplicacion de videollamadas con tu panel de Wix para enviar links automaticos por WhatsApp.

## Flujo de Integracion

Cuando haces clic en el boton `#whp` en Wix:
1. Se genera automaticamente un nombre de sala unico
2. Se construye un link de videollamada con los datos del paciente pre-llenados
3. Se envia por WhatsApp usando el patron actual de Wix

## Codigo JavaScript para Wix

Reemplaza el codigo actual del boton `#whp` con este:

```javascript
// ==================================================
// CONFIGURACION - Cambia esto segun tu dominio
// ==================================================
const VIDEO_APP_DOMAIN = 'https://tu-dominio.com'; // ← IMPORTANTE: Cambia por tu dominio real
// Ejemplos:
// const VIDEO_APP_DOMAIN = 'https://bsl-consultavideo.com';
// const VIDEO_APP_DOMAIN = 'https://localhost:5173'; // Para pruebas locales

// ==================================================
// FUNCIONES AUXILIARES
// ==================================================

/**
 * Genera un nombre unico para la sala de video
 * Mismo algoritmo que usa el frontend de React
 */
function generarNombreSala() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `consulta-${timestamp}-${random}`;
}

/**
 * Construye el link de videollamada con datos pre-llenados
 */
function construirLinkVideollamada(roomName, nombre, apellido, codMedico) {
  const params = new URLSearchParams({
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    doctor: codMedico.trim()
  });

  return `${VIDEO_APP_DOMAIN}/patient/${roomName}?${params.toString()}`;
}

// ==================================================
// EVENTO DEL BOTON WHATSAPP
// ==================================================

$item('#whp').onClick((event) => {
  // Obtener datos del paciente desde Wix
  const itemData = event.context.itemData; // Datos del repeater/dataset
  const codEmpresa = $w('#codEmpresa').value; // Codigo del medico

  // Extraer telefono del paciente
  const telefono = itemData.celular.replace(/\s+/g, '');
  let telefonoConPrefijo;

  if (telefono.startsWith('+57')) {
    telefonoConPrefijo = telefono;
  } else if (telefono.startsWith('57')) {
    telefonoConPrefijo = '+' + telefono;
  } else {
    telefonoConPrefijo = '+57' + telefono;
  }

  // Generar sala unica y link de videollamada
  const roomName = generarNombreSala();
  const linkVideollamada = construirLinkVideollamada(
    roomName,
    itemData.nombre,
    itemData.primerApellido,
    codEmpresa
  );

  // Construir mensaje de WhatsApp
  const mensaje = `Hola ${itemData.nombre}. Te escribimos de BSL.

Para tu consulta medica, haz clic en el siguiente link:

${linkVideollamada}

El link te conectara automaticamente con el Dr. ${codEmpresa}.

Asegurate de permitir el acceso a tu camara y microfono cuando el navegador te lo pida.

¡Que tengas una excelente consulta!`;

  // Construir enlace de WhatsApp
  const enlaceWhatsApp = `https://api.whatsapp.com/send?phone=${telefonoConPrefijo}&text=${encodeURIComponent(mensaje)}`;

  // Configurar el link del boton
  $item('#whp').link = enlaceWhatsApp;
  $item('#whp').target = "_blank";
});
```

## Pasos de Instalacion

### 1. Configurar el Dominio

En la linea 4 del codigo, reemplaza `'https://tu-dominio.com'` con tu dominio real donde esta alojada la aplicacion BSL-CONSULTAVIDEO.

**Ejemplos:**
- Produccion: `https://bsl-consultavideo.com`
- Staging: `https://staging.bsl-consultavideo.com`
- Desarrollo local: `http://localhost:5173`

### 2. Pegar el Codigo en Wix

1. Ve a tu panel de Wix
2. Selecciona la pagina donde esta el boton `#whp`
3. Abre el Editor de Codigo (Wix Code)
4. Busca el codigo actual del boton `#whp`
5. Reemplazalo completamente con el codigo de arriba

### 3. Verificar Campos Necesarios

Asegurate de que tu pagina de Wix tenga:
- `$w('#codEmpresa')` - Campo con el codigo del medico
- `itemData.celular` - Numero de celular del paciente
- `itemData.nombre` - Nombre del paciente
- `itemData.primerApellido` - Apellido del paciente

### 4. Probar la Integracion

1. Haz clic en el boton `#whp` en modo preview
2. Verifica que se abra WhatsApp
3. Verifica que el mensaje contenga el link de videollamada
4. Copia el link y pegualo en el navegador
5. Deberias ver:
   - El nombre del paciente pre-llenado
   - Un banner "Conectandose con Dr. [codigo]"
   - Solo necesitas hacer clic en "Unirse a la Consulta"

## Que Hace el Codigo

### Generacion del Nombre de Sala
```javascript
const roomName = generarNombreSala();
// Genera: "consulta-lf5x8j2k-4a7b9"
```

### Construccion del Link
```javascript
const link = construirLinkVideollamada(
  'consulta-lf5x8j2k-4a7b9',
  'Maria',
  'Gonzalez',
  'DR001'
);
// Resultado:
// https://bsl-consultavideo.com/patient/consulta-lf5x8j2k-4a7b9?nombre=Maria&apellido=Gonzalez&doctor=DR001
```

### Experiencia del Paciente

Cuando el paciente abre el link:
1. Ve su nombre ya ingresado: "Maria Gonzalez"
2. Ve un banner verde: "Conectandose con Dr. DR001"
3. Solo presiona "Unirse a la Consulta"
4. Se conecta automaticamente a la videollamada

## Personalizacion del Mensaje

Puedes personalizar el mensaje de WhatsApp editando esta parte:

```javascript
const mensaje = `Hola ${itemData.nombre}. Te escribimos de BSL.

Para tu consulta medica, haz clic en el siguiente link:

${linkVideollamada}

El link te conectara automaticamente con el Dr. ${codEmpresa}.

Asegurate de permitir el acceso a tu camara y microfono cuando el navegador te lo pida.

¡Que tengas una excelente consulta!`;
```

## Solucion de Problemas

### El link no funciona
- Verifica que `VIDEO_APP_DOMAIN` tenga el dominio correcto
- Asegurate de que la aplicacion este desplegada y accesible

### El nombre no se auto-llena
- Verifica que los parametros `nombre` y `apellido` esten en la URL
- Abre la consola del navegador y busca errores

### El banner del medico no aparece
- Verifica que el parametro `doctor` este en la URL
- Asegurate de que `codEmpresa` tenga un valor

### El telefono no tiene el formato correcto
- Verifica que `itemData.celular` tenga el numero completo
- El codigo ya maneja prefijos +57 y 57

## Flujo Tecnico Completo

```
[Wix Panel]
    |
    v
Click en #whp
    |
    v
Generar roomName: "consulta-abc123"
    |
    v
Construir link:
https://app.com/patient/consulta-abc123?nombre=Maria&apellido=Gonzalez&doctor=DR001
    |
    v
Enviar por WhatsApp
    |
    v
[Paciente abre link]
    |
    v
[Frontend React - PatientPage]
    |
    v
Lee query params (nombre, apellido, doctor)
    |
    v
Auto-llena el formulario
    |
    v
Muestra banner "Conectandose con Dr. DR001"
    |
    v
Paciente hace clic en "Unirse"
    |
    v
[Frontend solicita token al Backend]
    |
    v
[Backend genera token de Twilio]
    |
    v
[Frontend conecta a Twilio Video]
    |
    v
¡Videollamada iniciada!
```

## Ventajas de esta Integracion

1. **Simple**: No necesita llamadas API adicionales
2. **Rapido**: El link se genera instantaneamente
3. **Experiencia fluida**: El paciente solo abre el link y hace clic
4. **Sin autenticacion compleja**: No necesita credenciales de Wix
5. **Escalable**: Facil de mantener y extender

## Proximos Pasos Opcionales

Si en el futuro necesitas mas funcionalidades:

### 1. Validacion de Links en el Backend
Crear endpoint para verificar que la sala y el medico existen:
```javascript
// En Wix, antes de enviar WhatsApp:
const response = await fetch(`${VIDEO_APP_DOMAIN}/api/video/verify-link`, {
  method: 'POST',
  body: JSON.stringify({ roomName, doctor: codEmpresa })
});
```

### 2. Auto-unirse sin Confirmacion
En PatientPage.tsx, agregar auto-join si todos los params estan:
```typescript
useEffect(() => {
  if (nombreParam && apellidoParam && doctorParam && patientName) {
    // Auto-unirse despues de 2 segundos
    setTimeout(() => setIsInCall(true), 2000);
  }
}, [nombreParam, apellidoParam, doctorParam, patientName]);
```

### 3. Notificaciones al Medico
Enviar notificacion push al medico cuando el paciente abre el link.

### 4. Historial de Consultas
Guardar en base de datos cada link generado con timestamp.

---

**Desarrollado con ❤️ para BSL**
