"use client";

import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";
import { useEffect } from "react";

const publicRoutes = ["/login", "/onboard"];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, isAuthenticated, canOnboard, hassIngress } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

    if (!isAuthenticated) {
      if (isPublicRoute) {
        return;
      }
      if (hassIngress) {
        return;
      }
      if (canOnboard) {
        router.push("/onboard");
      } else {
        router.push("/login");
      }
    } else if (isPublicRoute) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, pathname, router, canOnboard, hassIngress]);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated && hassIngress) {
    return null;
  }

  return <>{children}</>;
}