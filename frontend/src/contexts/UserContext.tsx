import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useFrappeAuth, useFrappeGetCall } from "frappe-react-sdk";

interface UserContextValue {
  user: string | null;
  roles: string[];
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  roles: [],
  isLoading: true,
  login: async () => {},
  logout: async () => {},
});

export function useUser() {
  return useContext(UserContext);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const { currentUser, isLoading: authLoading, login: frappeLogin, logout: frappeLogout } = useFrappeAuth();
  const [roles, setRoles] = useState<string[]>([]);

  const { data: rolesData, isLoading: rolesLoading } = useFrappeGetCall<{ message: string[] }>(
    "frappe.core.doctype.user.user.get_roles",
    currentUser ? { uid: currentUser } : undefined,
    currentUser ? `user-roles-${currentUser}` : null
  );

  useEffect(() => {
    if (rolesData?.message) {
      setRoles(rolesData.message);
    }
  }, [rolesData]);

  const login = async (username: string, password: string) => {
    await frappeLogin({ username, password });
  };

  const logout = async () => {
    await frappeLogout();
    setRoles([]);
  };

  return (
    <UserContext.Provider
      value={{
        user: currentUser ?? null,
        roles,
        isLoading: authLoading || rolesLoading,
        login,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}
