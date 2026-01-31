import { Navigate } from "react-router-dom";
import { useUser } from "@/contexts/UserContext";
import { hasModuleAccess } from "@/lib/roles";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: string[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, roles, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !hasModuleAccess(roles, requiredRoles)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
