/**
 * Twilio Video implementation of `VideoEngine`.
 *
 * This is a straight port of the logic that used to live directly in
 * `useVideoRoom.ts` (see git history) — behavior is intentionally identical:
 * same `Video.connect()` options, same track-subscription handling (moved
 * here from `Participant.tsx`'s old inline listeners), same toggle logic.
 * Nothing here should change how the Twilio/DigitalOcean path behaves.
 */
import Video, {
  Room,
  LocalParticipant,
  RemoteParticipant,
  LocalVideoTrack,
  LocalAudioTrack,
  RemoteVideoTrack,
  RemoteAudioTrack,
  LocalTrackPublication,
  RemoteTrackPublication,
} from 'twilio-video';
import {
  VideoEngine,
  VideoJoinConfig,
  NormalizedParticipant,
  NormalizedVideoRef,
  LocalVideoHandle,
  createEmitter,
} from './video-engine';

type AnyTwilioTrack = LocalVideoTrack | LocalAudioTrack | RemoteVideoTrack | RemoteAudioTrack;
type AnyTwilioParticipant = LocalParticipant | RemoteParticipant;

/** Twilio tracks already expose `.attach()/.detach()` with the exact shape we need. */
class TwilioTrackRef implements NormalizedVideoRef {
  constructor(private track: AnyTwilioTrack) {}

  attach(el: HTMLVideoElement | HTMLAudioElement): void {
    // Twilio's attach() accepts HTMLMediaElement; video/audio tracks each narrow it further.
    (this.track as unknown as { attach(el: HTMLMediaElement): HTMLMediaElement }).attach(el);
  }

  detach(): void {
    this.track.detach().forEach((el) => el.remove());
  }
}

export class TwilioVideoEngine implements VideoEngine {
  readonly provider = 'twilio' as const;

  private room: Room | null = null;
  private participants = new Map<string, NormalizedParticipant>();
  private localVideoTrack: LocalVideoTrack | null = null;
  private audioEnabled = true;
  private videoEnabled = true;

  private participantConnected = createEmitter<[NormalizedParticipant]>();
  private participantDisconnected = createEmitter<[string]>();
  private disconnected = createEmitter<[]>();

  async connect(config: VideoJoinConfig): Promise<{
    localParticipant: NormalizedParticipant;
    remoteParticipants: NormalizedParticipant[];
  }> {
    if (!config.token) {
      throw new Error('El provider "twilio" requiere un token de acceso.');
    }

    const connectedRoom = await Video.connect(config.token, {
      name: config.roomName,
      audio: true,
      video: { width: 640, height: 480 },
      networkQuality: {
        local: 1,
        remote: 1,
      },
    });

    this.room = connectedRoom;

    const localVideoPub = Array.from(connectedRoom.localParticipant.videoTracks.values())[0];
    this.localVideoTrack = (localVideoPub?.track as LocalVideoTrack) || null;

    const localParticipant = this.wireParticipant(connectedRoom.localParticipant, true);

    const remoteParticipants: NormalizedParticipant[] = [];
    connectedRoom.participants.forEach((participant) => {
      remoteParticipants.push(this.wireParticipant(participant, false));
    });

    connectedRoom.on('participantConnected', (participant: RemoteParticipant) => {
      const np = this.wireParticipant(participant, false);
      this.participantConnected.emit(np);
    });

    connectedRoom.on('participantDisconnected', (participant: RemoteParticipant) => {
      this.unwireParticipant(participant);
      this.participants.delete(participant.sid);
      this.participantDisconnected.emit(participant.sid);
    });

    connectedRoom.on('disconnected', () => {
      this.disconnected.emit();
    });

    return { localParticipant, remoteParticipants };
  }

  disconnect(): void {
    this.room?.disconnect();
    this.room = null;
    this.participants.clear();
  }

  toggleAudio(): boolean {
    if (this.room) {
      this.room.localParticipant.audioTracks.forEach((publication) => {
        const track = publication.track as LocalAudioTrack;
        if (track.isEnabled) {
          track.disable();
          this.audioEnabled = false;
        } else {
          track.enable();
          this.audioEnabled = true;
        }
      });
    }
    return this.audioEnabled;
  }

  toggleVideo(): boolean {
    if (this.room) {
      this.room.localParticipant.videoTracks.forEach((publication) => {
        const track = publication.track as LocalVideoTrack;
        if (track.isEnabled) {
          track.disable();
          this.videoEnabled = false;
        } else {
          track.enable();
          this.videoEnabled = true;
        }
      });
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
    return this.localVideoTrack ? { provider: 'twilio', track: this.localVideoTrack } : null;
  }

  /** Stream de la cámara local que ya publica Twilio. Prestado: no detenerlo. */
  getLocalVideoStream(): MediaStream | null {
    if (!this.room) return null;
    const tracks: MediaStreamTrack[] = [];
    this.room.localParticipant.videoTracks.forEach((pub) => {
      const t = pub.track as LocalVideoTrack | null;
      if (t?.mediaStreamTrack) tracks.push(t.mediaStreamTrack);
    });
    return tracks.length ? new MediaStream(tracks) : null;
  }

  getLocalAudioTracks(): MediaStreamTrack[] {
    if (!this.room) return [];
    const tracks: MediaStreamTrack[] = [];
    this.room.localParticipant.audioTracks.forEach((pub) => {
      const t = pub.track as LocalAudioTrack | null;
      if (t?.mediaStreamTrack) tracks.push(t.mediaStreamTrack);
    });
    return tracks;
  }

  getRemoteAudioTracks(): MediaStreamTrack[] {
    if (!this.room) return [];
    const tracks: MediaStreamTrack[] = [];
    this.room.participants.forEach((participant) => {
      participant.audioTracks.forEach((pub) => {
        const t = pub.track as RemoteAudioTrack | null;
        if (t?.mediaStreamTrack) tracks.push(t.mediaStreamTrack);
      });
    });
    return tracks;
  }

  /** Wraps a Twilio participant (local or remote), replaying the old Participant.tsx track-subscription logic. */
  private wireParticipant(participant: AnyTwilioParticipant, isLocal: boolean): NormalizedParticipant {
    const np = new NormalizedParticipant(participant.sid, participant.identity, isLocal);
    this.participants.set(np.sid, np);

    const handleTrack = (track: AnyTwilioTrack) => {
      const ref = new TwilioTrackRef(track);
      if (track.kind === 'video') np.videoTrackRef = ref;
      else if (track.kind === 'audio') np.audioTrackRef = ref;
      np.emitTracksChanged();
    };

    const handleTrackRemoved = (track: AnyTwilioTrack) => {
      if (track.kind === 'video') np.videoTrackRef = null;
      else if (track.kind === 'audio') np.audioTrackRef = null;
      np.emitTracksChanged();
    };

    // Attach tracks already published/subscribed at wiring time.
    participant.tracks.forEach((publication) => {
      if ('isSubscribed' in publication) {
        const remotePub = publication as RemoteTrackPublication;
        if (remotePub.isSubscribed && remotePub.track) {
          handleTrack(remotePub.track as RemoteVideoTrack | RemoteAudioTrack);
        }
      } else {
        const localPub = publication as LocalTrackPublication;
        if (localPub.track) {
          handleTrack(localPub.track as LocalVideoTrack | LocalAudioTrack);
        }
      }
    });

    if (!isLocal) {
      const remote = participant as RemoteParticipant;
      remote.on('trackSubscribed', handleTrack);
      remote.on('trackUnsubscribed', handleTrackRemoved);
    } else {
      const local = participant as LocalParticipant;
      local.on('trackPublished', (publication: LocalTrackPublication) => {
        if (publication.track) handleTrack(publication.track as LocalVideoTrack | LocalAudioTrack);
      });
      local.on('trackUnpublished', (publication: LocalTrackPublication) => {
        if (publication.track) handleTrackRemoved(publication.track as LocalVideoTrack | LocalAudioTrack);
      });
    }

    return np;
  }

  private unwireParticipant(participant: RemoteParticipant): void {
    participant.removeAllListeners();
  }
}
