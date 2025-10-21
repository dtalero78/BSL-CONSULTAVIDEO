import { useState } from 'react';
import { VideoRoom } from '../components/VideoRoom';
import { generateRoomName, generatePatientLink, copyToClipboard } from '../utils/linkGenerator';

export const DoctorPage = () => {
  const [doctorName, setDoctorName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [patientLink, setPatientLink] = useState('');
  const [isInCall, setIsInCall] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCreateRoom = () => {
    if (!doctorName.trim()) return;

    const newRoomName = generateRoomName();
    const link = generatePatientLink(newRoomName);

    setRoomName(newRoomName);
    setPatientLink(link);
  };

  const handleCopyLink = async () => {
    const success = await copyToClipboard(patientLink);
    if (success) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const handleStartCall = () => {
    setIsInCall(true);
  };

  const handleLeaveCall = () => {
    setIsInCall(false);
    setRoomName('');
    setPatientLink('');
    setDoctorName('');
  };

  if (isInCall) {
    return (
      <VideoRoom
        identity={doctorName}
        roomName={roomName}
        role="doctor"
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

        {!patientLink ? (
          // Paso 1: Crear sala
          <div className="space-y-5">
            <div>
              <label
                htmlFor="doctorName"
                className="block text-sm font-medium text-gray-300 mb-2"
              >
                Tu Nombre (Médico)
              </label>
              <input
                type="text"
                id="doctorName"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                placeholder="Ej: Dr. Juan Pérez"
                className="w-full px-4 py-3 bg-[#2a3942] text-white border border-gray-600 rounded-xl focus:ring-2 focus:ring-[#00a884] focus:border-[#00a884] outline-none transition placeholder-gray-500"
                required
              />
            </div>

            <button
              onClick={handleCreateRoom}
              disabled={!doctorName.trim()}
              className="w-full bg-[#00a884] text-white px-6 py-3.5 rounded-xl hover:bg-[#008f6f] transition font-semibold shadow-lg disabled:bg-gray-600 disabled:cursor-not-allowed"
            >
              Crear Sala de Consulta
            </button>
          </div>
        ) : (
          // Paso 2: Mostrar link y permitir iniciar
          <div className="space-y-5">
            <div className="bg-[#2a3942] rounded-xl p-4 border border-gray-600">
              <p className="text-xs text-gray-400 mb-2">Link para el Paciente</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={patientLink}
                  readOnly
                  className="flex-1 bg-[#1f2c34] text-white px-3 py-2 rounded-lg text-sm border border-gray-700"
                />
                <button
                  onClick={handleCopyLink}
                  className="bg-[#00a884] text-white px-4 py-2 rounded-lg hover:bg-[#008f6f] transition text-sm font-medium whitespace-nowrap"
                >
                  {linkCopied ? '✓ Copiado' : 'Copiar'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-3">
                Comparte este link con tu paciente por WhatsApp, email o mensaje de texto
              </p>
            </div>

            <div className="bg-[#2a3942] rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Sala</p>
              <p className="text-white font-medium text-sm">{roomName}</p>
            </div>

            <div className="bg-[#2a3942] rounded-xl px-4 py-3">
              <p className="text-xs text-gray-400 mb-1">Médico</p>
              <p className="text-white font-medium text-sm">{doctorName}</p>
            </div>

            <button
              onClick={handleStartCall}
              className="w-full bg-[#00a884] text-white px-6 py-3.5 rounded-xl hover:bg-[#008f6f] transition font-semibold shadow-lg"
            >
              Iniciar Consulta
            </button>

            <button
              onClick={() => {
                setRoomName('');
                setPatientLink('');
              }}
              className="w-full bg-transparent text-gray-400 px-6 py-2 rounded-xl hover:text-white transition text-sm"
            >
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
