import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { DoctorPage } from './pages/DoctorPage';
import { PatientPage } from './pages/PatientPage';

function HomePage() {
  return (
    <div className="min-h-screen bg-[#0b141a] flex items-center justify-center p-4">
      <div className="bg-[#1f2c34] rounded-3xl shadow-2xl p-8 sm:p-10 max-w-md w-full">
        {/* Logo y Título */}
        <div className="text-center mb-10">
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
          <p className="text-gray-400 text-sm">
            Videollamadas seguras y profesionales
          </p>
        </div>

        {/* Selección de rol */}
        <div className="space-y-4">
          <Link to="/doctor">
            <button className="w-full bg-[#00a884] text-white px-6 py-4 rounded-xl hover:bg-[#008f6f] transition font-semibold shadow-lg">
              <div className="flex items-center justify-center gap-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>Soy Médico</span>
              </div>
              <p className="text-xs text-white/70 mt-2">Crear sala y generar link para paciente</p>
            </button>
          </Link>

          <div className="bg-[#2a3942] rounded-xl p-4 border border-gray-600">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm text-gray-300 font-medium mb-1">¿Eres paciente?</p>
                <p className="text-xs text-gray-400">
                  Solicita el link de la consulta a tu médico y ábrelo en tu navegador para unirte automáticamente
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
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/doctor" element={<DoctorPage />} />
        <Route path="/patient/:roomName" element={<PatientPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
