import { google } from 'googleapis';
import { authentication } from 'wix-members-backend';
import { getSecret } from 'wix-secrets-backend';
import { ok, serverError, badRequest, forbidden, notFound } from 'wix-http-functions';
import { twiml, validateRequest } from 'twilio';

import { fetch } from 'wix-fetch';
import wixData from 'wix-data';
import { sendmessage } from 'backend/realtime.jsw';
import { enviarCertificadosProgramados } from 'backend/BotLinks';
import { barridoYEnvioMensajesConDelay } from 'backend/BotLinks';
import { envioLinkMedicoVirtual } from 'backend/BotLinks';
import { actualizarResumenConversacion } from 'backend/exposeDataBase';
import { obtenerHorasOcupadas } from 'backend/exposeDataBase';
import { crearRegistroAgente } from 'backend/exposeDataBase';
import { consultarPorDocumento } from 'backend/exposeDataBase';
import { guardarMensajeWix } from 'backend/BotGuardarMensajesWix.jsw';
import { obtenerFormularios, actualizarFormulario, obtenerFormularioPorIdGeneral, crearFormulario } from 'backend/exposeDataBase';
import { obtenerAudiometrias, actualizarAudiometria, crearAudiometria } from 'backend/exposeDataBase';
import { obtenerVisuales, actualizarVisual, crearVisual } from 'backend/exposeDataBase';
import { obtenerAdcTests, actualizarAdcTest, crearAdcTest } from 'backend/exposeDataBase';
import {
  obtenerEstadisticasMedico,
  obtenerPacientesPendientes,
  buscarPacientePorDocumento,
  marcarPacienteNoContesta,
  obtenerDetallesPaciente,
  obtenerTodosProgramadosHoy,
  actualizarHistoriaClinica,
  obtenerDatosFormularioPorHistoriaId,
  obtenerDatosCompletosParaFormulario,
  obtenerHistoriaClinica
} from 'backend/integracionPanelMedico';

import { callOpenAI } from 'backend/open-ai';
import { consultarCita } from 'backend/consultaHistoriaClinicaBot';
import { analizarImagenPago } from 'backend/analizarImagenPago';

export function sendTextMessage(toNumber, messageBody) {
    const url = "https://gate.whapi.cloud/messages/text";
    const headers = {
        "accept": "application/json",
        "authorization": "Bearer due3eWCwuBM2Xqd6cPujuTRqSbMb68lt",
        "content-type": "application/json"
    };
    const postData = {
        "typing_time": 0,
        "to": toNumber,
        "body": messageBody
    };

    // Realizar la solicitud POST
    return fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(postData)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error en la solicitud: ${response.status} ${response.statusText}`);
            }
            return response.json();
        })
        .then(json => {
            console.log("Mensaje enviado con éxito:", json);

            // Registrar el evento y cerrar la lightbox
            return sendmessage("chatsWhp", { type: "updateComplete" })
                .then(() => {
                    console.log("Evento 'updateComplete' registrado correctamente.");
                    return json; // Devuelve la respuesta principal
                });
        })
        .catch(err => {
            console.error("Error en el proceso de envío o registro del evento:", err);
            throw err; // Propagar el error
        });
}

export function post_enviarLinkDocVirtual(request) {
    return envioLinkMedicoVirtual()
        .then(response => ok({ body: response }))
        .catch(error => serverError({ body: error.message }));
}

export function post_revisionLinks(request) {
    return barridoYEnvioMensajesConDelay()
        .then(response => ok({ body: response }))
        .catch(error => serverError({ body: error.message }));
}

import crypto from 'crypto';

/**
 * Valida la autenticidad HMAC de la solicitud.
 */
async function validateHMAC(request) {
    const secret = await getSecret('hmac-authentication-secret-key'); // Obtiene el secreto desde Secrets Manager

    const signature = request.headers['x-hmac-signature'];
    const timestamp = request.headers['x-hmac-timestamp'];

    if (!signature || !timestamp) {
        throw new Error('Encabezados de autenticación HMAC faltantes');
    }

    // Crear el cuerpo de la solicitud como string para validar
    const body = await request.body.text();
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${timestamp}:${body}`);
    const computedSignature = hmac.digest('hex');

    if (computedSignature !== signature) {
        throw new Error('Firma HMAC inválida');
    }

    const currentTime = Date.now();
    if (Math.abs(currentTime - parseInt(timestamp)) > 300000) { // Máximo 5 minutos de diferencia
        throw new Error('La solicitud HMAC está fuera de tiempo permitido');
    }
}

/**
 * Maneja solicitudes POST para obtener datos de un paciente con autenticación HMAC
 */
export async function post_obtenerDatosPaciente(request) {
    const response = {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        },
        body: ""
    };

    try {
        // Validar la autenticidad HMAC
        await validateHMAC(request);

        const requestBody = await request.body.json();
        const pacienteId = requestBody._id;

        if (!pacienteId) {
            throw new Error("El parámetro '_id' es requerido.");
        }

        // Realizar la consulta en la base de datos
        const result = await wixData.query("CHATBOT")
            .eq("idGeneral", pacienteId)
            .find();

        if (result.items.length === 0) {
            throw new Error(`No se encontró información para el paciente con ID: ${pacienteId}`);
        }

        const paciente = result.items[0];
        response.body = JSON.stringify({
            success: true,
            data: {
                primerNombre: paciente.primerNombre || "",
                profesionUOficio: paciente.profesionUOficio || [],
                antecedentesFamiliares: paciente.antecedentesFamiliares || []
            }
        });

        return ok(response);

    } catch (err) {
        console.error("Error en post_obtenerDatosPaciente:", err.message);
        response.body = JSON.stringify({ success: false, message: err.message });
        return badRequest(response);
    }
}

/**
 * Manejar OPTIONS para preflight CORS
 */
export function options_obtenerDatosPaciente(request) {
    return {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-hmac-signature, x-hmac-timestamp"
        },
        body: {}
    };
}

// TWILIO

//TWILIO CON MENSAJE WORSHIP
export async function use_voice(request) {
    const authToken = await getSecret("TWILIO_AUTH_TOKEN");

    const signature = request.headers['x-twilio-signature'];
    const url = request.url;

    const bodyText = await request.body.text();
    const params = new URLSearchParams(bodyText);
    const parsedParams = {};
    params.forEach((value, key) => {
        parsedParams[key] = value;
    });

    const isValid = validateRequest(authToken, signature, url, parsedParams);

    if (!isValid) {
        console.log("Firma de solicitud de Twilio inválida.");
        return badRequest({
            headers: {
                "Content-Type": "text/plain"
            },
            body: "Invalid Twilio request signature"
        });
    }

    const fromNumber = parsedParams['From'];
    console.log("Número del que llama:", fromNumber);

    const VoiceResponse = twiml.VoiceResponse;
    const twimlResponse = new VoiceResponse();

    // Usar Gather para capturar la opción ingresada por el usuario
    const gather = twimlResponse.gather({
        numDigits: 1,
        action: "https://www.bsl.com.co/_functions/handleInputTwilio", // Cambia a este dominio para que coincida
        method: "POST"
    });

    gather.play('https://static.wixstatic.com/mp3/cb6469_df26c387cc14440b8b9072ff9942b683.mp3');

    // Instrucciones adicionales si no se recibe ninguna entrada
    twimlResponse.say("No se recibió ninguna entrada. Por favor, intente nuevamente.");

    return ok({
        headers: {
            "Content-Type": "text/xml"
        },
        body: twimlResponse.toString()
    });
}

// TWILIO - ENDPOINT PARA LLAMADAS DE VOZ AUTOMÁTICAS (VIDEOLLAMADAS)
export function post_voice(request) {
    const VoiceResponse = twiml.VoiceResponse;
    const twimlResponse = new VoiceResponse();

    // Obtener el nombre del paciente desde los parámetros de la URL
    const nombrePaciente = request.query.nombre || "estimado paciente";

    // Mensaje personalizado en español
    const mensaje = `Hola ${nombrePaciente}. Te llamamos de BSL Medicina Ocupacional.

    Tienes una consulta médica virtual programada.

    Por favor revisa tu WhatsApp donde te acabamos de enviar el link de acceso a la videollamada.

    Asegúrate de permitir el acceso a tu cámara y micrófono cuando tu navegador te lo pida.

    Gracias por tu atención.`;

    // Configurar voz en español con opciones de Twilio
    twimlResponse.say(
        {
            voice: 'alice',
            language: 'es-MX' // Español de México (más clara que es-ES)
        },
        mensaje
    );

    return ok({
        headers: {
            "Content-Type": "text/xml"
        },
        body: twimlResponse.toString()
    });
}

// Función para manejar la entrada del usuario
export async function post_handleInputTwilio(request) {
    console.log("post_handleInputTwilio ha sido invocado.");
    const bodyText = await request.body.text();
    const params = new URLSearchParams(bodyText);
    const userChoice = params.get('Digits');
    const fromNumber = params.get('From').replace(/^\+/, ''); // Elimina el símbolo '+' si está presente

    let message;
    if (userChoice === '1') {
        message = "Hola Carlinsito. Soy tu amigo el marranito";
    } else if (userChoice === '2') {
        message = "Hola Carlos Eduardo. Soy la palomita que te saluda";
    } else {
        message = "Entrada no válida";
    }

    // Imprimir los datos antes de enviar el mensaje
    console.log("Número de WhatsApp:", fromNumber);
    console.log("Mensaje a enviar:", message);

    // Llama a la función para enviar el mensaje de WhatsApp
    try {
        const sendMessageResult = await sendTextMessage(fromNumber, message);
        console.log("Resultado de sendTextMessage:", sendMessageResult);
    } catch (error) {
        console.error("Error al enviar mensaje de WhatsApp:", error);
    }

    const VoiceResponse = twiml.VoiceResponse;
    const twimlResponse = new VoiceResponse();
    twimlResponse.play('https://static.wixstatic.com/mp3/cb6469_ccf5f0b81ce0480fa547263aa7d29089.mp3');

    return ok({
        headers: {
            "Content-Type": "text/xml"
        },
        body: twimlResponse.toString()
    });
}

// ------
// MÉDICO VIRTUAL WEBRTC
// ------

export function get_chatbot(request) {
    const _id = request.query["_id"];

    if (!_id) {
        return badRequest({
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // Permite acceso desde cualquier origen
            },
            body: { error: "El parámetro _id es obligatorio" }
        });
    }

    return wixData.get("CHATBOT", _id)
        .then(item => {
            if (!item) {
                return notFound({
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*"
                    },
                    body: { error: "No se encontró el usuario con ese _id" }
                });
            }

            return ok({
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: {
                    primerNombre: item.primerNombre,
                    encuestaSalud: item.encuestaSalud || [],
                    antecedentesFamiliares: item.antecedentesFamiliares || [],
                    profesion: item.profesion,
                    celular: item.celular // <--- IMPORTANTE

                }
            });
        })
        .catch(err => {
            return badRequest({
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*"
                },
                body: { error: err.message }
            });
        });
}

export async function post_actualizarResumen(request) {
    console.log("BACKEND ACTUALIZANDO RESUMEN aI")
    try {
        const body = await request.body.json();
        const { _id, resumen } = body;

        const resultado = await actualizarResumenConversacion(_id, resumen);

        return ok({ body: { success: true, resultado } });
    } catch (e) {
        return serverError({ body: { success: false, error: e.message } });
    }
}

export function get_horariosDisponibles(request) {
    console.log("Buscando horarios de médico disponibles")
    const { fecha } = request.query;
    if (!fecha) {
        return badRequest({ body: { message: "Falta el parámetro 'fecha'" } });
    }

    return obtenerHorasOcupadas(fecha).then(horasOcupadas => {
        return ok({
            headers: { "Content-Type": "application/json" },
            body: {
                fecha,
                horasOcupadas
            }
        });
    });
}

export function post_crearRegistroAgente(request) {
    return request.body.json()
        .then(async (body) => {
            const { fechaCompleta } = body;
            const result = await crearRegistroAgente(fechaCompleta);
            return ok(result);
        })
        .catch((error) => {
            console.error("❌ Error en HTTP Function:", error);
            return serverError({ body: { error: error.message } });
        });
}

// backend/http-functions.js

// Endpoint HTTP POST: /_functions/guardarMensajeWix
export async function post_guardarMensajeWix(request) {
    console.log("Http BotGuardarMensajesWix")
    try {
        const body = await request.body.json();
        const resultado = await guardarMensajeWix(body);
        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(resultado)
        };
    } catch (e) {
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: e.message })
        };
    }
}

// FUNCIÓN PARA PERMITIR QUE EL BOT GUARDE LAS CONVERSACIONES EN LA COLECCION WHP
// POST: guardar conversacion

export async function post_guardarConversacion(request) {
    console.log("🟡 Activando POST guardarConversacion del bot externo");

    let body;
    try {
        body = await request.body.json();
    } catch (e) {
        console.error("❌ Error al parsear el body:", e);
        return {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: { error: "Body inválido o malformado", detail: e.message }
        };
    }

    try {
        const { userId, nombre, mensajes = [], threadId, ultimoMensajeBot } = body;

        if (!Array.isArray(mensajes) || !userId) {
            return {
                status: 400,
                headers: { "Content-Type": "application/json" },
                body: { error: "Faltan datos obligatorios" }
            };
        }

        // 🔎 Buscar conversación previa
        const existing = await wixData.query("WHP").eq("userId", userId).find();
        const previo = existing.items[0] || {};
        const prevMensajes = previo.mensajes || [];

        // 🧹 Eliminar duplicados combinando from y mensaje
        const clavesPrevias = new Set(prevMensajes.map(m => `${m.from}-${m.mensaje}`));
        const nuevosFiltrados = mensajes.filter(m => {
            // Permitir mensajes no vacíos, de cualquier "from"
            return m.mensaje && m.from && !clavesPrevias.has(`${m.from}-${m.mensaje}`);
        });

        const historialFinal = [...prevMensajes, ...nuevosFiltrados];

        // 🛠 Construir el nuevo item manteniendo campos anteriores
        const item = {
            ...previo,
            userId,
            nombre,
            mensajes: historialFinal,
            actualizado: new Date()
        };

        if (threadId) {
            item.threadId = threadId;
        }

        // 👇 Guardar el último mensaje del bot para control de duplicados
        if (ultimoMensajeBot) {
            item.ultimoMensajeBot = ultimoMensajeBot;
        }

        if (previo._id) {
            await wixData.update("WHP", item);
        } else {
            await wixData.insert("WHP", item);
        }

        // --- REENVIAR A OPENAI DESDE WIX DESPUÉS DE GUARDAR ---
        // Si tienes threadId y hay mensajes nuevos:
        if (threadId && nuevosFiltrados.length > 0) {
            // Por cada mensaje nuevo, llama a tu backend Flask
            for (const msg of nuevosFiltrados) {
                try {
                    await fetch("https://agentes-bot-bsl-vf9hm.ondigitalocean.app//reenviar_a_openai", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                role: msg.from, // Puede ser "usuario", "sistema", "admin", "wix"
                                mensaje: msg.mensaje,
                                thread_id: threadId
                            })
                        })
                        .then(response => response.json())
                        .then(res => console.log("Mensaje reenviado a OpenAI:", res))
                        .catch(err => console.error("❌ Error reenviando a OpenAI:", err));
                } catch (e) {
                    console.error("❌ Error en fetch a Flask para OpenAI:", e);
                }
            }
        }
        // ------------------------------------------------------

        return {
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: {
                success: true,
                message: "Conversación guardada correctamente",
                total: historialFinal.length
            }
        };
    } catch (e) {
        console.error("❌ Error al guardar conversación:", e);
        return {
            status: 500,
            headers: { "Content-Type": "application/json" },
            body: { error: e.message, stack: e.stack }
        };
    }
}

// GET: obtener conversacion por userId

export async function get_obtenerConversacion(request) {
    const userId = request.query["userId"];

    if (!userId) {
        return badRequest({ body: { error: "userId requerido" } });
    }

    try {
        const res = await wixData.query("WHP").eq("userId", userId).find();

        if (res.items.length > 0) {
            const item = res.items[0];
            const mensajes = item.mensajes || [];
            const stopBot = item.stopBot === true;
            const observaciones = item.observaciones || "";
            const threadId = item.threadId || ""; // <--- AGREGA ESTA LÍNEA

            console.log(`✅ Consulta WHP | userId: ${userId} | observaciones: ${observaciones}`);

            return ok({
                body: {
                    mensajes,
                    stopBot,
                    observaciones,
                    threadId // <--- Y DEVUÉLVELO AQUÍ
                }
            });
        } else {
            console.log(`⚠️ No se encontró conversación para userId: ${userId}`);
            return ok({
                body: {
                    mensajes: [],
                    stopBot: false,
                    observaciones: "",
                    threadId: "" // <--- También aquí
                }
            });
        }
    } catch (e) {
        console.error("❌ Error al obtener conversación:", e);
        return serverError({ body: { error: e.message } });
    }
}

export async function post_actualizarObservaciones(request) {
    try {
        const { userId, observaciones } = await request.body.json();

        if (!userId || !observaciones) {
            return badRequest({ body: { error: "Faltan parámetros" } });
        }

        const result = await wixData.query("WHP").eq("userId", userId).find();
        if (result.items.length === 0) {
            return ok({ body: { mensaje: "Usuario no encontrado" } });
        }

        const item = result.items[0];
        item.observaciones = observaciones;

        const actualizado = await wixData.update("WHP", item);

        console.log(`✅ Observación actualizada | userId: ${userId} | observaciones: ${observaciones}`);
        return ok({ body: { success: true } });

    } catch (e) {
        console.error("❌ Error en guardarObservacion:", e);
        return serverError({ body: { error: e.message } });
    }
}

export async function post_marcarPagado(request) {
    console.log("marcando pagado")
    try {
        const { userId, observaciones } = await request.body.json();

        if (!userId || !observaciones) {
            return badRequest({ body: { error: "Faltan parámetros" } });
        }

        const result = await wixData.query("HistoriaClinica").eq("numeroId", userId).find();
        if (result.items.length === 0) {
            return ok({ body: { mensaje: "Usuario no encontrado" } });
        }

        const item = result.items[0];
        item.pvEstado = observaciones;

        const actualizado = await wixData.update("HistoriaClinica", item);

        return ok({ body: { success: true } });

    } catch (e) {
        console.error("❌ Error en guardarObservacion:", e);
        return serverError({ body: { error: e.message } });
    }
}

export function get_informacionPaciente(request) {
    console.log("Buscando información del paciente por número de documento");

    const { numeroId } = request.query;

    if (!numeroId) {
        return badRequest({ body: { message: "Falta el parámetro 'numeroId'" } });
    }

    return consultarPorDocumento(numeroId).then(info => {
        const infoFormateada = info.map(item => ({
            _id: item._id,
            primerNombre: item.primerNombre,
            primerApellido: item.primerApellido,
            celular: item.celular,
            fechaConsulta: item.fechaConsulta ? new Date(item.fechaConsulta).toISOString() : null,
            fechaAtencion: item.fechaAtencion ? new Date(item.fechaAtencion).toISOString() : null,
            pvEstado: item.pvEstado,
            atendido: item.atendido,
            foto: item.foto,
            codEmpresa: item.codEmpresa,
            empresa: item.empresa
        }));

        return ok({
            headers: { "Content-Type": "application/json" },
            body: {
                numeroId,
                informacion: infoFormateada
            }
        });
    }).catch(error => {
        console.error("Error al obtener información:", error);
        return serverError({ body: { message: "Error al obtener la información" } });
    });
}

// backend/eliminarConversacion.jsw (en Wix)

export async function post_eliminarConversacion(request) {
    try {
        const { userId } = await request.body.json();
        const result = await wixData.query("WHP").eq("userId", userId).find();
        if (result.items.length > 0) {
            await wixData.remove("WHP", result.items[0]._id);
            return ok({ body: { success: true } });
        } else {
            return notFound({ body: { success: false, message: "No encontrado" } });
        }
    } catch (err) {
        return serverError({ body: { success: false, error: err.message } });
    }
}

//GOOGLE ONAUTH

//google calls this function with a get, after the user signs in
/*export async function get_getAuth(request) {

    // retrieve the client secret from the Secrets Manager
    const googleClientSecret = await getSecret('clientSecret');
    const googleConfig = {
        clientId: '95796278101-4due4n5jf611cihfqbfu9101d1mn3i61.apps.googleusercontent.com',
        clientSecret: googleClientSecret,
        redirect: 'https://www.bsl.com.co/autoagendar',
    };

    //get the autorization code and state variable form the request URL
    const code = await request.query.code
    const state = await request.query.state

    // create a connection to google's authentication services
    const auth2 = new google.auth.OAuth2(
        googleConfig.clientId,
        googleConfig.clientSecret,
        googleConfig.redirect
    );

    //get the access token from the request with the authorization code we got from google 
    const data = await auth2.getToken(code);
    const tokens = data.tokens;

    //get the user info using the access token
    const userInfoRes = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?alt=json&access_token=${tokens.access_token}`, { "method": "get" })

    if (!userInfoRes.ok) {
        console.log("cound not get user info using access token")
    }

    //extract the user's email and profile picture URL
    const userInfo = (await userInfoRes.json())
    const userEmail = userInfo.email
    const profilePicture = userInfo.picture

    //now that we have the email we can use it to generate a Wix session token to use in the frontend
    const sessionToken = await authentication.generateSessionToken(userEmail);

    //return the url, session token, state variable, and profile picture to google to rediect the browser to our logged in page.
    return response({
        status: 302,
        headers: { 'Location': `https://mywix987.wixsite.com/sso-example/loggedin?sessiontoken=${sessionToken}&responseState=${state}&profilepic=${profilePicture}` }
    });
}*/

//------------ 
// BOT CON NÚMEROS 
//------------ 

const BOT_NUMBER = "573008021701";

export function post_handleInput(request) {
    return request.body.json()
        .then(async (body) => {
            if (body && body.statuses && Array.isArray(body.statuses)) {
                console.log("Body recibido:", JSON.stringify(body, null, 2));
                return {
                    status: 200,
                    body: { message: "Evento de estado procesado correctamente." }
                };
            }

            if (!body || !body.messages || !Array.isArray(body.messages)) {
                return {
                    status: 200,
                    body: { message: "Solicitud ignorada: el payload no contiene mensajes." }
                };
            }

            const messages = body.messages;

            for (const message of messages) {
                const from = message && message.from ? message.from.trim() : null;
                const bodyText = (message && message.text && message.text.body ? message.text.body.trim() : null) || "Sin mensaje";
                const profileName = (message && message.from_name ? message.from_name.trim() : null) || "Nombre Desconocido";
                const fromMe = message && message.from_me ? message.from_me : false;
                
                // Detectar si el mensaje contiene una imagen
                const hasImage = message && (message.image || message.media_url || message.type === 'image');
                
                // Detectar si el mensaje viene de un grupo de WhatsApp
                const chatId = message && message.chat_id ? message.chat_id : null;
                const isGroupMessage = chatId && chatId.includes('@g.us');
                
                // Si el mensaje viene de un grupo, ignorarlo completamente
                if (isGroupMessage) {
                    console.log(`📱 Mensaje de grupo detectado. Ignorando mensaje de ${from}.`);
                    continue; // No procesar mensajes de grupos
                }

                if (from === BOT_NUMBER && fromMe) {
                    const chatIdBot = message && message.chat_id ? message.chat_id.split("@")[0].trim() : null;
                    if (!chatIdBot) continue;

                    const queryResult = await wixData.query("WHP").eq("userId", chatIdBot).find();
                    if (queryResult.items.length > 0) {
                        const existingConversation = queryResult.items[0];
                        if (bodyText === "...transfiriendo con asesor") {
                            existingConversation.stopBot = true;
                        } else if (bodyText === "...te dejo con el bot 🤖") {
                            existingConversation.stopBot = false;
                        }
                        await wixData.update("WHP", existingConversation);
                    }
                    continue;
                }

                if (from === BOT_NUMBER || fromMe) continue;
                if (!from || !bodyText) continue;

                let existingConversation;
                try {
                    const queryResult = await wixData.query("WHP").eq("userId", from).find();
                    if (queryResult.items.length > 0) {
                        existingConversation = queryResult.items[0];
                    }
                } catch (error) {
                    console.error("Error consultando la conversación existente:", error);
                }

                let conversation;
                if (existingConversation) {
                    conversation = existingConversation;
                } else {
                    conversation = {
                        userId: from,
                        nombre: profileName,
                        mensajes: [],
                        nivel: 0,
                        stopBot: false
                    };
                }

                // Si el mensaje contiene una imagen, detener el bot inmediatamente
                if (hasImage) {
                    conversation.stopBot = true;
                    if (existingConversation) {
                        await wixData.update("WHP", conversation);
                    } else {
                        await wixData.insert("WHP", conversation);
                    }
                    console.log(`🖼️ Imagen detectada de ${from}. Bot detenido (stopBot = true)`);
                    continue;
                }

                if (bodyText === "Ya terminé mis la pruebas") {
                    conversation.stopBot = true;
                    const saved = existingConversation ?
                        await wixData.update("WHP", conversation) :
                        await wixData.insert("WHP", conversation);

                    setTimeout(async () => {
                        try {
                            const conv = await wixData.get("WHP", saved._id);
                            conv.stopBot = false;
                            await wixData.update("WHP", conv);
                            console.log(`✅ Bot reactivado para ${conv.userId}`);
                        } catch (err) {
                            console.error("❌ Error reactivando bot:", err);
                        }
                    }, 50000);
                    continue;
                }

                if (conversation.stopBot) continue;

                let response = "";

                if (conversation.nivel === 0) {
                    response = `¡Hola!\nEscribe el *número* de opción:\n\n1️⃣ Exámenes Ocupacionales\n2️⃣ Pagar y Descargar\n3️⃣ ¿Otra pregunta?`;
                    conversation.nivel = 1;
                } else if (conversation.nivel === 1) {
                    if (bodyText === "1") {
                        response = `*Tenemos dos opciones:*\n\n1️⃣ Virtual ($ 46.000)\n2️⃣ Presencial ($ 69.000)\n3️⃣ Menú anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 2;
                    } else if (bodyText === "2") {
                        response = `Paga $46.000 en las siguientes cuentas:\n\n*Bancolombia*\nCta Ahorros: 442 9119 2456\nCédula: 79 981 585\n\n*Daviplata:* 301 440 0818\n\n*Nequi:* 300 802 1701\n\nCuándo lo hagas *envía el soporte de pago por acá*`;
                        conversation.nivel = 1;
                        conversation.stopBot = true;
                    } else if (bodyText === "3") {
                        response = `¿Cuál es tu pregunta? Escribe tu consulta y te ayudaré.`;
                        conversation.nivel = 5; // Nivel especial para manejar preguntas de OpenAI
                    } else {
                        response = `Por favor selecciona una opción:\n\n1️⃣ Exámenes Ocupacionales\n2️⃣ Pagar y Descargar\n3️⃣ ¿Otra pregunta?`;
                    }
                } else if (conversation.nivel === 2) {
                    if (bodyText === "1") {
                        response = `*¿Cómo funciona Virtual?*\n\n- Escoge la hora\n- Realiza las pruebas\n- El médico te contactará\n- Paga (Bcolombia, Nequi, Daviplata)\n\n*¡Listo!* Descarga tu certificado al instante.\n\n*Escoge la opción:*\n1️⃣ Agendar\n2️⃣ ¿Qué Incluye?\n3️⃣ Menú Anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 3;
                    } else if (bodyText === "2") {
                        response = `*Presencial $ 69.000*\n\n*Bienestar y Salud Laboral*\n*Dirección:*\nCalle 134 No. 7-83\n\n*Horarios:*\nLunes a Viernes: 7:30 AM - 4:30 PM\nSábados: 8:00 AM - 11:30\n\n_No necesitas agendar_. Es por orden de llegada.\n\n*Escoge la opción:*\n1️⃣ ¿Qué Incluye?\n2️⃣ Virtual\n3️⃣ Menú Anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 4;
                    } else if (bodyText === "3") {
                        response = `¡Hola!\nEscribe el *número* de opción:\n1️⃣ Exámenes Ocupacionales\n2️⃣ Pagar y Descargar\n3️⃣ Otros\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 1;
                    } else if (bodyText === "4") {
                        response = `¿Cuál es tu pregunta? Escribe tu consulta y te ayudaré.`;
                        conversation.nivel = 5; // Nivel especial para manejar preguntas de OpenAI
                    } else {
                        response = `Por favor selecciona una opción:\n1️⃣ Virtual ($ 46.000)\n2️⃣ Presencial ($ 69.000)\n3️⃣ Menú anterior\n4️⃣ ¿Otra pregunta?`;
                    }
                } else if (conversation.nivel === 3) {
                    if (bodyText === "1") {
                        response = `Para comenzar haz clic:\n\n*https://www.bsl.com.co/nuevaorden-1*`;
                        conversation.nivel = 0;
                    } else if (bodyText === "2") {
                        response = `Tu certificado incluye:\n\n 🦴Médico Osteomuscular\n👂 Audiometría\n👁️ Optometría\n\nPuedes agregar adicional:\n🫀 Cardiovascular ($ 5.000)\n🩸 Vascular ($ 5.000)\n🫁 Espirometría ($ 5.000)\n🧠 Psicológico ($ 15.000)\n🏻 Dermatológico ($ 5.000)\n💉 Perfil lipídico y otros laboratorios\n\n*Escoge la opción:*\n1️⃣ Agendar\n3️⃣ Menú Anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 3;
                    } else if (bodyText === "3") {
                        response = `*Tenemos dos opciones:*\n1️⃣ Virtual ($ 46.000)\n2️⃣ Presencial ($ 69.000)\n3️⃣ Menú anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 2;
                    } else if (bodyText === "4") {
                        response = `¿Cuál es tu pregunta? Escribe tu consulta y te ayudaré.`;
                        conversation.nivel = 5; // Nivel especial para manejar preguntas de OpenAI
                    } else {
                        response = `Por favor selecciona una opción:\n1️⃣ Agendar\n2️⃣ ¿Qué Incluye?\n3️⃣ Menú Anterior\n4️⃣ ¿Otra pregunta?`;
                    }
                } else if (conversation.nivel === 4) {
                    if (bodyText === "1") {
                        response = `Tu certificado incluye:\n\n 🦴Médico Osteomuscular\n👂 Audiometría\n👁️ Optometría\n\nPuedes agregar adicional:\n🫀 Cardiovascular ($ 5.000)\n🩸 Vascular ($ 5.000)\n🫁 Espirometría ($ 5.000)\n🧠 Psicológico ($ 15.000)\n🏻 Dermatológico ($ 5.000)\n💉 Perfil lipídico y otros laboratorios\n\n*Escoge la opción:*\n1️⃣ ¿Qué Incluye?\n2️⃣ Virtual\n3️⃣ Menú Anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 4;
                    } else if (bodyText === "2") {
                        response = `*¿Cómo funciona Virtual?*\n\n1️⃣ Escoge la hora\n2️⃣ Realiza las pruebas\n3️⃣ El médico te contactará\n4️⃣ Paga (Bancolombia, Nequi, Daviplata)\n\n*¡Listo!* Descarga tu certificado al instante.\n\n*Escoge la opción:*\n1️⃣ Agendar\n2️⃣ ¿Qué Incluye?\n3️⃣ Menú Anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 3;
                    } else if (bodyText === "3") {
                        response = `*Tenemos dos opciones:*\n1️⃣ Virtual ($ 46.000)\n2️⃣ Presencial ($ 69.000)\n3️⃣ Menú anterior\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 2;
                    } else if (bodyText === "4") {
                        response = `¿Cuál es tu pregunta? Escribe tu consulta y te ayudaré.`;
                        conversation.nivel = 5; // Nivel especial para manejar preguntas de OpenAI
                    } else {
                        response = `Por favor selecciona una opción:\n1️⃣ ¿Qué Incluye?\n2️⃣ Virtual\n3️⃣ Menú Anterior\n4️⃣ ¿Otra pregunta?`;
                    }
                } else if (conversation.nivel === 5) {
                    // Nivel especial para preguntas de OpenAI
                    
                    // Detectar si el usuario indica que ya agendó directamente
                    const agendaKeywords = ["ya agendé", "agendé", "listo", "agendado", "hecho", "completé", "terminé de agendar"];
                    const userSaysAgendaComplete = agendaKeywords.some(keyword => 
                        bodyText.toLowerCase().includes(keyword.toLowerCase())
                    );
                    
                    if (userSaysAgendaComplete) {
                        response = `¡Perfecto! Ya tienes tu cita agendada. 🎉\n\nAhora realiza tus exámenes virtuales y el médico revisará tu certificado. Una vez aprobado, recibirás las instrucciones de pago.\n\n¡Nos vemos en tu consulta virtual! 👨‍⚕️`;
                        conversation.stopBot = true;
                    } else {
                        try {
                        const systemPrompt = `Eres el asistente virtual de BSL para exámenes médicos ocupacionales en Colombia. 

🎯 REGLAS FUNDAMENTALES:
- NUNCA te presentes como BSL si ya estás en una conversación activa
- Responde en frases cortas y claras, sin tecnicismos
- Si el usuario ya recibió información específica, NO la repitas automáticamente
- Mantén el contexto de la conversación

🚨 CUÁNDO TRANSFERIR A ASESOR:
Si no entiendes algo, hay problemas técnicos, o el usuario lo solicita, responde EXACTAMENTE: "...transfiriendo con asesor" (SIN PUNTO FINAL). Esto detiene el bot.

📋 SERVICIOS DISPONIBLES:

**Exámenes Ocupacionales:**
• Virtual: $46.000 COP (7am-7pm, todos los días, 35 min total)
• Presencial: $69.000 COP (Calle 134 No. 7-83, Bogotá)

**Incluyen:** Médico osteomuscular, audiometría, optometría

**Para agendar virtual:** https://www.bsl.com.co/nuevaorden-1

**Exámenes extras opcionales:**
• Cardiovascular, Vascular, Espirometría, Dermatológico: $5.000 c/u
• Psicológico: $15.000
• Perfil lipídico: $60.000
• Glicemia: $20.000

**Medios de pago:**
• Bancolombia: Ahorros 44291192456 (cédula 79981585)
• Daviplata: 3014400818 (Mar Rea)
• Nequi: 3008021701 (Dan Tal)
• Transfiya

📌 FLUJO DEL PROCESO:
1. Usuario agenda en el link
2. Realiza pruebas virtuales (25 min)
3. Consulta médica (10 min)
4. Médico revisa y aprueba certificado
5. Usuario paga
6. Descarga certificado sin marca de agua

🎯 RESPUESTAS SEGÚN CONTEXTO:

**Si pregunta cómo hacer examen o info general:**
"🩺 Nuestras opciones:
Virtual – $46.000 COP
Presencial – $69.000 COP"

**Si el usuario responde "virtual" o algo similar:**
"Excelente elección! 💻 Examen Virtual ($46.000)
📍 100% online desde cualquier lugar
⏰ Disponible 7am-7pm todos los días
⏱️ Duración: 35 minutos total
🔬 Incluye: Médico, audiometría, optometría

Agenda aquí: https://www.bsl.com.co/nuevaorden-1"

**Si el usuario responde "presencial":**
"Perfecto! 🏥 Examen Presencial ($69.000)
📍 Calle 134 No. 7-83, Bogotá
⏰ Horario según disponibilidad
📋 Incluye: Médico, audiometría, optometría

Agenda aquí: https://www.bsl.com.co/nuevaorden-1"

**IMPORTANTE: Si ya mostraste las opciones y el usuario eligió una, NO vuelvas a mostrar el menú de opciones.**

**Si pregunta por horarios de cita agendada:**
"Para confirmar tu horario necesito tu número de documento."

**Si pregunta por pago ANTES de hacer el examen:**
Explica que primero debe hacer el examen, luego el médico aprueba el certificado, y después se paga.

**Si el usuario dice "menú" o "volver al menú":**
Responde EXACTAMENTE: "VOLVER_AL_MENU" (sin explicaciones adicionales)

**Si el usuario indica que ya agendó (dice cosas como "ya agendé", "listo", "agendado", "hecho"):**
Responde algo como "¡Perfecto! Ya tienes tu cita agendada. Realiza tus exámenes y el médico revisará tu certificado." y luego responde EXACTAMENTE: "AGENDA_COMPLETADA"

Pregunta del usuario: ${bodyText}`;
                        
                        const aiResponse = await callOpenAI(systemPrompt, from);
                        
                        // Si OpenAI responde con transferencia a asesor, no agregar menú
                        if (aiResponse.includes("...transfiriendo con asesor")) {
                            response = aiResponse;
                            conversation.stopBot = true; // Detener el bot como indica la lógica
                        } else if (aiResponse.includes("VOLVER_AL_MENU")) {
                            response = `¡Hola!\nEscribe el *número* de opción:\n\n1️⃣ Exámenes Ocupacionales\n2️⃣ Pagar y Descargar\n3️⃣ Otros\n4️⃣ ¿Otra pregunta?`;
                            conversation.nivel = 1; // Volver al menú principal
                        } else if (aiResponse.includes("AGENDA_COMPLETADA")) {
                            // Extraer solo la parte antes de "AGENDA_COMPLETADA"
                            response = aiResponse.replace("AGENDA_COMPLETADA", "").trim();
                            conversation.stopBot = true; // Detener el bot después de agenda completada
                        } else {
                            response = aiResponse;
                            // Mantener en nivel 5 para continuar conversación con AI
                            conversation.nivel = 5;
                        }
                    } catch (error) {
                        console.error("Error llamando a OpenAI:", error);
                        response = `Lo siento, no pude procesar tu consulta en este momento. Por favor intenta de nuevo más tarde.`;
                        // Mantener en nivel 5 para que pueda intentar otra pregunta
                        conversation.nivel = 5;
                        }
                    }
                } else if (conversation.nivel === 6) {
                    // Nivel después de respuesta de OpenAI
                    if (bodyText === "1") {
                        response = `¡Hola!\nEscribe el *número* de opción:\n\n1️⃣ Exámenes Ocupacionales\n2️⃣ Pagar y Descargar\n3️⃣ Otros\n4️⃣ ¿Otra pregunta?`;
                        conversation.nivel = 1;
                    } else if (bodyText === "2") {
                        response = `¿Cuál es tu pregunta? Escribe tu consulta y te ayudaré.`;
                        conversation.nivel = 5;
                    } else {
                        response = `Por favor selecciona una opción:\n\n1️⃣ Menú Principal\n2️⃣ Otra pregunta`;
                    }
                }
                // Si no se generó ninguna respuesta por la lógica de niveles, asignar bienvenida por defecto
                if (!response || response.trim() === "") {
                    console.warn("❌ Se intentó enviar un mensaje vacío. Mensaje del usuario:", bodyText);

                    // Asignar un mensaje de bienvenida por defecto
                    response = `¡Hola! 👋\nEscribe el *número* de opción:\n\n1️⃣ Exámenes Ocupacionales\n2️⃣ Pagar y Descargar\n3️⃣ Otros\n4️⃣ ¿Otra pregunta?`;
                    conversation.nivel = 1;
                }

                conversation.mensajes.push({
                    from: "usuario",
                    mensaje: bodyText,
                    timestamp: new Date().toISOString()
                });

                conversation.mensajes.push({
                    from: "sistema",
                    mensaje: response,
                    timestamp: new Date().toISOString()
                });

                try {
                    if (existingConversation) {
                        await wixData.update("WHP", conversation);
                    } else {
                        delete conversation._id;
                        await wixData.insert("WHP", conversation);
                    }
                } catch (error) {
                    console.error("Error guardando la conversación:", error);
                }

                await sendTextMessage(from, response);
            }

            return {
                status: 200,
                body: { message: "Mensajes procesados correctamente." }
            };
        })
        .catch(error => {
            console.error("Error procesando webhook:", error);
            return {
                status: 500,
                body: { message: "Error procesando el webhook." }
            };
        });
}


// ENDPOINTS PARA BASE DE DATOS FORMULARIO
export async function post_crearFormulario(request) {
    try {
        const body = await request.body.json();

        const resultado = await crearFormulario(body);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function get_formularios(request) {
    try {
        const filtros = {};
        
        // Obtener filtros de query params si existen
        if (request.query.numeroId) {
            filtros.numeroId = request.query.numeroId;
        }
        if (request.query.fechaInicio && request.query.fechaFin) {
            filtros.fechaInicio = request.query.fechaInicio;
            filtros.fechaFin = request.query.fechaFin;
        }
        
        const resultado = await obtenerFormularios(filtros);
        
        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function post_actualizarFormulario(request) {
    try {
        const body = await request.body.json();
        const { _id, ...datos } = body;

        if (!_id) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro '_id' es requerido" }
            });
        }

        const resultado = await actualizarFormulario(_id, datos);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function get_formularioPorIdGeneral(request) {
    try {
        const idGeneral = request.query.idGeneral;

        if (!idGeneral) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro 'idGeneral' es requerido" }
            });
        }

        const resultado = await obtenerFormularioPorIdGeneral(idGeneral);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return notFound({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { success: false, message: resultado.message }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

// ENDPOINTS PARA BASE DE DATOS AUDIOMETRIA
export async function get_audiometrias(request) {
    try {
        const filtros = {};
        
        // Obtener filtros de query params si existen
        if (request.query.numeroId) {
            filtros.numeroId = request.query.numeroId;
        }
        if (request.query.fechaInicio && request.query.fechaFin) {
            filtros.fechaInicio = request.query.fechaInicio;
            filtros.fechaFin = request.query.fechaFin;
        }
        
        const resultado = await obtenerAudiometrias(filtros);
        
        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function post_actualizarAudiometria(request) {
    try {
        const body = await request.body.json();
        const { _id, ...datos } = body;
        
        if (!_id) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro '_id' es requerido" }
            });
        }
        
        const resultado = await actualizarAudiometria(_id, datos);
        
        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function get_audiometriaPorIdGeneral(request) {
    try {
        const idGeneral = request.query.idGeneral;

        if (!idGeneral) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro 'idGeneral' es requerido" }
            });
        }

        const resultado = await wixData.query("AUDIOMETRIA")
            .eq("idGeneral", idGeneral)
            .find();

        if (resultado.items.length > 0) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { success: true, data: resultado.items }
            });
        } else {
            return notFound({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { success: false, message: "No se encontraron audiometrías para ese idGeneral" }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

// ENDPOINTS PARA BASE DE DATOS VISUAL
export async function get_visuales(request) {
    try {
        const filtros = {};
        
        // Obtener filtros de query params si existen
        if (request.query.numeroId) {
            filtros.numeroId = request.query.numeroId;
        }
        if (request.query.fechaInicio && request.query.fechaFin) {
            filtros.fechaInicio = request.query.fechaInicio;
            filtros.fechaFin = request.query.fechaFin;
        }
        
        const resultado = await obtenerVisuales(filtros);
        
        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function post_actualizarVisual(request) {
    try {
        const body = await request.body.json();
        const { _id, ...datos } = body;
        
        if (!_id) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro '_id' es requerido" }
            });
        }
        
        const resultado = await actualizarVisual(_id, datos);
        
        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function get_visualPorIdGeneral(request) {
    try {
        const idGeneral = request.query.idGeneral;

        if (!idGeneral) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro 'idGeneral' es requerido" }
            });
        }

        const resultado = await wixData.query("VISUAL")
            .eq("idGeneral", idGeneral)
            .find();

        if (resultado.items.length > 0) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { success: true, data: resultado.items }
            });
        } else {
            return notFound({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { success: false, message: "No se encontraron registros visuales para ese idGeneral" }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

// ENDPOINTS PARA BASE DE DATOS ADCTEST
export async function get_adctests(request) {
    try {
        const filtros = {};
        
        // Obtener filtros de query params si existen
        if (request.query.numeroId) {
            filtros.numeroId = request.query.numeroId;
        }
        if (request.query.fechaInicio && request.query.fechaFin) {
            filtros.fechaInicio = request.query.fechaInicio;
            filtros.fechaFin = request.query.fechaFin;
        }
        
        const resultado = await obtenerAdcTests(filtros);
        
        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function post_actualizarAdcTest(request) {
    try {
        const body = await request.body.json();
        const { _id, ...datos } = body;

        if (!_id) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro '_id' es requerido" }
            });
        }

        const resultado = await actualizarAdcTest(_id, datos);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function get_adctestPorIdGeneral(request) {
    try {
        const idGeneral = request.query.idGeneral;

        if (!idGeneral) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro 'idGeneral' es requerido" }
            });
        }

        const resultado = await wixData.query("ADCTEST")
            .eq("idGeneral", idGeneral)
            .find();

        if (resultado.items.length > 0) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { success: true, data: resultado.items }
            });
        } else {
            return notFound({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { success: false, message: "No se encontraron ADCTEST para ese idGeneral" }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

// ENDPOINTS PARA CREAR NUEVOS REGISTROS
export async function post_crearAudiometria(request) {
    try {
        const body = await request.body.json();

        const resultado = await crearAudiometria(body);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function post_crearVisual(request) {
    try {
        const body = await request.body.json();

        const resultado = await crearVisual(body);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export async function post_crearAdcTest(request) {
    try {
        const body = await request.body.json();

        const resultado = await crearAdcTest(body);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

export function get_historiaClinicaPorId(request) {
    console.log("Buscando información de HistoriaClinica por _id");

    const { _id } = request.query;

    if (!_id) {
        return badRequest({ body: { message: "Falta el parámetro '_id'" } });
    }

    return wixData.get("HistoriaClinica", _id).then(item => {
        if (!item) {
            return notFound({ body: { message: "No se encontró información para el paciente con ese _id" } });
        }

        return ok({
            headers: { "Content-Type": "application/json" },
            body: {
                _id,
                data: item
            }
        });
    }).catch(error => {
        console.error("Error al obtener información:", error);
        return serverError({ body: { message: "Error al obtener la información" } });
    });
}

// ENDPOINT PARA ACTUALIZAR HISTORIA CLÍNICA
export async function post_actualizarHistoriaClinica(request) {
    try {
        const body = await request.body.json();
        const { _id, ...datos } = body;

        if (!_id) {
            return badRequest({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: "El parámetro '_id' es requerido" }
            });
        }

        const resultado = await actualizarHistoriaClinica(_id, datos);

        if (resultado.success) {
            return ok({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: resultado
            });
        } else {
            return serverError({
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
                body: { error: resultado.error }
            });
        }
    } catch (error) {
        return serverError({
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: { error: error.message }
        });
    }
}

//para digital ocean
export function get_consultarUsuarioPorId(request) {
    console.log("Buscando usuario por _id para alertas WhatsApp");

    const { _id } = request.query;

    if (!_id) {
        return badRequest({ body: { message: "Falta el parámetro '_id'" } });
    }

    return wixData.get("HistoriaClinica", _id).then(item => {
        if (!item) {
            return notFound({ body: { message: "Usuario no encontrado con ese _id" } });
        }

        return ok({
            headers: { "Content-Type": "application/json" },
            body: {
                success: true,
                usuario: {
                    _id: item._id,
                    primerNombre: item.primerNombre,
                    primerApellido: item.primerApellido,
                    celular: item.celular,
                    numeroId: item.numeroId,
                    empresa: item.empresa,
                    codEmpresa: item.codEmpresa
                }
            }
        });
    }).catch(error => {
        console.error("Error consultando usuario por _id:", error);
        return serverError({
            body: {
                success: false,
                message: "Error al obtener información del usuario",
                error: error.message
            }
        });
    });
}

// ============================================================================
// ENDPOINTS PARA PANEL MÉDICO
// ============================================================================

/**
 * GET: Obtener estadísticas diarias del médico
 * URL: /_functions/estadisticasMedico?medicoCode=CODIGO
 */
export async function get_estadisticasMedico(request) {
  const { medicoCode } = request.query;

  if (!medicoCode) {
    return badRequest({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: "El parámetro 'medicoCode' es requerido" }
    });
  }

  try {
    const resultado = await obtenerEstadisticasMedico(medicoCode);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado.data
      });
    } else {
      return serverError({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: resultado.error }
      });
    }
  } catch (error) {
    console.error("Error en get_estadisticasMedico:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: error.message }
    });
  }
}

/**
 * GET: Obtener lista paginada de pacientes pendientes
 * URL: /_functions/pacientesPendientes?medicoCode=CODIGO&page=1&pageSize=10
 */
export async function get_pacientesPendientes(request) {
  const { medicoCode, page = "1", pageSize = "10" } = request.query;

  if (!medicoCode) {
    return badRequest({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: "El parámetro 'medicoCode' es requerido" }
    });
  }

  try {
    const resultado = await obtenerPacientesPendientes(
      medicoCode,
      parseInt(page),
      parseInt(pageSize)
    );

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado.data
      });
    } else {
      return serverError({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: resultado.error }
      });
    }
  } catch (error) {
    console.error("Error en get_pacientesPendientes:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
        },
      body: { error: error.message }
    });
  }
}

/**
 * GET: Buscar paciente por número de documento
 * URL: /_functions/buscarPaciente?documento=123456&medicoCode=CODIGO
 */
export async function get_buscarPaciente(request) {
  const { documento, medicoCode } = request.query;

  if (!documento || !medicoCode) {
    return badRequest({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: "Los parámetros 'documento' y 'medicoCode' son requeridos" }
    });
  }

  try {
    const resultado = await buscarPacientePorDocumento(documento, medicoCode);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado.data
      });
    } else {
      return notFound({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { success: false, message: resultado.message }
      });
    }
  } catch (error) {
    console.error("Error en get_buscarPaciente:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: error.message }
    });
  }
}

/**
 * POST: Marcar paciente como "No Contesta"
 * URL: /_functions/marcarNoContesta
 * Body: { "patientId": "abc123" }
 */
export async function post_marcarNoContesta(request) {
  try {
    const body = await request.body.json();
    const { patientId } = body;

    if (!patientId) {
      return badRequest({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: "El parámetro 'patientId' es requerido" }
      });
    }

    const resultado = await marcarPacienteNoContesta(patientId);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { success: true, message: resultado.message }
      });
    } else {
      return serverError({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: resultado.error }
      });
    }
  } catch (error) {
    console.error("Error en post_marcarNoContesta:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: error.message }
    });
  }
}

/**
 * GET: Obtener detalles completos del paciente
 * URL: /_functions/detallesPaciente?documento=123456
 */
export async function get_detallesPaciente(request) {
  const { documento } = request.query;

  if (!documento) {
    return badRequest({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: "El parámetro 'documento' es requerido" }
    });
  }

  try {
    const resultado = await obtenerDetallesPaciente(documento);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado.data
      });
    } else {
      return notFound({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { success: false, message: resultado.message }
      });
    }
  } catch (error) {
    console.error("Error en get_detallesPaciente:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: error.message }
    });
  }
}
/**
 * GET: Obtener TODOS los programados hoy (incluyendo atendidos) - DEBUG
 * URL: /_functions/todosProgramadosHoy?medicoCode=CODIGO
 */
export async function get_todosProgramadosHoy(request) {
  const { medicoCode } = request.query;

  if (!medicoCode) {
    return badRequest({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: "El parámetro 'medicoCode' es requerido" }
    });
  }

  try {
    const resultado = await obtenerTodosProgramadosHoy(medicoCode);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado.data
      });
    } else {
      return serverError({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: resultado.error }
      });
    }
  } catch (error) {
    console.error("Error en get_todosProgramadosHoy:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: error.message }
    });
  }
}

/**
 * PATCH: Actualizar historia clínica durante videollamada
 * URL: /_functions/actualizarHistoriaClinica,
  obtenerDatosFormularioPorHistoriaId,
  obtenerDatosCompletosParaFormulario
 * Body: { numeroId: string, datos: { talla, peso, mdAntecedentes, ... } }
 */
export async function patch_actualizarHistoriaClinica(request) {
  try {
    const { numeroId, datos } = await request.body.json();

    if (!numeroId) {
      return badRequest({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: "El parámetro 'numeroId' es requerido" }
      });
    }

    if (!datos || typeof datos !== 'object') {
      return badRequest({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: "El parámetro 'datos' es requerido y debe ser un objeto" }
      });
    }

    const resultado = await actualizarHistoriaClinica(numeroId, datos);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado.data
      });
    } else {
      return serverError({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: resultado.error }
      });
    }
  } catch (error) {
    console.error("Error en patch_actualizarHistoriaClinica:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: error.message }
    });
  }
}
/**
 * GET: Obtener datos completos para formulario médico (HistoriaClinica + FORMULARIO)
 * URL: /_functions/datosCompletosFormulario?numeroId=DOCUMENTO
 */
export async function get_datosCompletosFormulario(request) {
  const { numeroId } = request.query;

  if (!numeroId) {
    return badRequest({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: "El parámetro 'numeroId' es requerido" }
    });
  }

  try {
    const resultado = await obtenerDatosCompletosParaFormulario(numeroId);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado.data
      });
    } else {
      return serverError({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { error: resultado.error }
      });
    }
  } catch (error) {
    console.error("Error en get_datosCompletosFormulario:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { error: error.message }
    });
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ENDPOINTS PARA HISTORIA CLÍNICA EN VIDEOLLAMADA
 * ════════════════════════════════════════════════════════════════════════════
 */

/**
 * GET: Obtener historia clínica completa por documento
 * URL: /_functions/getHistoriaClinica?documento=123456789
 */
export async function get_getHistoriaClinica(request) {
  const { documento } = request.query;

  if (!documento) {
    return badRequest({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { success: false, error: "El parámetro 'documento' es requerido" }
    });
  }

  try {
    const resultado = await obtenerHistoriaClinica(documento);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado
      });
    } else {
      return notFound({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado
      });
    }
  } catch (error) {
    console.error("Error en get_getHistoriaClinica:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { success: false, error: error.message }
    });
  }
}

/**
 * POST: Actualizar historia clínica durante videollamada
 * URL: /_functions/updateHistoriaClinica
 * Body: { numeroId: "123456789", mdAntecedentes: "...", talla: "170", peso: "70", ... }
 */
export async function post_updateHistoriaClinica(request) {
  try {
    const body = await request.body.json();
    const { numeroId, ...datos } = body;

    if (!numeroId) {
      return badRequest({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: { success: false, error: "El parámetro 'numeroId' es requerido" }
      });
    }

    const resultado = await actualizarHistoriaClinica(numeroId, datos);

    if (resultado.success) {
      return ok({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado
      });
    } else {
      return serverError({
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        },
        body: resultado
      });
    }
  } catch (error) {
    console.error("Error en post_updateHistoriaClinica:", error);
    return serverError({
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: { success: false, error: error.message }
    });
  }
}

