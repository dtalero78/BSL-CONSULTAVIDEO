import { toFile } from 'openai/uploads';
import { openai } from './openai.service';

/**
 * Transcripción de la consulta médica a partir de un audio grabado en el
 * navegador del médico (botón de micrófono en el panel de historia clínica).
 *
 * Flujo:
 *   1. El frontend mezcla el micrófono del médico + el audio remoto del
 *      paciente (Web Audio API) y graba con MediaRecorder.
 *   2. Al detener, sube el audio crudo a POST /api/video/transcribe-consulta/:id
 *   3. Whisper transcribe el diálogo completo (español).
 *   4. GPT-4o-mini sintetiza y devuelve SOLO los campos clínicos editables.
 *   5. El frontend vuelca esos campos al formulario para que el médico los
 *      revise y guarde (NO se autoguarda).
 *
 * No persiste nada en la base de datos: deja al médico la decisión final.
 */

// Campos editables del formulario de historia clínica que la IA puede
// rellenar. El frontend solo aplica las claves de esta lista.
// Se excluyen a propósito `mdConceptoFinal` (decisión clínica + campo
// obligatorio que el médico debe seleccionar) y `mdObsParaMiDocYa`.
export const EXTRACTABLE_FIELDS = [
  'mdAntecedentes',
  'mdDx1',
  'mdDx2',
  'mdObservacionesCertificado',
  'mdRecomendacionesMedicasAdicionales',
  'talla',
  'peso',
] as const;

type ExtractableField = (typeof EXTRACTABLE_FIELDS)[number];
const FIELDS_SET = new Set<string>(EXTRACTABLE_FIELDS);

const EXTRACTION_PROMPT = `
Eres un asistente clínico que sintetiza una historia clínica a partir de la
transcripción completa de una consulta médica (medicina laboral / ocupacional)
en español. Recibes el texto íntegro de la conversación entre el médico y el
paciente.

OBJETIVO: leer toda la conversación como un todo y diligenciar los campos
clínicos como lo haría el médico que resume la consulta. NO copies frases
literales: interpretá, integrá y parafraseá en lenguaje clínico neutro en
tercera persona.

Devuelve un objeto JSON con tantas claves como puedas justificar a partir de la
conversación. Para cada clave que incluyas, en algún punto de la transcripción
debe haberse tratado el tema. Si el tema nunca apareció, omití la clave.

Claves permitidas:
  - mdAntecedentes (string): antecedentes médicos relevantes (personales y
    familiares) mencionados: enfermedades previas, cirugías, hábitos (fuma,
    licor), condiciones crónicas, alergias, medicamentos. Integralos en una
    redacción coherente.
  - mdDx1 (string): diagnóstico o impresión diagnóstica principal, si el médico
    lo enuncia. Breve.
  - mdDx2 (string): diagnóstico secundario, si aplica. Breve.
  - mdObservacionesCertificado (string): hallazgos del examen, observaciones
    clínicas y síntomas relevantes (incluyendo descripción del dolor: zona,
    tipo, evolución) resumidos en uno o dos párrafos.
  - mdRecomendacionesMedicasAdicionales (string): recomendaciones, conductas o
    indicaciones que el médico haya dado durante la consulta. NO sugieras pausas
    activas. NO inventes recomendaciones que el médico no haya mencionado.
  - talla (string, cm): SOLO si la estatura se mencionó con un número explícito.
    Convertir m→cm (ej. "1.70 m" → "170").
  - peso (string, kg): SOLO si el peso se mencionó con un número explícito
    (ej. "pesa 72 kilos" → "72").

REGLAS DURAS:
  1. Para talla y peso: SOLO incluir si el valor está explícito en el
     transcript. NUNCA inferir números del contexto ("se ve delgado" no es peso).
  2. Para los campos de texto: SI hay material sobre el tema, sintetizarlo en
     clínico tercera persona. SI no apareció, omitir la clave.
  3. talla y peso como strings con el número en unidades indicadas (cm, kg).
  4. Texto en español neutro, tercera persona, lenguaje clínico conciso.
  5. NO inventes diagnósticos, conductas ni datos que el médico no haya
     abordado. Ante la duda, omití la clave.

Devuelve únicamente el JSON, sin texto adicional ni markdown.
`.trim();

export interface TranscriptionResult {
  transcript: string;
  fields: Partial<Record<ExtractableField, string>>;
}

class ConsultaTranscriptionService {
  /**
   * Transcribe el audio con Whisper. Acepta el buffer crudo (webm/opus, mp4,
   * etc.) y devuelve el texto en español. Whisper acepta archivos de hasta
   * 25 MB; una consulta mono comprimida con opus cabe de sobra.
   */
  async transcribeAudio(audioBuffer: Buffer, contentType: string): Promise<string> {
    const ext = this.extensionFromContentType(contentType);
    const audioFile = await toFile(audioBuffer, `consulta.${ext}`, { type: contentType });

    const resp = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'es',
    });

    return (resp as any)?.text?.trim?.() ?? '';
  }

  /**
   * Extrae los campos clínicos editables del transcript con GPT-4o-mini.
   * Filtra el resultado a EXTRACTABLE_FIELDS y descarta valores vacíos.
   */
  async extractFields(transcript: string): Promise<Partial<Record<ExtractableField, string>>> {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: `Transcripción de la consulta:\n\n${transcript}` },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content?.trim() || '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.error('[ConsultaTranscription] GPT no devolvió JSON válido:', raw.slice(0, 200));
      return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const obj = parsed as Record<string, unknown>;
    const fields: Partial<Record<ExtractableField, string>> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (!FIELDS_SET.has(key)) continue;
      if (value === null || value === undefined) continue;
      const str = String(value).trim();
      if (!str) continue;
      fields[key as ExtractableField] = str;
    }
    return fields;
  }

  /**
   * Orquestador: transcribe + extrae. Nunca lanza el error de extracción
   * (si GPT falla, igual devuelve el transcript). Sí propaga el error de
   * Whisper (sin transcript no hay nada que hacer).
   */
  async transcribeAndExtract(audioBuffer: Buffer, contentType: string): Promise<TranscriptionResult> {
    const t0 = Date.now();
    const transcript = await this.transcribeAudio(audioBuffer, contentType);
    console.log(`[ConsultaTranscription] Whisper OK, ${transcript.length} chars`);

    if (!transcript) {
      return { transcript: '', fields: {} };
    }

    let fields: Partial<Record<ExtractableField, string>> = {};
    try {
      fields = await this.extractFields(transcript);
      console.log(`[ConsultaTranscription] Campos extraídos: [${Object.keys(fields).join(', ')}]`);
    } catch (e: any) {
      console.error('[ConsultaTranscription] Error extrayendo campos:', e?.message || e);
    }

    console.log(`[ConsultaTranscription] Listo en ${Date.now() - t0} ms`);
    return { transcript, fields };
  }

  private extensionFromContentType(contentType: string): string {
    const ct = (contentType || '').toLowerCase();
    if (ct.includes('webm')) return 'webm';
    if (ct.includes('mp4') || ct.includes('m4a')) return 'mp4';
    if (ct.includes('ogg')) return 'ogg';
    if (ct.includes('wav')) return 'wav';
    if (ct.includes('mpeg') || ct.includes('mp3')) return 'mp3';
    return 'webm';
  }
}

export default new ConsultaTranscriptionService();
