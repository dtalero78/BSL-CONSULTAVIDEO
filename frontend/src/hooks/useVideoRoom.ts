import { useState, useEffect, useCallback } from 'react';
import Video, {
  Room,
  LocalParticipant,
  RemoteParticipant,
  LocalVideoTrack,
  LocalAudioTrack,
} from 'twilio-video';
import apiService from '../services/api.service';

interface UseVideoRoomOptions {
  identity: string;
  roomName: string;
  role?: 'doctor' | 'patient';
}

interface UseVideoRoomReturn {
  room: Room | null;
  localParticipant: LocalParticipant | null;
  remoteParticipants: Map<string, RemoteParticipant>;
  isConnecting: boolean;
  isConnected: boolean;
  error: string | null;
  connectToRoom: () => Promise<void>;
  disconnectFromRoom: () => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
}

export const useVideoRoom = ({
  identity,
  roomName,
  role,
}: UseVideoRoomOptions): UseVideoRoomReturn => {
  const [room, setRoom] = useState<Room | null>(null);
  const [localParticipant, setLocalParticipant] = useState<LocalParticipant | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, RemoteParticipant>>(
    new Map()
  );
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);

  const connectToRoom = useCallback(async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Obtener token del backend
      const token = await apiService.getVideoToken(identity, roomName);

      // Conectar a la sala
      const connectedRoom = await Video.connect(token, {
        name: roomName,
        audio: true,
        video: { width: 640, height: 480 },
        networkQuality: {
          local: 1,
          remote: 1,
        },
      });

      setRoom(connectedRoom);
      setLocalParticipant(connectedRoom.localParticipant);
      setIsConnected(true);

      // Registrar conexión para reportes (si se proporcionó rol)
      if (role) {
        try {
          await apiService.trackParticipantConnected(roomName, identity, role);
        } catch (err) {
          console.error('Error tracking participant connection:', err);
        }
      }

      // Agregar participantes remotos existentes
      connectedRoom.participants.forEach((participant) => {
        setRemoteParticipants((prev) => new Map(prev).set(participant.sid, participant));
      });

      // Escuchar eventos de participantes
      connectedRoom.on('participantConnected', (participant: RemoteParticipant) => {
        console.log(`Participant connected: ${participant.identity}`);
        setRemoteParticipants((prev) => new Map(prev).set(participant.sid, participant));
      });

      connectedRoom.on('participantDisconnected', (participant: RemoteParticipant) => {
        console.log(`Participant disconnected: ${participant.identity}`);
        setRemoteParticipants((prev) => {
          const newMap = new Map(prev);
          newMap.delete(participant.sid);
          return newMap;
        });
      });

      // Escuchar desconexión
      connectedRoom.on('disconnected', () => {
        console.log('Disconnected from room');
        setIsConnected(false);
        setRoom(null);
        setLocalParticipant(null);
        setRemoteParticipants(new Map());
      });

      console.log(`Successfully connected to room: ${roomName}`);
    } catch (err) {
      console.error('Error connecting to room:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect to room');
    } finally {
      setIsConnecting(false);
    }
  }, [identity, roomName, role]);

  const disconnectFromRoom = useCallback(() => {
    if (room) {
      // Registrar desconexión para reportes (si se proporcionó rol)
      if (role) {
        try {
          apiService.trackParticipantDisconnected(roomName, identity);
        } catch (err) {
          console.error('Error tracking participant disconnection:', err);
        }
      }

      room.disconnect();
      setRoom(null);
      setLocalParticipant(null);
      setRemoteParticipants(new Map());
      setIsConnected(false);
    }
  }, [room, role, roomName, identity]);

  const toggleAudio = useCallback(() => {
    if (localParticipant) {
      localParticipant.audioTracks.forEach((publication) => {
        const track = publication.track as LocalAudioTrack;
        if (track.isEnabled) {
          track.disable();
          setIsAudioEnabled(false);
        } else {
          track.enable();
          setIsAudioEnabled(true);
        }
      });
    }
  }, [localParticipant]);

  const toggleVideo = useCallback(() => {
    if (localParticipant) {
      localParticipant.videoTracks.forEach((publication) => {
        const track = publication.track as LocalVideoTrack;
        if (track.isEnabled) {
          track.disable();
          setIsVideoEnabled(false);
        } else {
          track.enable();
          setIsVideoEnabled(true);
        }
      });
    }
  }, [localParticipant]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, [room]);

  return {
    room,
    localParticipant,
    remoteParticipants,
    isConnecting,
    isConnected,
    error,
    connectToRoom,
    disconnectFromRoom,
    toggleAudio,
    toggleVideo,
    isAudioEnabled,
    isVideoEnabled,
  };
};
