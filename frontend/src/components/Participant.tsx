import { useEffect, useRef, useState } from 'react';
import {
  Participant as TwilioParticipant,
  RemoteVideoTrack,
  RemoteAudioTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  LocalTrackPublication,
  RemoteTrackPublication,
} from 'twilio-video';

interface ParticipantProps {
  participant: TwilioParticipant;
  isLocal?: boolean;
}

export const Participant = ({ participant, isLocal = false }: ParticipantProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [videoTrack, setVideoTrack] = useState<LocalVideoTrack | RemoteVideoTrack | null>(null);
  const [audioTrack, setAudioTrack] = useState<LocalAudioTrack | RemoteAudioTrack | null>(null);

  // Attach video track when ref is ready
  useEffect(() => {
    if (videoTrack && videoRef.current) {
      try {
        videoTrack.attach(videoRef.current);
        console.log('Video track attached successfully for', participant.identity);
      } catch (error) {
        console.error('Error attaching video track:', error);
      }

      return () => {
        videoTrack.detach().forEach((element) => element.remove());
      };
    }
  }, [videoTrack, participant.identity]);

  // Attach audio track when ref is ready
  useEffect(() => {
    if (audioTrack && audioRef.current && !isLocal) {
      try {
        audioTrack.attach(audioRef.current);
        console.log('Audio track attached successfully for', participant.identity);
      } catch (error) {
        console.error('Error attaching audio track:', error);
      }

      return () => {
        audioTrack.detach().forEach((element) => element.remove());
      };
    }
  }, [audioTrack, isLocal, participant.identity]);

  useEffect(() => {
    const trackSubscribed = (
      track: RemoteVideoTrack | RemoteAudioTrack | LocalVideoTrack | LocalAudioTrack
    ) => {
      console.log(`Track ${track.kind} subscribed for ${participant.identity}`, track);
      if (track.kind === 'video') {
        setVideoTrack(track as LocalVideoTrack | RemoteVideoTrack);
      } else if (track.kind === 'audio') {
        setAudioTrack(track as LocalAudioTrack | RemoteAudioTrack);
      }
    };

    const trackUnsubscribed = (
      track: RemoteVideoTrack | RemoteAudioTrack | LocalVideoTrack | LocalAudioTrack
    ) => {
      console.log(`Track ${track.kind} unsubscribed for ${participant.identity}`);
      if (track.kind === 'video') {
        setVideoTrack(null);
      } else if (track.kind === 'audio') {
        setAudioTrack(null);
      }
    };

    console.log(`Setting up participant: ${participant.identity}, tracks:`, participant.tracks.size);

    // Attach existing tracks
    participant.tracks.forEach((publication) => {
      if ('isSubscribed' in publication) {
        // Remote publication
        const remotePublication = publication as RemoteTrackPublication;
        console.log('Publication:', remotePublication.trackName, remotePublication.isSubscribed, remotePublication.track);
        if (remotePublication.isSubscribed && remotePublication.track) {
          const track = remotePublication.track;
          if (track.kind === 'video' || track.kind === 'audio') {
            trackSubscribed(track as RemoteVideoTrack | RemoteAudioTrack);
          }
        }
      } else {
        // Local publication
        const localPublication = publication as LocalTrackPublication;
        console.log('Publication:', localPublication.trackName, localPublication.track);
        if (localPublication.track) {
          const track = localPublication.track;
          if (track.kind === 'video' || track.kind === 'audio') {
            trackSubscribed(track as LocalVideoTrack | LocalAudioTrack);
          }
        }
      }
    });

    // Listen for new tracks (for remote participants)
    if (!isLocal) {
      participant.on('trackSubscribed', trackSubscribed);
      participant.on('trackUnsubscribed', trackUnsubscribed);
    }

    return () => {
      // Clean up tracks
      participant.tracks.forEach((publication) => {
        if ('isSubscribed' in publication) {
          // Remote publication
          const remotePublication = publication as RemoteTrackPublication;
          if (remotePublication.track) {
            const track = remotePublication.track;
            if (track.kind === 'video' || track.kind === 'audio') {
              trackUnsubscribed(track as RemoteVideoTrack | RemoteAudioTrack);
            }
          }
        } else {
          // Local publication
          const localPublication = publication as LocalTrackPublication;
          if (localPublication.track) {
            const track = localPublication.track;
            if (track.kind === 'video' || track.kind === 'audio') {
              trackUnsubscribed(track as LocalVideoTrack | LocalAudioTrack);
            }
          }
        }
      });
    };
  }, [participant, isLocal]);

  return (
    <div className={`relative bg-gray-900 rounded-lg overflow-hidden ${isLocal ? 'h-full' : 'aspect-video'}`}>
      {videoTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-500 to-purple-600">
          <div className={`text-white font-bold ${isLocal ? 'text-4xl' : 'text-6xl'}`}>
            {participant.identity.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {!isLocal && <audio ref={audioRef} autoPlay />}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
        <div className="flex items-center justify-between">
          <span className="text-white font-medium">
            {isLocal ? 'Tú' : participant.identity}
          </span>
          <div className="flex gap-2">
            {!audioTrack && (
              <span className="text-red-400 text-sm">
                🔇 Silenciado
              </span>
            )}
            {!videoTrack && (
              <span className="text-red-400 text-sm">
                📹 Sin video
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
