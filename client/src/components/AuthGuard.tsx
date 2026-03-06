import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useEffect } from "react";

const publicRoutes = ["/login", "/onboard"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, canOnboard, hassIngress } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const isPublicRoute = publicRoutes.some((route) => location.pathname.startsWith(route));

    if (!isAuthenticated) {
      if (isPublicRoute) {
        return;
      }
      if (canOnboard) {
        navigate("/onboard", { replace: true });
      } else {
        navigate("/login", { replace: true });
      }
    } else if (isPublicRoute) {
      navigate("/", { replace: true });
    }
  }, [isAuthenticated, isLoading, location.pathname, navigate, canOnboard, hassIngress]);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}