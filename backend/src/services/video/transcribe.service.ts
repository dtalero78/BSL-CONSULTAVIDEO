// ============================================================================
// transcribe.service — transcripción de la grabación de una consulta con
// Amazon Transcribe, para el módulo de calidad.
//
// El MP4 de la consulta ya vive en S3 (Chime → chime-recording.service). En vez
// de descargarlo, extraer audio con ffmpeg y mandarlo a Whisper (lo que hace hoy
// bsl-plataforma para Twilio), Transcribe lee el MP4 directo de S3 y saca el
// audio él mismo. Corre en AWS, donde ya está el rol IAM y el bucket.
//
// El módulo de calidad (en bsl-plataforma, DO) NO maneja credenciales de AWS:
// consulta este servicio por HTTP (endpoint protegido con token interno) y sólo
// recibe el texto ya transcrito, que luego evalúa con Anthropic como siempre.
//
// Amazon Transcribe es asíncrono (job batch). El servicio es idempotente y se
// consulta por sondeo: la primera llamada arranca el job, las siguientes
// informan el avance, y cuando termina devuelve el transcript.
// ============================================================================
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from '@aws-sdk/client-transcribe';
import { chimeRecordingService } from './chime-recording.service';

const REGION = process.env.CHIME_CONTROL_REGION || process.env.AWS_REGION || 'us-east-1';
const BUCKET = process.env.RECORDINGS_BUCKET || '';
// Español latinoamericano (no hay es-CO en Transcribe; es-US es el más cercano).
const LANGUAGE = process.env.TRANSCRIBE_LANGUAGE || 'es-US';

export type TranscribeStatus =
  | 'no_recording'   // aún no hay MP4 para la sala (grabación en proceso o inexistente)
  | 'in_progress'    // job de Transcribe corriendo
  | 'completed'      // listo, `transcript` presente
  | 'failed';        // el job falló

export interface TranscribeResult {
  status: TranscribeStatus;
  transcript?: string;
  reason?: string;
}

class TranscribeService {
  private client = new TranscribeClient({ region: REGION });

  /**
   * Nombre de job determinístico por sala: así la operación es idempotente
   * (arrancar dos veces reusa el mismo job) sin necesidad de una tabla propia.
   * Transcribe exige [0-9a-zA-Z._-], máx 200.
   */
  private jobName(roomName: string): string {
    return `bsl-tx-${roomName}`.replace(/[^0-9a-zA-Z._-]/g, '-').slice(0, 200);
  }

  async getOrStartTranscription(roomName: string): Promise<TranscribeResult> {
    if (!BUCKET) return { status: 'failed', reason: 'RECORDINGS_BUCKET no configurado' };
    const jobName = this.jobName(roomName);

    // ¿Ya existe un job para esta sala?
    let job;
    try {
      const got = await this.client.send(new GetTranscriptionJobCommand({ TranscriptionJobName: jobName }));
      job = got.TranscriptionJob;
    } catch {
      job = undefined; // BadRequest/NotFound → no existe todavía
    }

    if (!job) {
      // No hay job: arrancarlo si el MP4 ya está en S3.
      const rec = await chimeRecordingService.getRecordingUrl(roomName);
      if (!rec || !rec.key) {
        // Sin registro, o la concatenación aún no escribió el MP4.
        return { status: 'no_recording' };
      }
      try {
        await this.client.send(
          new StartTranscriptionJobCommand({
            TranscriptionJobName: jobName,
            LanguageCode: LANGUAGE as any,
            MediaFormat: 'mp4',
            Media: { MediaFileUri: `s3://${BUCKET}/${rec.key}` },
            // Separación de hablantes: en una consulta son 2 (médico y paciente).
            // Le da al evaluador quién dijo qué, algo que Whisper no hace.
            Settings: { ShowSpeakerLabels: true, MaxSpeakerLabels: 2 },
          })
        );
      } catch (err: any) {
        // Si otro request lo arrancó primero (carrera), no es error.
        if (err?.name !== 'ConflictException') {
          return { status: 'failed', reason: err?.message || 'StartTranscriptionJob falló' };
        }
      }
      return { status: 'in_progress' };
    }

    const s = job.TranscriptionJobStatus;
    if (s === 'QUEUED' || s === 'IN_PROGRESS') return { status: 'in_progress' };
    if (s === 'FAILED') return { status: 'failed', reason: job.FailureReason || 'Transcribe FAILED' };

    if (s === 'COMPLETED') {
      const uri = job.Transcript?.TranscriptFileUri;
      if (!uri) return { status: 'failed', reason: 'Job completado sin TranscriptFileUri' };
      try {
        const transcript = await this.fetchTranscript(uri);
        return { status: 'completed', transcript };
      } catch (err: any) {
        return { status: 'failed', reason: `No se pudo leer el transcript: ${err?.message}` };
      }
    }

    return { status: 'in_progress' };
  }

  /**
   * Descarga el JSON de Transcribe (URL prefirmada) y lo convierte en texto
   * legible con turnos por hablante si hay diarización.
   */
  private async fetchTranscript(uri: string): Promise<string> {
    const resp = await fetch(uri);
    if (!resp.ok) throw new Error(`HTTP ${resp.status} al descargar el transcript`);
    const data: any = await resp.json();

    const items: any[] = data?.results?.items || [];
    const speakerSegments: any[] = data?.results?.speaker_labels?.segments || [];

    // Sin diarización: devolver el transcript plano.
    if (!speakerSegments.length) {
      return data?.results?.transcripts?.[0]?.transcript || '';
    }

    // Con diarización: agrupar palabras por turno de hablante en orden temporal.
    // Cada item con start_time cae dentro de un segmento de speaker_labels.
    const labelForTime = (t: number): string => {
      for (const seg of speakerSegments) {
        if (t >= parseFloat(seg.start_time) && t <= parseFloat(seg.end_time)) return seg.speaker_label;
      }
      return 'spk';
    };

    const lines: string[] = [];
    let current: string | null = null;
    let buffer: string[] = [];
    const flush = () => {
      if (buffer.length) lines.push(`${current}: ${buffer.join(' ').replace(/\s+([.,?!])/g, '$1')}`);
      buffer = [];
    };

    for (const it of items) {
      const content = it.alternatives?.[0]?.content;
      if (!content) continue;
      if (it.type === 'punctuation') {
        if (buffer.length) buffer[buffer.length - 1] += content;
        continue;
      }
      const spk = labelForTime(parseFloat(it.start_time));
      if (spk !== current) {
        flush();
        current = spk;
      }
      buffer.push(content);
    }
    flush();

    // Renombrar spk_0/spk_1 a algo legible (no sabemos quién es quién con certeza).
    return lines
      .map((l) => l.replace(/^spk_0:/, 'Hablante 1:').replace(/^spk_1:/, 'Hablante 2:'))
      .join('\n');
  }
}

export const transcribeService = new TranscribeService();
