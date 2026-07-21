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

    const localParticipant = new NormalizedParticipant(this.localAttendeeId, config.identity, true);
    this.participants.set(this.localAttendeeId, localParticipant);

    // Observers/subscriptions must be wired before `start()` so we don't miss
    // presence/tile events for attendees already in the meeting.
    const observer: AudioVideoObserver = {
      videoTileDidUpdate: (tileState: VideoTileState) => this.handleTileUpdate(tileState),
      videoTileWasRemoved: (tileId: number) => this.handleTileRemoved(tileId),
      audioVideoDidStop: () => this.disconnected.emit(),
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
    }

    if (hasVideoPermission) {
      const videoInputs = await session.audioVideo.listVideoInputDevices();
      const chosenVideoDeviceId = videoInputs.find((d) => d.deviceId)?.deviceId ?? null;
      if (chosenVideoDeviceId) {
        this.chosenVideoDeviceId = chosenVideoDeviceId;
        await session.audioVideo.startVideoInput(chosenVideoDeviceId);
      }
    }

    session.audioVideo.start();
    // Solo iniciar el tile local si efectivamente hay entrada de video.
    if (this.chosenVideoDeviceId) {
      session.audioVideo.startLocalVideoTile();
    }

    // Bind the meeting's mixed remote audio ONCE, to a hidden element owned by
    // this engine (decoupled from whichever <Participant> components mount).
    this.hiddenAudioEl = document.createElement('audio');
    this.hiddenAudioEl.autoplay = true;
    this.hiddenAudioEl.style.display = 'none';
    document.body.appendChild(this.hiddenAudioEl);
    await session.audioVideo.bindAudioElement(this.hiddenAudioEl);

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
    if (this.session) {
      try {
        if (this.observer) this.session.audioVideo.removeObserver(this.observer);
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
      this.hiddenAudioEl.remove();
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
    } catch (err) {
      // Si el procesador falla (navegador sin soporte, WASM que no carga, equipo
      // lento), ya soltamos el device anterior: hay que devolver la cámara SIN
      // efecto. Quedarse sin video publicado es mucho peor que perder el fondo.
      if (this.chosenVideoDeviceId) {
        await this.session.audioVideo.startVideoInput(this.chosenVideoDeviceId).catch(() => undefined);
      }
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
