/**
 * Genera un nombre único para la sala de video
 */
export const generateRoomName = (): string => {
  // Usar timestamp + random para mayor simplicidad
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 7);
  return `consulta-${timestamp}-${random}`;
};

/**
 * Genera el link completo para que el paciente se una a la sala
 */
export const generatePatientLink = (roomName: string): string => {
  const origin = window.location.origin;
  return `${origin}/patient/${roomName}`;
};

/**
 * Genera el link completo para que el paciente se una con datos pre-llenados
 * @param roomName - Nombre de la sala
 * @param nombre - Nombre del paciente
 * @param apellido - Apellido del paciente
 * @param doctor - Código del médico
 */
export const generatePatientLinkWithParams = (
  roomName: string,
  nombre: string,
  apellido: string,
  doctor: string
): string => {
  const origin = window.location.origin;
  const params = new URLSearchParams({
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    doctor: doctor.trim(),
  });
  return `${origin}/patient/${roomName}?${params.toString()}`;
};

/**
 * Copia texto al clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Error al copiar al clipboard:', error);
    return false;
  }
};
