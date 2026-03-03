import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import { AuthGuard } from "./components/AuthGuard";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import OnboardPage from "./pages/OnboardPage";
import AccountDetailPage from "./pages/accounts/[id]";
import AdminUsersPage from "./pages/admin/page";
import TaxPage from "./pages/tax/page";
import { TaxRulesContent } from "./pages/tax/TaxRulesContent";

export default function App() {
  return (
    <SnackbarProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboard" element={<OnboardPage />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <HomePage />
              </AuthGuard>
            }
          />
          <Route
            path="/accounts/:id"
            element={
              <AuthGuard>
                <AccountDetailPage />
              </AuthGuard>
            }
          />
          <Route
            path="/admin/users"
            element={
              <AuthGuard>
                <AdminUsersPage />
              </AuthGuard>
            }
          />
          <Route
            path="/tax"
            element={
              <AuthGuard>
                <TaxPage />
              </AuthGuard>
            }
          />
          <Route
            path="/tax/rules"
            element={
              <AuthGuard>
                <TaxRulesContent />
              </AuthGuard>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </SnackbarProvider>
  );
}
