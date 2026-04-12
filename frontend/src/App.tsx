import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DoctorPage } from './pages/DoctorPage';
import { DoctorRoomPage } from './pages/DoctorRoomPage';
import { PatientPage } from './pages/PatientPage';
import { MedicalPanelPage } from './pages/MedicalPanelPage';
import { TenantContext, useTenantLoader } from './hooks/useTenant';

function App() {
  const tenant = useTenantLoader();

  return (
    <TenantContext.Provider value={tenant}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/panel-medico" replace />} />
          <Route path="/doctor" element={<DoctorPage />} />
          <Route path="/doctor/:roomName" element={<DoctorRoomPage />} />
          <Route path="/patient/:roomName" element={<PatientPage />} />
          <Route path="/panel-medico" element={<MedicalPanelPage />} />
        </Routes>
      </BrowserRouter>
    </TenantContext.Provider>
  );
}

export default App;
