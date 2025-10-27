import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { VideoRoom } from '../components/VideoRoom';

export const PatientPage = () => {
  const { roomName } = useParams<{ roomName: string }>();
  const [searchParams] = useSearchParams();
  const [patientName, setPatientName] = useState('');
  const [isInCall, setIsInCall] = useState(false);

  // Extraer parámetros de la URL
  const nombreParam = searchParams.get('nombre');
  const apellidoParam = searchParams.get('apellido');
  const doctorParam = searchParams.get('doctor');
  const documentoParam = searchParams.get('documento');

  // Auto-llenar nombre del paciente si viene en la URL
  useEffect(() => {
    if (nombreParam && apellidoParam) {
      const fullName = `${nombreParam} ${apellidoParam}`;
      setPatientName(fullName);
    }
  }, [nombreParam, apellidoParam]);

  const handleJoinCall = () => {
    if (patientName.trim()) {
      setIsInCall(true);
    }
  };

  const handleLeaveCall = () => {
    setIsInCall(false);
    setPatientName('');
  };

  if (isInCall && roomName) {
    return (
      <VideoRoom
        identity={patientName}
        roomName={roomName}
        role="patient"
        documento={documentoParam || undefined}
        medicoCode={doctorParam || undefined}
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
          <p className="text-gray-400 text-sm">Unirse a la Consulta</p>
        </div>

        <div className="space-y-5">
          {/* Banner de médico si viene desde Wix */}
          {doctorParam && (
            <div className="bg-[#00a884]/10 border border-[#00a884]/30 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#00a884]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-xs text-gray-400">Conectándose con</p>
                  <p className="text-white font-medium text-sm">Dr. {doctorParam}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info de la sala */}
          <div className="bg-[#2a3942] rounded-xl px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">Sala de Consulta</p>
            <p className="text-white font-medium text-sm break-all">{roomName}</p>
          </div>

          {/* Input nombre del paciente */}
          <div>
            <label
              htmlFor="patientName"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              Tu Nombre
            </label>
            <input
              type="text"
              id="patientName"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              placeholder="Ej: María González"
              className="w-full px-4 py-3 bg-[#2a3942] text-white border border-gray-600 rounded-xl focus:ring-2 focus:ring-[#00a884] focus:border-[#00a884] outline-none transition placeholder-gray-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleJoinCall();
                }
              }}
              autoFocus
              required
            />
          </div>

          {/* Botón de unirse */}
          <button
            onClick={handleJoinCall}
            disabled={!patientName.trim()}
            className="w-full bg-[#00a884] text-white px-6 py-3.5 rounded-xl hover:bg-[#008f6f] transition font-semibold shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            Unirse a la Consulta
          </button>

          {/* Footer con info de seguridad */}
          <div className="mt-6 pt-6 border-t border-gray-700">
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Asegúrate de permitir el acceso a tu cámara y micrófono</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
