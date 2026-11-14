/**
 * Amazon Chime SDK implementation of `VideoEngine`.
 *
 * Chime's data model differs from Twilio's in two important ways that shape
 * this file:
 *
 * 1. Video is tile-based, not track-based: `audioVideo.startLocalVideoTile()`
 *    creates a tile, remote tiles arrive via the `videoTileDidUpdate`
 *    observer callback, and you bind a `<video>` element with
 *    `bindVideoElement(tileId, el)`. There is no per-participant "video
 *    track" object to hand to a component the way Twilio has.
 * 2. Audio is meeting-wide, not per-participant: Chime mixes every remote
 *    attendee's audio into a single output stream that you bind ONCE with
 *    `bindAudioElement(el)`. There's no API to bind one remote attendee's
 *    audio to one `<audio>` element the way `Participant.tsx` expects for
 *    Twilio. To keep `Participant.tsx` provider-agnostic, this engine binds
 *    the mixed meeting audio to a single hidden `<audio>` element that it
 *    owns (independent of React's render tree, so it survives thumbnails
 *    mounting/unmounting), and gives every remote `NormalizedParticipant` a
 *    no-op `audioTrackRef` — it exists (so the "🔇 Silenciado" UI indicator
 *    reflects presence/mute state via the volume indicator callback) but its
 *    attach()/detach() don't do real binding, since that's already handled
 *    globally. See `ChimeSharedAudioRef` below.
 *
 * Background blur/replacement is applied by swapping the local camera device
 * for a `DefaultVideoTransformDevice` wrapping a
 * `BackgroundBlurVideoFrameProcessor` / `BackgroundReplacementVideoFrameProcessor`
 * — this is the officially documented Chime SDK pattern (see
 * `ChimeVideoEngineLike` usage from `useBackgroundEffects.ts`).
 *
 * Server-side recording and Chime screen/content-share are out of scope for
 * this pass (see CLAUDE.md / task scope: core video + background effects +
 * client-side transcription audio only).
 */
import {
  ConsoleLogger,
  LogLevel,
  DefaultDeviceController,
  DefaultMeetingSession,
  MeetingSessionConfiguration,
  DefaultVideoTransformDevice,
  BackgroundBlurVideoFrameProcessor,
  BackgroundReplacementVideoFrameProcessor,
} from 'amazon-chime-sdk-js';
import type {
  AudioVideoObserver,
  VideoTileState,
  MeetingSession,
  Device,
  VideoFrameProcessor,
} from 'amazon-chime-sdk-js';
import {
  VideoEngine,
  VideoJoinConfig,
  NormalizedParticipant,
  NormalizedVideoRef,
  LocalVideoHandle,
  ChimeVideoEngineLike,
  createEmitter,
} from './video-engine';
import { getRemoteAudioElement } from './remote-audio';

/**
 * El pipeline de GRABACIÓN (Media Capture Pipeline) se une al meeting como un
 * attendee "fantasma" con ExternalUserId tipo "aws:MediaPipeline-...". No es una
 * persona: no debe renderizarse como participante (si no, aparece un avatar
 * vacío ocupando la vista principal). Los usuarios reales nunca usan el prefijo
 * "aws:" (su ExternalUserId es el nombre saneado).
 */
function isRecorderAttendee(externalUserId?: string | null): boolean {
  return !!externalUserId && externalUserId.toLowerCase().startsWith('aws:');
}

/**
 * Foto del equipo y la conexión de quien entra a la llamada.
 *
 * Cuando un médico reporta "se ve mal" o "no me escuchan", lo primero que hace
 * falta es saber CON QUÉ está atendiendo. Esto viaja una vez al conectar y queda
 * en el log del servidor, así el diagnóstico no depende de que la persona sepa
 * describir su equipo. `navigator.connection` es la estimación del navegador
 * (solo Chrome); la medida real la da Chime durante la llamada (ver connection-poor).
 */
function infoDelEquipo(): Record<string, string | number> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number };
  };
  const out: Record<string, string | number> = {
    nucleos: nav.hardwareConcurrency ?? 0,
    ramGb: nav.deviceMemory ?? 0,
    pantalla: `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}`,
    navegador: (navigator.userAgent || '').slice(0, 120),
    // Navegador interno de una app (WhatsApp/Facebook en Android = WebView). Ahí
    // el audio solo suena si se desbloquea con un toque (ver remote-audio.ts).
    webview: /; wv\)|Version\/4\.0 Chrome/.test(navigator.userAgent || '') ? 1 : 0,
  };
  const con = nav.connection;
  if (con) {
    if (con.effectiveType) out.red = String(con.effectiveType);
    if (typeof con.downlink === 'number') out.downlinkMbps = con.downlink;
    if (typeof con.rtt === 'number') out.rttMs = con.rtt;
  }
  return out;
}

/**
 * Bound once per meeting (see class docblock). `attach()`/`detach()` are
 * no-ops beyond existing — the real binding happens once in `connect()`.
 */
class ChimeSharedAudioRef implements NormalizedVideoRef {
  attach(_el: HTMLVideoElement | HTMLAudioElement): void {
    /* no-op: see ChimeVideoEngine class docblock */
  }
  detach(): void {
    /* no-op: see ChimeVideoEngine class docblock */
  }
}
const sharedAudioRef = new ChimeSharedAudioRef();

class ChimeVideoTileRef implements NormalizedVideoRef {
  private el: HTMLVideoElement | null = null;

  constructor(private engine: ChimeVideoEngine, private tileId: number) {}

  attach(el: HTMLVideoElement | HTMLAudioElement): void {
    this.el = el as HTMLVideoElement;
    this.engine.bindTile(this.tileId, this.el);
  }

  detach(): void {
    this.engine.unbindTile(this.tileId);
    this.el = null;
  }

  /**
   * Vuelve a enlazar EL MISMO elemento cuando Chime cambia el stream por debajo
   * sin cambiar el tileId. Pasa cuando el otro extremo republica su video —el
   * caso típico es el médico activando el fondo virtual—: sin esto el <video>
   * se queda apuntando al stream viejo y el otro lo ve en negro.
   */
  rebind(): void {
    if (this.el) this.engine.bindTile(this.tileId, this.el);
  }
}

export class ChimeVideoEngine implements VideoEngine, ChimeVideoEngineLike {
  readonly provider = 'chime' as const;

  private session: MeetingSession | null = null;
  private observer: AudioVideoObserver | null = null;
  private hiddenAudioEl: HTMLAudioElement | null = null;

  private localAttendeeId = '';
  private participants = new Map<string, NormalizedParticipant>();
  private tileIdByAttendee = new Map<string, number>();
  // Último stream enlazado por attendee: permite detectar que Chime cambió el
  // stream de un tile sin cambiar su tileId (ver handleTileUpdate).
  private streamByAttendee = new Map<string, MediaStream | null>();

  private chosenVideoDeviceId: Device | null = null;
  private localAudioStream: MediaStream | null = null;
  private remoteAudioStream: MediaStream | null = null;
  private currentVideoTransformDevice: DefaultVideoTransformDevice | null = null;

  private audioEnabled = true;
  private videoEnabled = true;

  // Telemetría de diagnóstico (ver reportar / reportarConexionPobre).
  private diagRoom = '';
  private diagIdentity = '';
  private diagRole: 'doctor' | 'patient' | undefined;
  private ultimasMetricas: Record<string, number> = {};
  private ultimoAvisoConexion = 0;

  // Audio remoto bloqueado por el navegador (ver remote-audio.ts).
  private remoteAudioBlocked = false;
  private remoteAudioBlockedChanged = createEmitter<[boolean]>();
  private audioCheckTimer: ReturnType<typeof setInterval> | null = null;
  private removeUnlockListeners: (() => void) | null = null;

  private participantConnected = createEmitter<[NormalizedParticipant]>();
  private participantDisconnected = createEmitter<[string]>();
  private disconnected = createEmitter<[]>();

  // `connect()` awaits several steps (device selection, bindAudioElement) after
  // subscribing to presence/tile events. Chime can deliver those events on the
  // very first signaling round-trip, which lands *during* those awaits — before
  // `useVideoRoom` has had a chance to call `onParticipantConnected()`. Buffer
  // participants discovered while `joining` is true and return them from
  // `connect()` instead of emitting, so no early arrival is dropped.
  private joining = false;
  private pendingInitialRemotes: NormalizedParticipant[] = [];

  async connect(config: VideoJoinConfig): Promise<{
    localParticipant: NormalizedParticipant;
    remoteParticipants: NormalizedParticipant[];
  }> {
    if (!config.meeting || !config.attendee) {
      throw new Error('El provider "chime" requiere `meeting` y `attendee`.');
    }

    this.joining = true;
    this.pendingInitialRemotes = [];

    const logger = new ConsoleLogger('bsl-chime', LogLevel.WARN);
    const deviceController = new DefaultDeviceController(logger);
    const configuration = new MeetingSessionConfiguration(config.meeting, config.attendee);
    const session = new DefaultMeetingSession(configuration, logger, deviceController);
    this.session = session;

    const attendee = config.attendee as { AttendeeId?: string };
    this.localAttendeeId = attendee.AttendeeId || config.identity;

    // Datos para la telemetría de diagnóstico.
    this.diagRoom = config.roomName;
    this.diagIdentity = config.identity;
    this.diagRole = config.role;

    const localParticipant = new NormalizedParticipant(this.localAttendeeId, config.identity, true);
    this.participants.set(this.localAttendeeId, localParticipant);

    // Observers/subscriptions must be wired before `start()` so we don't miss
    // presence/tile events for attendees already in the meeting.
    const observer: AudioVideoObserver = {
      videoTileDidUpdate: (tileState: VideoTileState) => this.handleTileUpdate(tileState),
      videoTileWasRemoved: (tileId: number) => this.handleTileRemoved(tileId),
      audioVideoDidStop: () => this.disconnected.emit(),
      // Telemetría: Chime avisa cuando la conexión se degrada. Guardamos las
      // últimas métricas para adjuntar bitrate/rtt reales al reporte.
      metricsDidReceive: (report: { getObservableMetrics?: () => Record<string, number> }) => {
        this.ultimasMetricas = report.getObservableMetrics?.() || {};
      },
      connectionDidBecomePoor: () => this.reportarConexionPobre('conexión pobre'),
      connectionDidSuggestStopVideo: () =>
        this.reportarConexionPobre('Chime sugiere apagar el video'),
    };
    session.audioVideo.addObserver(observer);
    this.observer = observer;

    session.audioVideo.realtimeSubscribeToAttendeeIdPresence(
      (attendeeId, present, externalUserId) => {
        if (attendeeId === this.localAttendeeId) return;
        // El pipeline de grabación se une como attendee "aws:MediaPipeline-...";
        // no es una persona → ignorarlo para que no aparezca como participante.
        if (isRecorderAttendee(externalUserId)) return;

        if (present) {
          let np = this.participants.get(attendeeId);
          const isNew = !np;
          if (!np) {
            np = new NormalizedParticipant(attendeeId, externalUserId || attendeeId, false);
            np.audioTrackRef = sharedAudioRef; // assume audio present until told otherwise
            this.participants.set(attendeeId, np);
          }
          session.audioVideo.realtimeSubscribeToVolumeIndicator(attendeeId, (_id, _volume, muted) => {
            const p = this.participants.get(attendeeId);
            if (!p) return;
            // Solo re-emitir cuando cambia el estado de mute (el indicador de
            // volumen se dispara constantemente; emitir siempre satura renders).
            const nextRef = muted ? null : sharedAudioRef;
            if (p.audioTrackRef !== nextRef) {
              p.audioTrackRef = nextRef;
              p.emitTracksChanged();
            }
          });
          if (isNew) this.announceParticipant(np);
        } else {
          this.participants.delete(attendeeId);
          this.tileIdByAttendee.delete(attendeeId);
          this.streamByAttendee.delete(attendeeId);
          this.participantDisconnected.emit(attendeeId);
        }
      }
    );

    // IMPORTANTE: conceder permiso de cámara/micrófono ANTES de listar/seleccionar
    // dispositivos. Sin permiso, enumerateDevices() devuelve deviceIds vacíos ('') y
    // startVideoInput('') se saltaría → nadie enviaría video (pantalla negra en ambos
    // lados). Este getUserMedia previo desbloquea los deviceIds reales.
    let hasVideoPermission = true;
    try {
      const permStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      permStream.getTracks().forEach((t) => t.stop());
    } catch {
      // Sin cámara o permiso de video denegado: intentar solo audio.
      hasVideoPermission = false;
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioOnly.getTracks().forEach((t) => t.stop());
      } catch {
        /* sin micrófono / sin permiso: la sesión sigue, solo recibe */
      }
    }

    // Seleccionar el primer dispositivo con deviceId real (ya con permiso concedido).
    const audioInputs = await session.audioVideo.listAudioInputDevices();
    const chosenAudioDeviceId = audioInputs.find((d) => d.deviceId)?.deviceId ?? null;
    if (chosenAudioDeviceId) {
      this.localAudioStream = (await session.audioVideo.startAudioInput(chosenAudioDeviceId)) || null;
      // El badge "🔇 Silenciado" del participante se muestra cuando audioTrackRef
      // es null. En Chime el audio es de reunión (no hay track por participante),
      // así que el LOCAL nunca tendría audioTrackRef → salía "Silenciado" SIEMPRE,
      // aunque el micrófono funcionara. Le damos un ref no-op mientras tenga mic y
      // no esté muteado; el attach del audio está guardado por !isLocal, así que
      // esto solo alimenta el indicador. toggleAudio lo actualiza en vivo.
      if (this.localAudioStream) {
        localParticipant.audioTrackRef = sharedAudioRef;
      }
    }

    if (hasVideoPermission) {
      // Fijar la calidad de captura a 640x360@15 CON LA API DEL SDK y ANTES de
      // abrir la cámara. Las constraints del device NO sirven: Chime arma su
      // propio getUserMedia a su default (960x540) y, si se pide después, reusa
      // ese stream en vez de re-adquirirlo → el tope no se aplicaba (la
      // telemetría lo delató: "Fondo corriendo a 960x540@15"). A 960x540 el
      // filtro de fondo procesa ~2.25x más píxeles, satura el hilo principal y
      // el médico deja de renderizar el tile del paciente ("se conecta pero no
      // se ve"). A 640x360 la carga baja a ~la mitad y el video del otro se pinta.
      session.audioVideo.chooseVideoInputQuality(640, 360, 15);
      const videoInputs = await session.audioVideo.listVideoInputDevices();
      const chosenVideoDeviceId = videoInputs.find((d) => d.deviceId)?.deviceId ?? null;
      if (chosenVideoDeviceId) {
        this.chosenVideoDeviceId = chosenVideoDeviceId;
        await session.audioVideo.startVideoInput(chosenVideoDeviceId);
      }
    }

    session.audioVideo.start();
    // Telemetría: con qué equipo/red entró esta persona (una vez, al conectar).
    this.reportar('session-info', infoDelEquipo());
    // Solo iniciar el tile local si efectivamente hay entrada de video.
    if (this.chosenVideoDeviceId) {
      session.audioVideo.startLocalVideoTile();
    }

    // Bind the meeting's mixed remote audio ONCE, to a hidden element
    // (decoupled from whichever <Participant> components mount). Es el elemento
    // compartido que la página ya desbloqueó en el clic de "Unirse".
    this.hiddenAudioEl = getRemoteAudioElement();
    await session.audioVideo.bindAudioElement(this.hiddenAudioEl);
    // El SDK solo pone autoplay=true y NUNCA verifica si el navegador lo dejó
    // sonar. Lo verificamos nosotros: al enlazar y luego periódicamente (el
    // stream remoto llega unos segundos después, cuando entra el otro).
    void this.ensureRemoteAudioPlaying();
    this.audioCheckTimer = setInterval(() => void this.ensureRemoteAudioPlaying(), 3000);

    session.audioVideo
      .getCurrentMeetingAudioStream()
      .then((stream) => {
        this.remoteAudioStream = stream;
      })
      .catch(() => undefined);

    this.joining = false;
    const remoteParticipants = this.pendingInitialRemotes;
    this.pendingInitialRemotes = [];

    return { localParticipant, remoteParticipants };
  }

  /** Emits `participantConnected` immediately, or buffers it if still inside `connect()`. */
  private announceParticipant(np: NormalizedParticipant): void {
    if (this.joining) {
      this.pendingInitialRemotes.push(np);
    } else {
      this.participantConnected.emit(np);
    }
  }

  disconnect(): void {
    if (this.audioCheckTimer) {
      clearInterval(this.audioCheckTimer);
      this.audioCheckTimer = null;
    }
    this.removeUnlockListeners?.();
    this.removeUnlockListeners = null;
    this.setRemoteAudioBlocked(false);
    if (this.session) {
      try {
        if (this.observer) this.session.audioVideo.removeObserver(this.observer);
        this.session.audioVideo.unbindAudioElement();
        this.session.audioVideo.stop();
      } catch {
        /* noop */
      }
    }
    if (this.currentVideoTransformDevice) {
      this.currentVideoTransformDevice.stop().catch(() => undefined);
      this.currentVideoTransformDevice = null;
    }
    if (this.hiddenAudioEl) {
      // NO se quita del DOM: es el elemento compartido ya desbloqueado; si la
      // persona vuelve a entrar, se reutiliza y sigue sonando.
      this.hiddenAudioEl.pause();
      this.hiddenAudioEl.srcObject = null;
      this.hiddenAudioEl = null;
    }
    this.session = null;
    this.observer = null;
    this.participants.clear();
    this.tileIdByAttendee.clear();
    this.streamByAttendee.clear();
    this.localAudioStream = null;
    this.remoteAudioStream = null;
  }

  toggleAudio(): boolean {
    if (this.session) {
      if (this.audioEnabled) {
        this.session.audioVideo.realtimeMuteLocalAudio();
        this.audioEnabled = false;
      } else {
        this.session.audioVideo.realtimeUnmuteLocalAudio();
        this.audioEnabled = true;
      }
      // Reflejar el mute local en el indicador "🔇 Silenciado" del tile propio.
      const local = this.participants.get(this.localAttendeeId);
      if (local) {
        local.audioTrackRef = this.audioEnabled ? sharedAudioRef : null;
        local.emitTracksChanged();
      }
    }
    return this.audioEnabled;
  }

  toggleVideo(): boolean {
    if (this.session) {
      if (this.videoEnabled) {
        this.session.audioVideo.stopLocalVideoTile();
        this.videoEnabled = false;
      } else {
        this.session.audioVideo.startLocalVideoTile();
        this.videoEnabled = true;
      }
    }
    return this.videoEnabled;
  }

  onParticipantConnected(cb: (participant: NormalizedParticipant) => void): () => void {
    return this.participantConnected.subscribe(cb);
  }

  onParticipantDisconnected(cb: (sid: string) => void): () => void {
    return this.participantDisconnected.subscribe(cb);
  }

  onDisconnected(cb: () => void): () => void {
    return this.disconnected.subscribe(cb);
  }

  getLocalVideoHandle(): LocalVideoHandle | null {
    return this.session ? { provider: 'chime', engine: this } : null;
  }

  /** Stream del tile local (el que Chime ya está publicando). Prestado: no detenerlo. */
  getLocalVideoStream(): MediaStream | null {
    return this.streamByAttendee.get(this.localAttendeeId) || null;
  }

  getLocalAudioTracks(): MediaStreamTrack[] {
    return this.localAudioStream ? this.localAudioStream.getAudioTracks() : [];
  }

  getRemoteAudioTracks(): MediaStreamTrack[] {
    return this.remoteAudioStream ? this.remoteAudioStream.getAudioTracks() : [];
  }

  // ---- ChimeVideoEngineLike: background effects (see useBackgroundEffects.ts) ----

  async applyBackgroundBlur(): Promise<void> {
    if (!this.session) return;
    await this.disposeVideoTransform();
    const processor = await BackgroundBlurVideoFrameProcessor.create();
    if (!processor) throw new Error('El desenfoque de fondo no está soportado en este navegador.');
    await this.startVideoTransform([processor]);
  }

  async applyVirtualBackground(imageUrl: string): Promise<void> {
    if (!this.session) return;
    await this.disposeVideoTransform();
    try {
      const imageBlob = await (await fetch(imageUrl)).blob();
      const processor = await BackgroundReplacementVideoFrameProcessor.create(undefined, { imageBlob });
      if (!processor) throw new Error('El fondo virtual no está soportado en este navegador.');
      await this.startVideoTransform([processor]);
      // Telemetría: a qué resolución REAL quedó corriendo el fondo (¿el tope funcionó?).
      this.reportarResolucionFondo();
    } catch (err) {
      // Si el procesador falla (navegador sin soporte, WASM que no carga, equipo
      // lento), ya soltamos el device anterior: hay que devolver la cámara SIN
      // efecto. Quedarse sin video publicado es mucho peor que perder el fondo.
      if (this.chosenVideoDeviceId) {
        await this.session.audioVideo.startVideoInput(this.chosenVideoDeviceId).catch(() => undefined);
      }
      this.reportar('background-disabled', {
        motivo: (err as Error)?.message || 'error aplicando el fondo',
        nucleos: navigator.hardwareConcurrency ?? 0,
        navegador: (navigator.userAgent || '').slice(0, 120),
      });
      throw err;
    }
  }

  async removeVideoEffect(): Promise<void> {
    if (!this.session) return;
    await this.disposeVideoTransform();
    if (this.chosenVideoDeviceId) {
      await this.session.audioVideo.startVideoInput(this.chosenVideoDeviceId);
    }
  }

  private async startVideoTransform(processors: VideoFrameProcessor[]): Promise<void> {
    if (!this.session || !this.chosenVideoDeviceId) return;
    const logger = new ConsoleLogger('bsl-chime-bg', LogLevel.WARN);
    // Procesar el fondo a RESOLUCIÓN REDUCIDA (640x360 @ 15fps). El filtro corre
    // por frame (canvas + TFLite) y a 720p satura el hilo principal → Chime cree
    // que la conexión se cayó y reconecta (AudioJoinedFromAnotherDevice), tumbando
    // la llamada. A 640x360 la carga es ~1/4 y la llamada se mantiene estable.
    const innerDevice: Device =
      typeof this.chosenVideoDeviceId === 'string'
        ? {
            deviceId: { exact: this.chosenVideoDeviceId },
            width: { ideal: 640 },
            height: { ideal: 360 },
            frameRate: { ideal: 15 },
          }
        : this.chosenVideoDeviceId;
    const transformDevice = new DefaultVideoTransformDevice(logger, innerDevice, processors);
    await this.session.audioVideo.startVideoInput(transformDevice);
    this.currentVideoTransformDevice = transformDevice;
  }

  private async disposeVideoTransform(): Promise<void> {
    if (this.currentVideoTransformDevice) {
      await this.currentVideoTransformDevice.stop();
      this.currentVideoTransformDevice = null;
    }
  }

  // ---- Audio remoto bloqueado por el navegador ----

  isRemoteAudioBlocked(): boolean {
    return this.remoteAudioBlocked;
  }

  onRemoteAudioBlockedChanged(cb: (blocked: boolean) => void): () => void {
    return this.remoteAudioBlockedChanged.subscribe(cb);
  }

  /**
   * Reintenta sonar el audio remoto. Para que funcione hay que llamarlo
   * SINCRÓNICAMENTE desde un onClick (el botón "Toca para escuchar").
   */
  resumeRemoteAudio(): void {
    const el = this.hiddenAudioEl;
    if (!el) return;
    try {
      el.muted = false;
      el.play()
        .then(() => this.setRemoteAudioBlocked(false))
        .catch(() => undefined);
    } catch {
      /* noop */
    }
  }

  private setRemoteAudioBlocked(blocked: boolean): void {
    if (this.remoteAudioBlocked === blocked) return;
    this.remoteAudioBlocked = blocked;
    this.remoteAudioBlockedChanged.emit(blocked);
    if (this.session) {
      this.reportar(blocked ? 'audio-blocked' : 'audio-unlocked', {
        navegador: (navigator.userAgent || '').slice(0, 160),
      });
    }
  }

  /** Si hay audio remoto enlazado pero el elemento está en pausa, intenta sonarlo. */
  private async ensureRemoteAudioPlaying(): Promise<void> {
    const el = this.hiddenAudioEl;
    if (!el || !el.srcObject) return; // aún no llegó el audio del otro lado
    if (!el.paused) {
      this.setRemoteAudioBlocked(false);
      return;
    }
    try {
      await el.play();
      this.setRemoteAudioBlocked(false);
    } catch (err) {
      if ((err as DOMException)?.name === 'NotAllowedError') {
        this.setRemoteAudioBlocked(true);
        this.armUnlockOnAnyTouch();
      }
    }
  }

  /** Cualquier toque/tecla en la página desbloquea el audio (sin buscar el botón). */
  private armUnlockOnAnyTouch(): void {
    if (this.removeUnlockListeners) return;
    const eventos = ['pointerdown', 'touchend', 'click', 'keydown'] as const;
    const handler = () => {
      const el = this.hiddenAudioEl;
      if (!el) return;
      // play() debe llamarse aquí mismo, dentro del gesto, sin await previo.
      el.play()
        .then(() => {
          this.setRemoteAudioBlocked(false);
          this.removeUnlockListeners?.();
          this.removeUnlockListeners = null;
        })
        .catch(() => undefined);
    };
    eventos.forEach((e) => document.addEventListener(e, handler, true));
    this.removeUnlockListeners = () =>
      eventos.forEach((e) => document.removeEventListener(e, handler, true));
  }

  // ---- Telemetría de diagnóstico ----
  // Cuando un médico dice "se ve mal" / "no me escuchan", esto deja en el log del
  // servidor con qué equipo y red entró cada quien, y cuándo Chime reportó la
  // conexión como pobre. Nunca rompe la llamada (todo va en fire-and-forget).

  private reportar(
    evento:
      | 'session-info'
      | 'connection-poor'
      | 'background-applied'
      | 'background-disabled'
      | 'audio-blocked'
      | 'audio-unlocked',
    datos: Record<string, string | number | boolean>
  ): void {
    if (!this.diagRoom) return;
    void import('../services/api.service')
      .then((m) => m.default.reportClientDiag(this.diagRoom, evento, datos, this.diagIdentity, this.diagRole))
      .catch(() => undefined);
  }

  private reportarConexionPobre(motivo: string): void {
    const ahora = Date.now();
    // No spamear: Chime puede disparar el evento muy seguido.
    if (ahora - this.ultimoAvisoConexion < 30_000) return;
    this.ultimoAvisoConexion = ahora;
    const m = this.ultimasMetricas || {};
    const datos: Record<string, string | number> = { motivo };
    if (typeof m.availableOutgoingBitrate === 'number')
      datos.subidaKbps = Math.round(m.availableOutgoingBitrate / 1000);
    if (typeof m.availableIncomingBitrate === 'number')
      datos.bajadaKbps = Math.round(m.availableIncomingBitrate / 1000);
    if (typeof m.currentRoundTripTime === 'number')
      datos.rttMs = Math.round(m.currentRoundTripTime * 1000);
    if (typeof m.nackCount === 'number') datos.nack = Math.round(m.nackCount);
    console.warn(`[Chime] Conexión degradada: ${motivo}`);
    this.reportar('connection-poor', datos);
  }

  /**
   * Reporta la resolución REAL a la que quedó corriendo el fondo, leída del track
   * publicado (no del texto del SDK, que cambia entre versiones). Responde a
   * "¿el tope de 640x360 funcionó?". Se lee con un respiro para dar tiempo al
   * tile a asentarse.
   */
  private reportarResolucionFondo(): void {
    setTimeout(() => {
      try {
        const track = this.streamByAttendee.get(this.localAttendeeId)?.getVideoTracks()?.[0];
        const s = track?.getSettings?.();
        if (!s) return;
        console.log(`[Chime] Fondo corriendo a ${s.width}x${s.height}@${Math.round(s.frameRate ?? 0)}`);
        this.reportar('background-applied', {
          ancho: s.width ?? 0,
          alto: s.height ?? 0,
          fps: Math.round(s.frameRate ?? 0),
          nucleos: navigator.hardwareConcurrency ?? 0,
          navegador: (navigator.userAgent || '').slice(0, 120),
        });
      } catch {
        /* telemetría, nunca crítico */
      }
    }, 4000);
  }

  // ---- Internal: video tile <-> participant wiring ----

  /** @internal used by ChimeVideoTileRef */
  bindTile(tileId: number, el: HTMLVideoElement): void {
    this.session?.audioVideo.bindVideoElement(tileId, el);
  }

  /** @internal used by ChimeVideoTileRef */
  unbindTile(tileId: number): void {
    this.session?.audioVideo.unbindVideoElement(tileId);
  }

  private handleTileUpdate(tileState: VideoTileState): void {
    if (tileState.tileId === null || tileState.isContent) return;
    // Ignorar tiles del pipeline de grabación (attendee "aws:MediaPipeline-...").
    if (!tileState.localTile && isRecorderAttendee(tileState.boundExternalUserId)) return;
    const attendeeId = tileState.localTile ? this.localAttendeeId : tileState.boundAttendeeId;
    if (!attendeeId) return;

    let np = this.participants.get(attendeeId);
    if (!np) {
      // Tile updates can race ahead of the presence callback; create a placeholder.
      np = new NormalizedParticipant(
        attendeeId,
        tileState.boundExternalUserId || attendeeId,
        !!tileState.localTile
      );
      if (!tileState.localTile) np.audioTrackRef = sharedAudioRef;
      this.participants.set(attendeeId, np);
      if (!tileState.localTile) this.announceParticipant(np);
    }

    // CRÍTICO: videoTileDidUpdate se dispara con MUCHA frecuencia (cambios de
    // active/paused/resolución, y el propio bindVideoElement puede re-dispararlo).
    // Si recreamos el ref y emitimos en cada evento, Participant.tsx entra en un
    // loop de attach/detach (bind/unbind) que impide que se renderice un frame
    // → video en negro. Solo (re)creamos el ref cuando el tile REALMENTE cambia.
    const existingTileId = this.tileIdByAttendee.get(attendeeId);
    const nextStream = tileState.boundVideoStream ?? null;

    if (existingTileId === tileState.tileId && np.videoTrackRef) {
      // Mismo tile, pero Chime puede haber cambiado el stream por debajo (el
      // médico activa el fondo virtual → startVideoInput republica su video).
      // Ahí hay que re-enlazar el elemento —si no, el otro extremo se queda con
      // el stream muerto y lo ve en negro—, pero SIN recrear el ref ni emitir:
      // eso reintroduciría el loop de attach/detach descrito arriba.
      if (this.streamByAttendee.get(attendeeId) !== nextStream) {
        this.streamByAttendee.set(attendeeId, nextStream);
        (np.videoTrackRef as ChimeVideoTileRef).rebind();
      }
      return;
    }

    this.tileIdByAttendee.set(attendeeId, tileState.tileId);
    this.streamByAttendee.set(attendeeId, nextStream);
    np.videoTrackRef = new ChimeVideoTileRef(this, tileState.tileId);
    np.emitTracksChanged();
  }

  private handleTileRemoved(tileId: number): void {
    for (const [attendeeId, id] of this.tileIdByAttendee.entries()) {
      if (id === tileId) {
        this.tileIdByAttendee.delete(attendeeId);
        this.streamByAttendee.delete(attendeeId);
        const np = this.participants.get(attendeeId);
        if (np) {
          np.videoTrackRef = null;
          np.emitTracksChanged();
        }
      }
    }
  }
}
