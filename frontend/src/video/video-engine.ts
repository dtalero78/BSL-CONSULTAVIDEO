/**
 * Provider-agnostic video engine abstraction.
 *
 * BSL-CONSULTAVIDEO can run video calls on either Twilio Video (DigitalOcean
 * deployment) or Amazon Chime SDK (AWS deployment), depending on what
 * `POST /api/video/token` returns (`data.provider`). This module defines the
 * shared contract (`VideoEngine`) that both `twilio-engine.ts` and
 * `chime-engine.ts` implement, plus the normalized types the UI consumes so
 * components like `Participant.tsx` never touch a provider SDK directly.
 *
 * Design notes:
 * - `NormalizedParticipant` mirrors just enough of Twilio's own
 *   `Participant` shape (`sid`, `identity`) to minimize churn in existing UI
 *   code, but adds an explicit `onTracksChanged` pub-sub because Chime has no
 *   per-participant event emitter the way Twilio does — the engine updates
 *   `videoTrackRef`/`audioTrackRef` in place and emits a change.
 * - `NormalizedVideoRef` wraps whatever "attach to a DOM element" mechanism
 *   the provider offers (Twilio: `track.attach()/.detach()`; Chime:
 *   `audioVideo.bindVideoElement()/bindAudioElement()`), so
 *   `Participant.tsx` keeps the exact two-effect attach pattern without
 *   knowing which provider is active.
 * - `LocalVideoHandle` is a small discriminated union consumed by
 *   `useBackgroundEffects`: the Twilio branch behaves exactly as before
 *   (`@twilio/video-processors` on the `LocalVideoTrack`), the Chime branch
 *   delegates to the engine itself (`ChimeVideoEngineLike`), since applying a
 *   background effect in Chime means swapping the local video *input device*
 *   for a `DefaultVideoTransformDevice`, not attaching a processor to an
 *   existing track.
 */
import type { VideoJoinInfo } from '../services/api.service';

export type VideoProviderName = 'twilio' | 'chime';

/** Credentials needed to join a call. Re-exported under a more "engine"-shaped name. */
export type VideoJoinConfig = VideoJoinInfo;

/**
 * Uniform way to bind/unbind a video or audio track to a DOM element,
 * regardless of provider. Mirrors Twilio's own `track.attach()/.detach()`
 * signature since that's the pattern already baked into `Participant.tsx`.
 */
export interface NormalizedVideoRef {
  attach(el: HTMLVideoElement | HTMLAudioElement): void;
  detach(): void;
}

type TracksChangedListener = () => void;

/**
 * Provider-agnostic participant. Local and remote participants are both
 * represented with this same class.
 */
export class NormalizedParticipant {
  /** Twilio Participant SID, or the Chime AttendeeId. */
  readonly sid: string;
  readonly identity: string;
  readonly isLocal: boolean;

  /** Null while no video/audio is currently available for this participant. */
  videoTrackRef: NormalizedVideoRef | null = null;
  audioTrackRef: NormalizedVideoRef | null = null;

  private listeners = new Set<TracksChangedListener>();

  constructor(sid: string, identity: string, isLocal: boolean) {
    this.sid = sid;
    this.identity = identity;
    this.isLocal = isLocal;
  }

  /** Subscribe to changes in `videoTrackRef`/`audioTrackRef`. Returns an unsubscribe function. */
  onTracksChanged(cb: TracksChangedListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** @internal Called by engines after mutating videoTrackRef/audioTrackRef. */
  emitTracksChanged(): void {
    this.listeners.forEach((cb) => cb());
  }
}

/** Minimal surface a Chime engine must expose so `useBackgroundEffects` can apply processors. */
export interface ChimeVideoEngineLike {
  applyBackgroundBlur(): Promise<void>;
  applyVirtualBackground(imageUrl: string): Promise<void>;
  removeVideoEffect(): Promise<void>;
}

/**
 * Opaque handle for the local video, returned by `VideoEngine.getLocalVideoHandle()`
 * and consumed by `useBackgroundEffects`. Twilio carries the real
 * `LocalVideoTrack` (processors attach directly to it); Chime carries a
 * reference back to the engine (processors are applied by swapping the video
 * input device).
 */
export type LocalVideoHandle =
  | { provider: 'twilio'; track: import('twilio-video').LocalVideoTrack }
  | { provider: 'chime'; engine: ChimeVideoEngineLike };

/** Tiny pub-sub helper shared by both engine implementations. */
export function createEmitter<T extends unknown[]>(): {
  subscribe(cb: (...args: T) => void): () => void;
  emit(...args: T): void;
} {
  const listeners = new Set<(...args: T) => void>();
  return {
    subscribe(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emit(...args) {
      listeners.forEach((cb) => cb(...args));
    },
  };
}

/**
 * Provider-agnostic video engine. `useVideoRoom` instantiates either
 * `TwilioVideoEngine` or `ChimeVideoEngine` based on `VideoJoinConfig.provider`
 * and drives the call exclusively through this interface. The returned
 * engine instance itself doubles as the provider-agnostic `room` handle
 * consumed by `MedicalHistoryPanel`/`useConsultationRecorder` (for the
 * client-side transcription recorder) — see `getLocalAudioTracks()` /
 * `getRemoteAudioTracks()`.
 */
export interface VideoEngine {
  readonly provider: VideoProviderName;

  /** Joins the call. Resolves with the local participant and any remotes already present. */
  connect(config: VideoJoinConfig): Promise<{
    localParticipant: NormalizedParticipant;
    remoteParticipants: NormalizedParticipant[];
  }>;

  /** Leaves the call and releases provider resources (devices, sessions, DOM helpers). */
  disconnect(): void;

  /** Toggles local mic; returns the new enabled state. */
  toggleAudio(): boolean;
  /** Toggles local camera; returns the new enabled state. */
  toggleVideo(): boolean;

  /** Fired when a remote participant joins. Returns an unsubscribe function. */
  onParticipantConnected(cb: (participant: NormalizedParticipant) => void): () => void;
  /** Fired when a remote participant leaves (passes its `sid`). Returns an unsubscribe function. */
  onParticipantDisconnected(cb: (sid: string) => void): () => void;
  /** Fired when the local session itself disconnects (remote hangup, error, etc). */
  onDisconnected(cb: () => void): () => void;

  /** Handle for `useBackgroundEffects` to apply blur/virtual-background to the local video. */
  getLocalVideoHandle(): LocalVideoHandle | null;

  /** Raw local microphone track(s), for the consultation recorder. */
  getLocalAudioTracks(): MediaStreamTrack[];
  /** Raw remote audio track(s) (all participants), for the consultation recorder. */
  getRemoteAudioTracks(): MediaStreamTrack[];
}
