/**
 * ════════════════════════════════════════════════════════════════════════════
 * INTEGRACIÓN PANEL MÉDICO - BACKEND MODULE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * INSTRUCCIONES:
 * 1. En Wix Editor, crea un archivo en: Backend → integracionPanelMedico.jsw
 * 2. Copia TODO este contenido al archivo
 * 3. Guarda
 * 4. Este archivo contiene toda la lógica del panel médico
 * 5. Los endpoints HTTP (en http-functions.js) llamarán a estas funciones
 */

import wixData from 'wix-data';

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 0A. OBTENER HISTORIA CLÍNICA COMPLETA POR _ID (PARA VIDEOLLAMADA)
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function obtenerHistoriaClinica(historiaId) {
    if (!historiaId) {
        return { success: false, error: "historiaId es requerido" };
    }

    try {
        // 1. Buscar en HistoriaClinica por _id
        const historia = await wixData.get("HistoriaClinica", historiaId);

        if (!historia) {
            return { success: false, error: "No se encontró historia clínica con ese ID" };
        }

        // 2. Buscar en FORMULARIO usando el _id de HistoriaClinica en el campo idGeneral
        const formularioResults = await wixData.query("FORMULARIO")
            .eq("idGeneral", historia._id)
            .find();

        const formulario = formularioResults.items.length > 0
            ? formularioResults.items[0]
            : null;

        // 3. Retornar datos combinados
        return {
            success: true,
            data: {
                // Datos de identificación
                _id: historia._id,
                historiaId: historia._id,
                numeroId: historia.numeroId,
                primerNombre: historia.primerNombre,
                segundoNombre: historia.segundoNombre || "",
                primerApellido: historia.primerApellido,
                segundoApellido: historia.segundoApellido || "",
                celular: historia.celular,
                email: formulario?.email || "",

                // Datos demográficos
                fechaNacimiento: formulario?.fechaNacimiento || null,
                edad: formulario?.edad || null,
                genero: formulario?.genero || "",
                estadoCivil: formulario?.estadoCivil || "",
                hijos: formulario?.hijos || "",
                ejercicio: formulario?.ejercicio || "",

                // Datos de empresa
                codEmpresa: historia.codEmpresa || "",
                cargo: historia.cargo || "",
                tipoExamen: historia.tipoExamen || "",

                // Antecedentes (solo lectura)
                encuestaSalud: formulario?.encuestaSalud || "",
                antecedentesFamiliares: formulario?.antecedentesFamiliares || "",
                empresa1: formulario?.empresa1 || "",

                // Campos médicos (editables)
                mdAntecedentes: historia.mdAntecedentes || "",
                mdObsParaMiDocYa: historia.mdObsParaMiDocYa || "",
                mdObservacionesCertificado: historia.mdObservacionesCertificado || "",
                mdRecomendacionesMedicasAdicionales: historia.mdRecomendacionesMedicasAdicionales || "",
                mdConceptoFinal: historia.mdConceptoFinal || "",
                mdDx1: historia.mdDx1 || "",
                mdDx2: historia.mdDx2 || "",
                talla: historia.talla || "",
                peso: historia.peso || "",

                // Fechas y estado
                fechaAtencion: historia.fechaAtencion,
                fechaConsulta: historia.fechaConsulta,
                atendido: historia.atendido || ""
            }
        };
    } catch (error) {
        console.error("Error en obtenerHistoriaClinica:", error);
        return { success: false, error: error.message };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 0B. ACTUALIZAR HISTORIA CLÍNICA (DURANTE VIDEOLLAMADA)
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function actualizarHistoriaClinica(historiaId, datos) {
    if (!historiaId) {
        return { success: false, error: "historiaId es requerido" };
    }

    try {
        // Obtener el registro por _id
        const item = await wixData.get("HistoriaClinica", historiaId);

        if (!item) {
            return { success: false, error: "No se encontró historia clínica con ese ID" };
        }

        // Actualizar campos del formulario médico
        if (datos.talla !== undefined) item.talla = datos.talla;
        if (datos.peso !== undefined) item.peso = datos.peso;
        if (datos.mdAntecedentes !== undefined) item.mdAntecedentes = datos.mdAntecedentes;
        if (datos.mdObsParaMiDocYa !== undefined) item.mdObsParaMiDocYa = datos.mdObsParaMiDocYa;
        if (datos.mdObservacionesCertificado !== undefined) item.mdObservacionesCertificado = datos.mdObservacionesCertificado;
        if (datos.mdRecomendacionesMedicasAdicionales !== undefined) item.mdRecomendacionesMedicasAdicionales = datos.mdRecomendacionesMedicasAdicionales;
        if (datos.mdConceptoFinal !== undefined) item.mdConceptoFinal = datos.mdConceptoFinal;
        if (datos.mdDx1 !== undefined) item.mdDx1 = datos.mdDx1;
        if (datos.mdDx2 !== undefined) item.mdDx2 = datos.mdDx2;
        if (datos.cargo !== undefined) item.cargo = datos.cargo;

        // Marcar como atendido y guardar fecha de consulta
        item.fechaConsulta = new Date();
        item.atendido = "ATENDIDO";

        const updatedItem = await wixData.update("HistoriaClinica", item);

        return {
            success: true,
            data: {
                _id: updatedItem._id,
                numeroId: updatedItem.numeroId,
                fechaConsulta: updatedItem.fechaConsulta
            }
        };
    } catch (error) {
        console.error("Error actualizando historia clínica:", error);
        return { success: false, error: error.message };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 1. OBTENER ESTADÍSTICAS DEL DÍA PARA UN MÉDICO
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function obtenerEstadisticasMedico(medicoCode) {
    if (!medicoCode) {
        throw new Error("medicoCode es requerido");
    }

    // Usar zona horaria de Colombia (UTC-5)
    // Colombia está 5 horas detrás de UTC
    // Entonces 00:00 Colombia = 05:00 UTC del mismo día
    // Y 23:59 Colombia = 04:59 UTC del día siguiente
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    // Si son menos de las 05:00 UTC, aún es el día anterior en Colombia
    const colombiaDay = now.getUTCHours() < 5 ? day - 1 : day;

    const startOfDay = new Date(Date.UTC(year, month, colombiaDay, 5, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, colombiaDay + 1, 4, 59, 59, 999));

    try {
        // Ejecutar queries en paralelo para mejor rendimiento
        const [programadosHoy, atendidosHoy, restantesHoy] = await Promise.all([
            // Programados hoy
            wixData.query("HistoriaClinica")
                .eq("medico", medicoCode)
                .between("fechaAtencion", startOfDay, endOfDay)
                .count(),

            // Atendidos hoy
            wixData.query("HistoriaClinica")
                .eq("medico", medicoCode)
                .between("fechaConsulta", startOfDay, endOfDay)
                .count(),

            // Restantes hoy (programados pero sin atender)
            wixData.query("HistoriaClinica")
                .eq("medico", medicoCode)
                .between("fechaAtencion", startOfDay, endOfDay)
                .isEmpty("fechaConsulta")
                .count()
        ]);

        return {
            success: true,
            data: {
                programadosHoy,
                atendidosHoy,
                restantesHoy
            }
        };
    } catch (error) {
        console.error("Error en obtenerEstadisticasMedico:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 2. OBTENER PACIENTES PENDIENTES DEL DÍA (PAGINADO)
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function obtenerPacientesPendientes(medicoCode, page = 0, pageSize = 10) {
    if (!medicoCode) {
        throw new Error("medicoCode es requerido");
    }

    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);

    // Usar zona horaria de Colombia (UTC-5)
    // Colombia está 5 horas detrás de UTC
    // Entonces 00:00 Colombia = 05:00 UTC del mismo día
    // Y 23:59 Colombia = 04:59 UTC del día siguiente
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();

    // Si son menos de las 05:00 UTC, aún es el día anterior en Colombia
    const colombiaDay = now.getUTCHours() < 5 ? day - 1 : day;

    const startOfDay = new Date(Date.UTC(year, month, colombiaDay, 5, 0, 0, 0));
    const endOfDay = new Date(Date.UTC(year, month, colombiaDay + 1, 4, 59, 59, 999));

    try {
        // Query para obtener pacientes pendientes del día
        const historiaResults = await wixData.query("HistoriaClinica")
            .eq("medico", medicoCode)
            .isEmpty("fechaConsulta")
            .between("fechaAtencion", startOfDay, endOfDay)
            .ne("numeroId", "TEST")
            .ne("numeroId", "test")
            .ascending("fechaAtencion")
            .skip(pageNum * pageSizeNum)
            .limit(pageSizeNum)
            .find();

        const historiaItems = historiaResults.items;
        const totalItems = historiaResults.totalCount;
        const totalPages = Math.ceil(totalItems / pageSizeNum);

        if (historiaItems.length === 0) {
            return {
                success: true,
                data: {
                    patients: [],
                    currentPage: pageNum,
                    totalPages: 0,
                    totalItems: 0
                }
            };
        }

        // Obtener IDs de pacientes para buscar fotos
        const numerosId = historiaItems.map(item => item.numeroId).filter(Boolean);

        // Buscar fotos en tabla FORMULARIO
        const formularioResults = await wixData.query("FORMULARIO")
            .hasSome("documentoIdentidad", numerosId)
            .limit(1000)
            .find();

        // Crear mapa de fotos por documento
        const formularioMap = {};
        formularioResults.items.forEach(item => {
            formularioMap[item.documentoIdentidad] = item;
        });

        // Combinar datos de HistoriaClinica + FORMULARIO
        const patients = historiaItems.map(item => ({
            _id: item._id,
            nombres: `${item.primerNombre} ${item.primerApellido}`,
            primerNombre: item.primerNombre,
            segundoNombre: item.segundoNombre || "",
            primerApellido: item.primerApellido,
            segundoApellido: item.segundoApellido || "",
            numeroId: item.numeroId,
            estado: item.atendido || "Pendiente",
            pvEstado: item.pvEstado || "",
            foto: formularioMap[item.numeroId]?.foto || "",
            celular: item.celular,
            fechaAtencion: item.fechaAtencion,
            fechaConsulta: item.fechaConsulta,
            empresaListado: item.codEmpresa || item.empresa || "SIN EMPRESA",
            medico: item.medico,
            motivoConsulta: item.motivoConsulta || ""
        }));

        return {
            success: true,
            data: {
                patients,
                currentPage: pageNum,
                totalPages,
                totalItems
            }
        };
    } catch (error) {
        console.error("Error en obtenerPacientesPendientes:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 3. BUSCAR PACIENTE POR DOCUMENTO O CELULAR (SIN FILTRO DE MÉDICO)
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function buscarPacientePorDocumento(searchTerm, medicoCode = null) {
    if (!searchTerm) {
        throw new Error("searchTerm es requerido");
    }

    try {
        // Buscar en TODA la base de datos (sin filtro de médico)
        // Primero intentar buscar por numeroId
        let results = await wixData.query("HistoriaClinica")
            .eq("numeroId", searchTerm)
            .find();

        // Si no se encuentra por documento, buscar por celular
        if (results.items.length === 0) {
            results = await wixData.query("HistoriaClinica")
                .eq("celular", searchTerm)
                .find();
        }

        if (results.items.length === 0) {
            return {
                success: true,
                data: { patient: null }
            };
        }

        const item = results.items[0];

        // Buscar foto en FORMULARIO usando el numeroId del resultado
        const formularioResults = await wixData.query("FORMULARIO")
            .eq("documentoIdentidad", item.numeroId)
            .find();

        const foto = formularioResults.items.length > 0
            ? formularioResults.items[0].foto
            : "";

        const patient = {
            _id: item._id,
            nombres: `${item.primerNombre} ${item.primerApellido}`,
            primerNombre: item.primerNombre,
            segundoNombre: item.segundoNombre || "",
            primerApellido: item.primerApellido,
            segundoApellido: item.segundoApellido || "",
            numeroId: item.numeroId,
            estado: item.atendido || "Pendiente",
            pvEstado: item.pvEstado || "",
            foto,
            celular: item.celular,
            fechaAtencion: item.fechaAtencion,
            fechaConsulta: item.fechaConsulta,
            empresaListado: item.codEmpresa || item.empresa || "SIN EMPRESA",
            medico: item.medico,
            motivoConsulta: item.motivoConsulta || ""
        };

        return {
            success: true,
            data: { patient }
        };
    } catch (error) {
        console.error("Error en buscarPacientePorDocumento:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 4. MARCAR PACIENTE COMO "NO CONTESTA"
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function marcarPacienteNoContesta(patientId) {
    if (!patientId) {
        throw new Error("patientId es requerido");
    }

    try {
        // Buscar el paciente por _id
        const results = await wixData.query("HistoriaClinica")
            .eq("_id", patientId)
            .find();

        if (results.items.length === 0) {
            return {
                success: false,
                error: "Paciente no encontrado"
            };
        }

        let item = results.items[0];
        item.pvEstado = "No Contesta";
        item.medico = "RESERVA";  // Cambiar médico a RESERVA

        // Actualizar el registro
        await wixData.update("HistoriaClinica", item);

        return {
            success: true,
            message: "Paciente marcado como 'No Contesta' y asignado a RESERVA"
        };
    } catch (error) {
        console.error("Error en marcarPacienteNoContesta:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 5. OBTENER DETALLES COMPLETOS DE UN PACIENTE
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function obtenerDetallesPaciente(documento) {
    if (!documento) {
        throw new Error("documento es requerido");
    }

    try {
        // Query 1: HistoriaClinica
        const historiaResults = await wixData.query("HistoriaClinica")
            .eq("numeroId", documento)
            .find();

        if (historiaResults.items.length === 0) {
            return {
                success: true,
                data: { details: null }
            };
        }

        const historiaData = historiaResults.items[0];

        // Query 2: FORMULARIO
        const formularioResults = await wixData.query("FORMULARIO")
            .eq("documentoIdentidad", documento)
            .find();

        const formularioData = formularioResults.items.length > 0
            ? formularioResults.items[0]
            : null;

        // Combinar datos de ambas tablas
        const details = {
            // Datos de HistoriaClinica
            _id: historiaData._id,
            primerNombre: historiaData.primerNombre,
            segundoNombre: historiaData.segundoNombre || "",
            primerApellido: historiaData.primerApellido,
            segundoApellido: historiaData.segundoApellido || "",
            nombres: `${historiaData.primerNombre} ${historiaData.primerApellido}`,
            numeroId: historiaData.numeroId,
            celular: historiaData.celular,
            fechaAtencion: historiaData.fechaAtencion,
            fechaConsulta: historiaData.fechaConsulta,
            medico: historiaData.medico,
            codEmpresa: historiaData.codEmpresa,
            empresa: historiaData.empresa,
            empresaListado: historiaData.codEmpresa || historiaData.empresa || "SIN EMPRESA",
            estado: historiaData.atendido || "Pendiente",
            pvEstado: historiaData.pvEstado || "",
            motivoConsulta: historiaData.motivoConsulta || "",
            diagnostico: historiaData.diagnostico || "",
            tratamiento: historiaData.tratamiento || "",

            // Datos de FORMULARIO (si existen)
            foto: formularioData?.foto || "",
            email: formularioData?.email || "",
            direccion: formularioData?.direccion || "",
            ciudad: formularioData?.ciudad || "",
            fechaNacimiento: formularioData?.fechaNacimiento || null,
            genero: formularioData?.genero || "",
            tipoDocumento: formularioData?.tipoDocumento || "CC"
        };

        return {
            success: true,
            data: { details }
        };
    } catch (error) {
        console.error("Error en obtenerDetallesPaciente:", error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 6. OBTENER DATOS DE FORMULARIO POR HISTORIA CLÍNICA ID
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function obtenerDatosFormularioPorHistoriaId(historiaClinicaId) {
    if (!historiaClinicaId) {
        return { success: false, error: "historiaClinicaId es requerido" };
    }

    try {
        // Buscar en FORMULARIO usando idGeneral que corresponde al _id de HistoriaClinica
        const formularioResults = await wixData.query("FORMULARIO")
            .eq("idGeneral", historiaClinicaId)
            .find();

        if (formularioResults.items.length === 0) {
            return {
                success: true,
                data: null // No hay formulario asociado
            };
        }

        const formulario = formularioResults.items[0];

        return {
            success: true,
            data: {
                _id: formulario._id,
                idGeneral: formulario.idGeneral,
                documentoIdentidad: formulario.documentoIdentidad,

                // Datos demográficos
                edad: formulario.edad || "",
                genero: formulario.genero || "",
                profesion: formulario.profesion || "",
                estadoCivil: formulario.estadoCivil || "",
                hijos: formulario.hijos || "",

                // Ubicación
                ciudadDeResidencia: formulario.ciudadDeResidencia || "",
                direccion: formulario.direccion || "",

                // Contacto
                email: formulario.email || "",
                telefono: formulario.telefono || "",

                // Estilo de vida
                licor: formulario.licor || "",
                ejercicio: formulario.ejercicio || "",

                // Historia médica del paciente
                encuestaSalud: formulario.encuestaSalud || "",
                antecedentesFamiliares: formulario.antecedentesFamiliares || "",

                // Empresa anterior
                empresa1: formulario.empresa1 || "",

                // Foto
                foto: formulario.foto || "",

                // Fecha de nacimiento
                fechaNacimiento: formulario.fechaNacimiento || null,

                // Tipo de documento
                tipoDocumento: formulario.tipoDocumento || "CC"
            }
        };
    } catch (error) {
        console.error("Error en obtenerDatosFormularioPorHistoriaId:", error);
        return { success: false, error: error.message };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 7. OBTENER DATOS COMPLETOS PARA FORMULARIO MÉDICO (HistoriaClinica + FORMULARIO)
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function obtenerDatosCompletosParaFormulario(numeroId) {
    if (!numeroId) {
        return { success: false, error: "numeroId es requerido" };
    }

    try {
        // 1. Buscar en HistoriaClinica por documento
        const historiaResults = await wixData.query("HistoriaClinica")
            .eq("numeroId", numeroId)
            .find();

        if (historiaResults.items.length === 0) {
            return { success: false, error: "No se encontró paciente con ese documento" };
        }

        const historia = historiaResults.items[0];

        // 2. Buscar en FORMULARIO usando el _id de HistoriaClinica
        const formularioResults = await wixData.query("FORMULARIO")
            .eq("idGeneral", historia._id)
            .find();

        const formulario = formularioResults.items.length > 0
            ? formularioResults.items[0]
            : null;

        // 3. Combinar datos
        return {
            success: true,
            data: {
                // Datos de identificación
                _id: historia._id,
                numeroId: historia.numeroId,
                nombres: `${historia.primerNombre} ${historia.primerApellido}`,
                primerNombre: historia.primerNombre,
                segundoNombre: historia.segundoNombre || "",
                primerApellido: historia.primerApellido,
                segundoApellido: historia.segundoApellido || "",

                // Datos de HistoriaClinica (editables por el médico)
                talla: historia.talla || "",
                peso: historia.peso || "",
                cargo: historia.cargo || "",
                mdAntecedentes: historia.mdAntecedentes || "",
                mdObsParaMiDocYa: historia.mdObsParaMiDocYa || "",
                mdObservacionesCertificado: historia.mdObservacionesCertificado || "",
                mdRecomendacionesMedicasAdicionales: historia.mdRecomendacionesMedicasAdicionales || "",
                mdConceptoFinal: historia.mdConceptoFinal || "",
                mdDx1: historia.mdDx1 || "",
                mdDx2: historia.mdDx2 || "",

                // Datos del paciente (solo lectura desde FORMULARIO)
                formulario: formulario ? {
                    edad: formulario.edad || "",
                    genero: formulario.genero || "",
                    profesion: formulario.profesion || "",
                    estadoCivil: formulario.estadoCivil || "",
                    hijos: formulario.hijos || "",
                    ciudadDeResidencia: formulario.ciudadDeResidencia || "",
                    direccion: formulario.direccion || "",
                    email: formulario.email || "",
                    telefono: formulario.telefono || "",
                    licor: formulario.licor || "",
                    ejercicio: formulario.ejercicio || "",
                    encuestaSalud: formulario.encuestaSalud || "",
                    antecedentesFamiliares: formulario.antecedentesFamiliares || "",
                    empresa1: formulario.empresa1 || "",
                    foto: formulario.foto || "",
                    fechaNacimiento: formulario.fechaNacimiento || null,
                    tipoDocumento: formulario.tipoDocumento || "CC"
                } : null
            }
        };
    } catch (error) {
        console.error("Error en obtenerDatosCompletosParaFormulario:", error);
        return { success: false, error: error.message };
    }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * 8. OBTENER TODOS LOS PROGRAMADOS HOY (INCLUYENDO ATENDIDOS) - SOLO PARA DEBUG
 * ════════════════════════════════════════════════════════════════════════════
 */
export async function obtenerTodosProgramadosHoy(medicoCode) {
    if (!medicoCode) {
        throw new Error("medicoCode es requerido");
    }

    // Usar zona horaria de Colombia (UTC-5)
    const today = new Date();
    const colombiaOffset = -5 * 60;
    const localOffset = today.getTimezoneOffset();
    const offsetDiff = colombiaOffset - localOffset;

    const colombiaTime = new Date(today.getTime() + offsetDiff * 60000);
    const startOfDay = new Date(colombiaTime.getFullYear(), colombiaTime.getMonth(), colombiaTime.getDate());
    const endOfDay = new Date(colombiaTime.getFullYear(), colombiaTime.getMonth(), colombiaTime.getDate(), 23, 59, 59);

    try {
        // Query para obtener TODOS los programados hoy (con o sin fechaConsulta)
        const historiaResults = await wixData.query("HistoriaClinica")
            .eq("medico", medicoCode)
            .between("fechaAtencion", startOfDay, endOfDay)
            .ascending("fechaAtencion")
            .limit(100)
            .find();

        const pacientes = historiaResults.items.map(item => ({
            numeroId: item.numeroId,
            nombres: `${item.primerNombre} ${item.primerApellido}`,
            fechaAtencion: item.fechaAtencion,
            fechaConsulta: item.fechaConsulta,
            estado: item.fechaConsulta ? "ATENDIDO" : "PENDIENTE"
        }));

        return {
            success: true,
            data: {
                total: pacientes.length,
                pacientes
            }
        };
    } catch (error) {
        console.error("Error en obtenerTodosProgramadosHoy:", error);
        return {
            success: false,
            error: error.message
        };
    }
}
