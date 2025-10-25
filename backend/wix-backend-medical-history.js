/**
 * INSTRUCCIONES DE INSTALACIÓN EN WIX:
 *
 * 1. Ve a tu sitio de Wix
 * 2. Abre el panel de Velo (Developer Mode)
 * 3. En la carpeta "Backend", crea un nuevo archivo llamado "http-functions.js"
 *    (o edita el existente si ya tienes uno)
 * 4. Copia las funciones de este archivo al archivo http-functions.js de Wix
 * 5. Asegúrate de que el archivo esté en modo "Backend" (no "Public")
 * 6. Las funciones estarán disponibles en: https://www.bsl.com.co/_functions/NOMBRE_FUNCION
 */

import wixData from 'wix-data';

/**
 * Obtiene la historia clínica de un paciente por documento
 * GET https://www.bsl.com.co/_functions/getHistoriaClinica?documento=123456789
 */
export function get_getHistoriaClinica(request) {
    const documento = request.query.documento;

    if (!documento) {
        return {
            status: 400,
            body: {
                success: false,
                error: 'Parámetro "documento" es requerido'
            }
        };
    }

    return wixData.query("HistoriaClinica")
        .eq("numeroId", documento)
        .find()
        .then((results) => {
            if (results.items.length === 0) {
                return {
                    status: 404,
                    body: {
                        success: false,
                        error: 'No se encontró historia clínica para este documento'
                    }
                };
            }

            const item = results.items[0];

            return {
                status: 200,
                body: {
                    success: true,
                    data: {
                        // Datos del paciente
                        numeroId: item.numeroId,
                        primerNombre: item.primerNombre,
                        segundoNombre: item.segundoNombre || '',
                        primerApellido: item.primerApellido,
                        segundoApellido: item.segundoApellido || '',
                        celular: item.celular,
                        email: item.email || '',
                        fechaNacimiento: item.fechaNacimiento || null,
                        edad: item.edad || null,
                        genero: item.genero || '',
                        estadoCivil: item.estadoCivil || '',
                        hijos: item.hijos || '',
                        ejercicio: item.ejercicio || '',

                        // Datos de la empresa
                        codEmpresa: item.codEmpresa || '',
                        cargo: item.cargo || '',
                        tipoExamen: item.tipoExamen || '',

                        // Antecedentes
                        encuestaSalud: item.encuestaSalud ? item.encuestaSalud.toString() : '',
                        antecedentesFamiliares: item.antecedentesFamiliares ? item.antecedentesFamiliares.toString() : '',
                        empresa1: item.empresa1 || '',

                        // Campos médicos
                        mdAntecedentes: item.mdAntecedentes || '',
                        mdObsParaMiDocYa: item.mdObsParaMiDocYa || '',
                        mdObservacionesCertificado: item.mdObservacionesCertificado || '',
                        mdRecomendacionesMedicasAdicionales: item.mdRecomendacionesMedicasAdicionales || '',
                        mdConceptoFinal: item.mdConceptoFinal || '',
                        mdDx1: item.mdDx1 || '',
                        mdDx2: item.mdDx2 || '',
                        talla: item.talla || '',
                        peso: item.peso || '',

                        // Fechas
                        fechaAtencion: item.fechaAtencion || null,
                        fechaConsulta: item.fechaConsulta || null,
                        atendido: item.atendido || ''
                    }
                }
            };
        })
        .catch((error) => {
            console.error('Error obteniendo historia clínica:', error);
            return {
                status: 500,
                body: {
                    success: false,
                    error: 'Error al obtener la historia clínica'
                }
            };
        });
}

/**
 * Actualiza la historia clínica de un paciente
 * POST https://www.bsl.com.co/_functions/updateHistoriaClinica
 * Body: {
 *   numeroId: string,
 *   mdAntecedentes: string,
 *   mdObsParaMiDocYa: string,
 *   mdObservacionesCertificado: string,
 *   mdRecomendacionesMedicasAdicionales: string,
 *   mdConceptoFinal: string,
 *   mdDx1: string,
 *   mdDx2: string,
 *   talla: string,
 *   peso: string,
 *   cargo: string,
 *   fechaConsulta: ISO string,
 *   atendido: string
 * }
 */
export function post_updateHistoriaClinica(request) {
    return request.body.json()
        .then((body) => {
            const numeroId = body.numeroId;

            if (!numeroId) {
                return {
                    status: 400,
                    body: {
                        success: false,
                        error: 'Parámetro "numeroId" es requerido'
                    }
                };
            }

            // Buscar el registro existente
            return wixData.query("HistoriaClinica")
                .eq("numeroId", numeroId)
                .find()
                .then((results) => {
                    if (results.items.length === 0) {
                        return {
                            status: 404,
                            body: {
                                success: false,
                                error: 'No se encontró historia clínica para este documento'
                            }
                        };
                    }

                    const item = results.items[0];

                    // Actualizar solo los campos proporcionados
                    if (body.mdAntecedentes !== undefined) item.mdAntecedentes = body.mdAntecedentes;
                    if (body.mdObsParaMiDocYa !== undefined) item.mdObsParaMiDocYa = body.mdObsParaMiDocYa;
                    if (body.mdObservacionesCertificado !== undefined) item.mdObservacionesCertificado = body.mdObservacionesCertificado;
                    if (body.mdRecomendacionesMedicasAdicionales !== undefined) item.mdRecomendacionesMedicasAdicionales = body.mdRecomendacionesMedicasAdicionales;
                    if (body.mdConceptoFinal !== undefined) item.mdConceptoFinal = body.mdConceptoFinal;
                    if (body.mdDx1 !== undefined) item.mdDx1 = body.mdDx1;
                    if (body.mdDx2 !== undefined) item.mdDx2 = body.mdDx2;
                    if (body.talla !== undefined) item.talla = body.talla;
                    if (body.peso !== undefined) item.peso = body.peso;
                    if (body.cargo !== undefined) item.cargo = body.cargo;
                    if (body.fechaConsulta !== undefined) item.fechaConsulta = new Date(body.fechaConsulta);
                    if (body.atendido !== undefined) item.atendido = body.atendido;

                    // Guardar en Wix Data
                    return wixData.update("HistoriaClinica", item)
                        .then((updatedItem) => {
                            return {
                                status: 200,
                                body: {
                                    success: true,
                                    message: 'Historia clínica actualizada exitosamente',
                                    data: {
                                        numeroId: updatedItem.numeroId,
                                        fechaConsulta: updatedItem.fechaConsulta,
                                        atendido: updatedItem.atendido
                                    }
                                }
                            };
                        });
                });
        })
        .catch((error) => {
            console.error('Error actualizando historia clínica:', error);
            return {
                status: 500,
                body: {
                    success: false,
                    error: 'Error al actualizar la historia clínica'
                }
            };
        });
}
