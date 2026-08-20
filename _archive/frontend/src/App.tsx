import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { getToken } from "./api/token";
import LoginPage from "./pages/LoginPage";
import PatientsPage from "./pages/PatientsPage";
import PrescriptionPage from "./pages/PrescriptionPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/patients" replace />} />
        <Route path="patients" element={<PatientsPage />} />
        <Route path="prescriptions" element={<PrescriptionPage />} />
      </Route>
    </Routes>
  );
}