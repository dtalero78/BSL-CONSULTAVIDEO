import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import medicalPanelService, { Patient, PatientStats } from '../services/medical-panel.service';
import apiService from '../services/api.service';

export function MedicalPanelPage() {
  const [medicoCode, setMedicoCode] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<PatientStats | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [collapsedItems, setCollapsedItems] = useState<{ [key: string]: boolean }>({});
  const [searchDocument, setSearchDocument] = useState('');
  const [searchResult, setSearchResult] = useState<Patient | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attendingPatient, setAttendingPatient] = useState<string | null>(null);
  const [connectedPatients, setConnectedPatients] = useState<Set<string>>(new Set());

  const pageSize = 10;

  const loadData = async () => {
    if (!medicoCode) {
      setError('Por favor ingrese el código de médico');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Cargar estadísticas
      const statsData = await medicalPanelService.getDailyStats(medicoCode);
      setStats(statsData);

      // Cargar pacientes pendientes
      const patientsData = await medicalPanelService.getPendingPatients(
        medicoCode,
        currentPage,
        pageSize
      );

      setPatients(patientsData.patients);
      setTotalPages(patientsData.totalPages);
      setIsLoggedIn(true);
    } catch (err) {
      console.error('Error cargando datos:', err);
      setError('Error al cargar los datos. Verifique el código de médico.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await loadData();
  };

  const handleRefresh = async () => {
    await loadData();
  };

  const handlePageChange = async (newPage: number) => {
    if (newPage < 0 || newPage >= totalPages) return;
    setCurrentPage(newPage);
  };

  useEffect(() => {
    if (isLoggedIn && medicoCode) {
      loadData();
    }
  }, [currentPage]);

  // Socket.io para notificaciones en tiempo real de pacientes conectados
  useEffect(() => {
    if (!isLoggedIn) return;

    // Determinar URL del servidor Socket.io
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
    const socketUrl = apiBaseUrl || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin);

    console.log('[MedicalPanel] Connecting to Socket.io at:', socketUrl);

    // Crear conexión Socket.io
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('[MedicalPanel] Socket.io connected');
    });

    newSocket.on('disconnect', () => {
      console.log('[MedicalPanel] Socket.io disconnected');
    });

    // Escuchar cuando un paciente se conecta
    newSocket.on('patient-connected', (data: { documento: string; roomName: string; identity: string; connectedAt: string }) => {
      console.log('[MedicalPanel] Patient connected:', data);
      setConnectedPatients((prev) => {
        const updated = new Set(prev);
        updated.add(data.documento);
        return updated;
      });
    });

    // Escuchar cuando un paciente se desconecta
    newSocket.on('patient-disconnected', (data: { documento: string; roomName: string; identity: string; disconnectedAt: string }) => {
      console.log('[MedicalPanel] Patient disconnected:', data);
      setConnectedPatients((prev) => {
        const updated = new Set(prev);
        updated.delete(data.documento);
        return updated;
      });
    });

    // Cleanup al desmontar
    return () => {
      console.log('[MedicalPanel] Disconnecting Socket.io');
      newSocket.disconnect();
    };
  }, [isLoggedIn]);

  const handleNoAnswer = async (patientId: string) => {
    try {
      await medicalPanelService.markAsNoAnswer(patientId);
      setCollapsedItems({ ...collapsedItems, [patientId]: true });
      await loadData(); // Recargar datos
    } catch (err) {
      console.error('Error marcando como no contesta:', err);
    }
  };

  const formatPhoneNumber = (phone: string): string => {
    // Limpiar espacios, paréntesis, guiones
    let cleaned = phone.replace(/[\s\(\)\-]/g, '');

    // Si ya tiene +, retornarlo limpio
    if (cleaned.startsWith('+')) {
      return cleaned;
    }

    // Detectar si ya tiene código de país internacional (11+ dígitos)
    // Códigos comunes: 1 (USA/Canada), 52 (Mexico), 57 (Colombia), 54 (Argentina), 55 (Brazil), 34 (Spain), 44 (UK), 49 (Germany), 33 (France)
    const hasCountryCode = /^(1|52|57|54|55|34|44|49|33)\d{10,}/.test(cleaned);

    if (hasCountryCode) {
      // Ya tiene código de país, solo agregar +
      return `+${cleaned}`;
    }

    // Detectar si es número local colombiano (10 dígitos que empiezan con 3)
    const isColombian = /^3\d{9}$/.test(cleaned);

    if (isColombian) {
      // Es número local colombiano, agregar +57
      return `+57${cleaned}`;
    }

    // Si no coincide con ningún patrón, retornar tal cual (con advertencia en consola)
    console.warn(`⚠️ Número telefónico con formato desconocido: ${cleaned}`);
    return cleaned;
  };

  const handleAtender = async (patient: Patient) => {
    setAttendingPatient(patient._id);
    try {
      // Generar sala única
      const roomName = medicalPanelService.generateRoomName();

      // Construir URL del doctor con _id de la historia clínica (URL completa)
      const doctorUrl = `${window.location.origin}/doctor/${roomName}?doctor=${medicoCode}&documento=${patient._id}&paciente=${encodeURIComponent(patient.nombres)}`;

      // Construir URL del paciente
      const patientLink = `${window.location.origin}/patient/${roomName}?nombre=${patient.primerNombre}&apellido=${patient.primerApellido}&documento=${patient._id}&doctor=${medicoCode}`;

      // Generar mensaje de WhatsApp con el link
      const whatsappMessage = `Hola ${patient.primerNombre}. Te escribimos de BSL. Tienes una cita médica programada conmigo\n\nConéctate al link:\n\n${patientLink}`;

      // Formatear teléfono con código de país internacional
      const phoneWithPlus = formatPhoneNumber(patient.celular);

      // Formatear teléfono (sin + para WhatsApp API)
      const phoneWithoutPlus = phoneWithPlus.substring(1);

      // 1. Enviar mensaje de WhatsApp por API
      await apiService.sendWhatsApp(phoneWithoutPlus, whatsappMessage);
      console.log('WhatsApp enviado exitosamente');

      // 2. Realizar llamada telefónica con Twilio Voice
      try {
        console.log(`📞 Iniciando llamada a: ${phoneWithPlus}`);
        await apiService.makeVoiceCall(phoneWithPlus, patient.primerNombre);
        console.log('✅ Llamada telefónica iniciada exitosamente');
      } catch (callError) {
        console.error('❌ Error realizando llamada telefónica:', callError);
        // No interrumpir el flujo si la llamada falla
      }

      // 3. Abrir ventana del doctor en una nueva pestaña
      window.open(doctorUrl, '_blank');
    } catch (error) {
      console.error('Error al atender paciente:', error);
      alert('Error al procesar la solicitud. Inténtalo nuevamente.');
    } finally {
      setAttendingPatient(null);
    }
  };

  const toggleCollapse = (patientId: string) => {
    setCollapsedItems({
      ...collapsedItems,
      [patientId]: !collapsedItems[patientId]
    });
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!searchDocument.trim()) {
      setSearchError('Por favor ingrese un documento o celular');
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      // Buscar sin filtro de médico (busca en toda la base de datos)
      const result = await medicalPanelService.searchPatientByDocument(
        searchDocument.trim()
        // No enviamos medicoCode para buscar en todos los pacientes
      );

      if (result) {
        setSearchResult(result);
      } else {
        setSearchError('No se encontró paciente con ese documento o celular');
      }
    } catch (err) {
      console.error('Error buscando paciente:', err);
      setSearchError('Error al buscar paciente');
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearch = () => {
    setSearchDocument('');
    setSearchResult(null);
    setSearchError(null);
  };

  const generateWhatsAppMessage = (patient: Patient, includeLink: boolean = false) => {
    if (!includeLink) {
      return `Hola ${patient.primerNombre}. Te escribimos de BSL. Tienes una cita médica programada conmigo`;
    }

    const roomName = medicalPanelService.generateRoomName();
    const patientLink = `${window.location.origin}/patient/${roomName}?nombre=${patient.primerNombre}&apellido=${patient.primerApellido}`;

    return `Hola ${patient.primerNombre}. Te escribimos de BSL. Tienes una cita médica programada conmigo\n\nConéctate al link:\n\n${patientLink}`;
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#0b141a] flex items-center justify-center p-4">
        <div className="bg-[#1f2c34] rounded-3xl shadow-2xl p-8 sm:p-10 max-w-md w-full">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-6">
              <img
                src="/logoBlanco.png"
                alt="BSL Logo"
                className="h-20 w-auto"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-2">
              Panel Médico
            </h1>
            <p className="text-gray-400 text-sm">
              Gestión de consultas y pacientes
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="codEmpresa" className="block text-sm font-medium text-gray-300 mb-2">
                Código de Médico
              </label>
              <input
                type="text"
                id="codEmpresa"
                value={medicoCode}
                onChange={(e) => setMedicoCode(e.target.value)}
                className="w-full px-4 py-3 bg-[#2a3942] border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-[#00a884] transition"
                placeholder="Ingrese su código"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-[#00a884] text-white px-6 py-3 rounded-xl hover:bg-[#008f6f] transition font-semibold shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Cargando...' : 'Entrar'}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-gray-700">
            <a
              href="https://api.whatsapp.com/send?phone=573014152706&text=Hola"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-[#00a884] transition"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Soporte técnico
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b141a] p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-[#1f2c34] rounded-2xl shadow-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <img src="/logoBlanco.png" alt="BSL Logo" className="h-12 w-auto" />
              <div>
                <h1 className="text-2xl font-bold text-white">Panel Médico</h1>
                <p className="text-gray-400 text-sm">Código: {medicoCode}</p>
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="bg-[#00a884] text-white px-4 py-2 rounded-xl hover:bg-[#008f6f] transition font-semibold disabled:opacity-50"
            >
              {isLoading ? '⟳' : '↻ Actualizar'}
            </button>
          </div>

          {/* Estadísticas */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-[#2a3942] rounded-xl p-4">
                <div className="text-gray-400 text-sm mb-1">Programados Hoy</div>
                <div className="text-3xl font-bold text-white">{stats.programadosHoy}</div>
              </div>
              <div className="bg-[#2a3942] rounded-xl p-4">
                <div className="text-gray-400 text-sm mb-1">Atendidos Hoy</div>
                <div className="text-3xl font-bold text-[#00a884]">{stats.atendidosHoy}</div>
              </div>
              <div className="bg-[#2a3942] rounded-xl p-4">
                <div className="text-gray-400 text-sm mb-1">Restantes Hoy</div>
                <div className="text-3xl font-bold text-yellow-500">{stats.restantesHoy}</div>
              </div>
            </div>
          )}
        </div>

        {/* Búsqueda */}
        <div className="bg-[#1f2c34] rounded-2xl shadow-xl p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">Buscar Paciente</h2>
          <form onSubmit={handleSearch} className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar por documento o celular..."
                value={searchDocument}
                onChange={(e) => setSearchDocument(e.target.value)}
                className="flex-1 px-4 py-3 bg-[#2a3942] border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-[#00a884] transition"
              />
              <button
                type="submit"
                disabled={isSearching || !searchDocument.trim()}
                className="bg-[#00a884] text-white px-6 py-3 rounded-xl hover:bg-[#008f6f] transition font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSearching ? '🔍' : '🔎 Buscar'}
              </button>
              {(searchResult || searchError) && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="bg-gray-600 text-white px-4 py-3 rounded-xl hover:bg-gray-700 transition font-semibold"
                >
                  ✕ Limpiar
                </button>
              )}
            </div>

            {searchError && (
              <div className="bg-red-500/10 border border-red-500/50 rounded-xl p-3 text-red-400 text-sm">
                {searchError}
              </div>
            )}

            {searchResult && (
              <div className="bg-[#2a3942] rounded-xl p-4 mt-4">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  ✅ Paciente encontrado
                </h3>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="col-span-2 flex items-center gap-3 mb-2">
                      <div>
                        <span className="text-gray-400">Nombre:</span>
                        <span className="text-white ml-2 font-semibold">{searchResult.nombres}</span>
                      </div>
                      {connectedPatients.has(searchResult._id) && (
                        <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full border border-green-500/50">
                          <div className="relative flex items-center justify-center w-2 h-2">
                            <div className="absolute w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                            <div className="relative w-2 h-2 bg-green-500 rounded-full"></div>
                          </div>
                          <span className="text-green-400 text-xs font-medium uppercase tracking-wide">
                            Conectado
                          </span>
                        </div>
                      )}
                    </div>
                    <div>
                      <span className="text-gray-400">Doc:</span>
                      <span className="text-white ml-2">{searchResult.numeroId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">Celular:</span>
                      <span className="text-white ml-2">{searchResult.celular || 'NO REGISTRA'}</span>
                      {searchResult.celular && (
                        <a
                          href={medicalPanelService.generateWhatsAppLink(
                            searchResult.celular,
                            generateWhatsAppMessage(searchResult, false)
                          )}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#25D366] hover:text-[#1da851] transition"
                          title="Enviar WhatsApp"
                        >
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                          </svg>
                        </a>
                      )}
                    </div>
                    <div>
                      <span className="text-gray-400">Empresa:</span>
                      <span className="text-white ml-2">
                        {searchResult.empresaListado === 'SANITHELP-JJ' ? 'PARTICULAR' : searchResult.empresaListado}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Fecha atención:</span>
                      <span className="text-white ml-2">
                        {new Date(searchResult.fechaAtencion).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Estado:</span>
                      <span className="text-white ml-2">{searchResult.estado}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleAtender(searchResult)}
                      disabled={attendingPatient === searchResult._id}
                      className="bg-[#00a884] text-white px-4 py-2 rounded-lg hover:bg-[#008f6f] transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {attendingPatient === searchResult._id ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Enviando...
                        </>
                      ) : (
                        'Atender'
                      )}
                    </button>

                    <button
                      onClick={() => handleNoAnswer(searchResult._id)}
                      className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition text-sm font-medium flex items-center gap-2"
                    >
                      No Contesta
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Lista de Pacientes */}
        <div className="bg-[#1f2c34] rounded-2xl shadow-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">Pacientes Pendientes</h2>

          {isLoading ? (
            <div className="text-center py-8 text-gray-400">
              Cargando pacientes...
            </div>
          ) : patients.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              No hay pacientes pendientes
            </div>
          ) : (
            <div className="space-y-4">
              {patients.map((patient) => (
                <div
                  key={patient._id}
                  className={`bg-[#2a3942] rounded-xl overflow-hidden transition-all ${
                    collapsedItems[patient._id] ? 'opacity-50' : ''
                  }`}
                >
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-white">
                            {patient.nombres}
                          </h3>
                          {connectedPatients.has(patient._id) && (
                            <div className="flex items-center gap-2 bg-green-500/20 px-3 py-1 rounded-full border border-green-500/50">
                              <div className="relative flex items-center justify-center w-2 h-2">
                                <div className="absolute w-2 h-2 bg-green-500 rounded-full animate-ping"></div>
                                <div className="relative w-2 h-2 bg-green-500 rounded-full"></div>
                              </div>
                              <span className="text-green-400 text-xs font-medium uppercase tracking-wide">
                                Conectado
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-400">Doc:</span>
                            <span className="text-white ml-2">{patient.numeroId}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-gray-400">Celular:</span>
                            <span className="text-white ml-2">
                              {patient.celular || 'NO REGISTRA'}
                            </span>
                            {patient.celular && (
                              <a
                                href={medicalPanelService.generateWhatsAppLink(
                                  patient.celular,
                                  generateWhatsAppMessage(patient, false)
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#25D366] hover:text-[#1da851] transition"
                                title="Enviar WhatsApp"
                              >
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                              </a>
                            )}
                          </div>
                          <div>
                            <span className="text-gray-400">Empresa:</span>
                            <span className="text-white ml-2">
                              {patient.empresaListado === 'SANITHELP-JJ'
                                ? 'PARTICULAR'
                                : patient.empresaListado}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-400">Fecha:</span>
                            <span className="text-white ml-2">
                              {new Date(patient.fechaAtencion).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => toggleCollapse(patient._id)}
                        className="text-gray-400 hover:text-white ml-4"
                      >
                        {collapsedItems[patient._id] ? '▼' : '▲'}
                      </button>
                    </div>

                    {!collapsedItems[patient._id] && (
                      <div className="mt-4 pt-4 border-t border-gray-700 flex flex-wrap gap-2">
                        <button
                          onClick={() => handleAtender(patient)}
                          disabled={attendingPatient === patient._id}
                          className="bg-[#00a884] text-white px-4 py-2 rounded-lg hover:bg-[#008f6f] transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                          {attendingPatient === patient._id ? (
                            <>
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Enviando...
                            </>
                          ) : (
                            'Atender'
                          )}
                        </button>

                        <button
                          onClick={() => handleNoAnswer(patient._id)}
                          className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition text-sm font-medium flex items-center gap-2"
                        >
                          No Contesta
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Paginación */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 0}
                className="px-4 py-2 bg-[#2a3942] text-white rounded-lg hover:bg-[#3a4952] transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                ← Anterior
              </button>

              <span className="text-gray-400">
                Página {currentPage + 1} de {totalPages}
              </span>

              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages - 1}
                className="px-4 py-2 bg-[#2a3942] text-white rounded-lg hover:bg-[#3a4952] transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Siguiente →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
