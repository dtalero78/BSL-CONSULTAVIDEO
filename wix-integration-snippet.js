// ==================================================
// CODIGO PARA INTEGRACION WIX - BSL CONSULTAVIDEO
// ==================================================
// Instrucciones:
// 1. Cambia VIDEO_APP_DOMAIN por tu dominio real
// 2. Copia este codigo completo en tu pagina de Wix
// 3. Asegurate de que el boton se llame #whp
// ==================================================

const VIDEO_APP_DOMAIN = 'https://tu-dominio.com'; // ← CAMBIAR AQUI

// Genera nombre unico de sala (mismo algoritmo que React)
function generarNombreSala() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `consulta-${timestamp}-${random}`;
}

// Construye link de videollamada con parametros
function construirLinkVideollamada(roomName, nombre, apellido, codMedico) {
  const params = new URLSearchParams({
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    doctor: codMedico.trim()
  });
  return `${VIDEO_APP_DOMAIN}/patient/${roomName}?${params.toString()}`;
}

// Evento del boton WhatsApp
$item('#whp').onClick((event) => {
  const itemData = event.context.itemData;
  const codEmpresa = $w('#codEmpresa').value;

  // Formatear telefono
  const telefono = itemData.celular.replace(/\s+/g, '');
  let telefonoConPrefijo;
  if (telefono.startsWith('+57')) {
    telefonoConPrefijo = telefono;
  } else if (telefono.startsWith('57')) {
    telefonoConPrefijo = '+' + telefono;
  } else {
    telefonoConPrefijo = '+57' + telefono;
  }

  // Generar sala y link
  const roomName = generarNombreSala();
  const linkVideollamada = construirLinkVideollamada(
    roomName,
    itemData.nombre,
    itemData.primerApellido,
    codEmpresa
  );

  // Mensaje de WhatsApp
  const mensaje = `Hola ${itemData.nombre}. Te escribimos de BSL.

Para tu consulta medica, haz clic en el siguiente link:

${linkVideollamada}

El link te conectara automaticamente con el Dr. ${codEmpresa}.

Asegurate de permitir el acceso a tu camara y microfono cuando el navegador te lo pida.

¡Que tengas una excelente consulta!`;

  // Configurar link de WhatsApp
  const enlaceWhatsApp = `https://api.whatsapp.com/send?phone=${telefonoConPrefijo}&text=${encodeURIComponent(mensaje)}`;
  $item('#whp').link = enlaceWhatsApp;
  $item('#whp').target = "_blank";
});
