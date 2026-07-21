import { useEffect, useRef, useState } from 'react';
import type { NormalizedParticipant, NormalizedVideoRef } from '../video/video-engine';

interface ParticipantProps {
  participant: NormalizedParticipant;
  isLocal?: boolean;
}

export const Participant = ({ participant, isLocal = false }: ParticipantProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoTrackRef, setVideoTrackRef] = useState<NormalizedVideoRef | null>(participant.videoTrackRef);
  const [audioTrackRef, setAudioTrackRef] = useState<NormalizedVideoRef | null>(participant.audioTrackRef);

  // Subscribe to track changes on the (provider-agnostic) participant. Twilio
  // and Chime both update `participant.videoTrackRef`/`audioTrackRef` in
  // place and call `emitTracksChanged()` — this mirrors the old
  // trackSubscribed/trackUnsubscribed listeners that used to live here.
  useEffect(() => {
    const sync = () => {
      setVideoTrackRef(participant.videoTrackRef);
      setAudioTrackRef(participant.audioTrackRef);
    };
    sync(); // capture whatever is already available at mount time
    const unsubscribe = participant.onTracksChanged(sync);
    return unsubscribe;
  }, [participant]);

  // Attach video track when the normalized ref AND the DOM element are both ready.
  useEffect(() => {
    if (videoTrackRef && videoRef.current) {
      try {
        videoTrackRef.attach(videoRef.current);
        // En móvil, el autoplay puede quedar pendiente; forzar play() tras el
        // gesto de "Unirse" garantiza que el video del remoto se reproduzca.
        videoRef.current.play?.().catch(() => undefined);
        console.log('Video track attached successfully for', participant.identity);
      } catch (error) {
        console.error('Error attaching video track:', error);
      }

      return () => {
        videoTrackRef.detach();
      };
    }
  }, [videoTrackRef, participant.identity]);

  // Attach audio track when ready (remote only, matches previous behavior).
  useEffect(() => {
    if (audioTrackRef && audioRef.current && !isLocal) {
      try {
        audioTrackRef.attach(audioRef.current);
        console.log('Audio track attached successfully for', participant.identity);
      } catch (error) {
        console.error('Error attaching audio track:', error);
      }

      return () => {
        audioTrackRef.detach();
      };
    }
  }, [audioTrackRef, isLocal, participant.identity]);

  return (
    <div className={`relative bg-gray-900 overflow-hidden ${isLocal ? 'h-full rounded-lg' : 'h-full w-full'}`}>
      {videoTrackRef ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          // Siempre muteado: el audio del remoto va por un <audio>/elemento oculto
          // aparte, así que mutear este <video> NO afecta el sonido y garantiza el
          // autoplay del video en móvil (que bloquea video no-muteado).
          muted
          // Remoto (vista grande): responsivo. En móvil (pantalla vertical) usa
          // object-cover para LLENAR sin dejar franjas negras; en desktop
          // (md+, horizontal) usa object-contain para ver el cuadro completo sin
          // recortar/zoom. Local (PiP pequeño): object-cover siempre.
          className={`w-full h-full ${isLocal ? 'object-cover' : 'object-cover md:object-contain'}`}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
          <div className={`text-white font-bold ${isLocal ? 'text-4xl' : 'text-6xl sm:text-7xl md:text-8xl'}`}>
            {participant.identity.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay />}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-3 pb-2">
        <div className="flex items-center justify-between">
          <span className="text-white font-semibold text-sm sm:text-base drop-shadow-lg">
            {isLocal ? 'Tú' : participant.identity}
          </span>
          <div className="flex gap-2">
            {!audioTrackRef && (
              <span className="text-red-400 text-xs sm:text-sm drop-shadow-lg">
                🔇 Silenciado
              </span>
            )}
            {!videoTrackRef && (
              <span className="text-red-400 text-xs sm:text-sm drop-shadow-lg">
                📹 Sin video
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
