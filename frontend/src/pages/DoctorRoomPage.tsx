import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { VideoRoom } from '../components/VideoRoom';

export const DoctorRoomPage = () => {
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();
  const [doctorName, setDoctorName] = useState('');
  const [isInCall, setIsInCall] = useState(false);

  // Extraer parámetro del doctor de la URL
  const doctorParam = searchParams.get('doctor');

  // Auto-llenar nombre del doctor si viene en la URL
  useEffect(() => {
    if (doctorParam) {
      setDoctorName(doctorParam);
    }
  }, [doctorParam]);

  const handleJoinCall = () => {
    if (doctorName.trim()) {
      setIsInCall(true);
    }
  };

  const handleLeaveCall = () => {
    setIsInCall(false);
  };

  if (isInCall && roomName) {
    return (
      <VideoRoom
        identity={`Dr. ${doctorName}`}
        roomName={roomName}
        onLeave={handleLeaveCall}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0b141a] flex items-center justify-center p-4">
      <div className="bg-[#1f2c34] rounded-3xl shadow-2xl p-8 sm:p-10 max-w-md w-full">
        {/* Logo y Título */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img
              src="/logoBlanco.png"
              alt="BSL Logo"
              className="h-20 w-auto"
            />
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
            Consulta Video
          </h1>
          <p className="text-gray-400 text-sm">Panel del Médico</p>
        </div>

        {/* Información de la sala */}
        <div className="bg-[#2a3942] rounded-xl p-4 mb-6 border border-gray-600">
          <p className="text-xs text-gray-400 mb-2">Sala de Consulta</p>
          <p className="text-white font-medium text-sm break-all">{roomName}</p>
        </div>

        {/* Formulario del médico */}
        <div className="space-y-5">
          <div>
            <label
              htmlFor="doctorName"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Código de Médico
            </label>
            <input
              type="text"
              id="doctorName"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              placeholder="Ingresa tu código"
              className="w-full px-4 py-3 bg-[#2a3942] text-white border border-gray-600 rounded-xl focus:ring-2 focus:ring-[#00a884] focus:border-[#00a884] outline-none transition placeholder-gray-500"
              required
            />
          </div>

          <button
            onClick={handleJoinCall}
            disabled={!doctorName.trim()}
            className="w-full bg-[#00a884] text-white px-6 py-3.5 rounded-xl hover:bg-[#008f6f] transition font-semibold shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Unirse a la Consulta
          </button>

          <div className="bg-[#2a3942] rounded-xl p-4 border border-gray-600">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm text-gray-300 font-medium mb-1">Información</p>
                <p className="text-xs text-gray-400">
                  Tu paciente se conectará automáticamente a esta sala cuando abra el link que le enviaste por WhatsApp.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-6 border-t border-gray-700">
          <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span>Conexión segura end-to-end</span>
          </div>
        </div>
      </div>
    </div>
  );
};
