import type { AuthProvider } from "@refinedev/core";

export const authProvider: AuthProvider = {
  login: async ({ username, password }) => {
    const res = await fetch("/api/method/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Frappe-Site-Name": "erp.merakiwp.com",
      },
      body: new URLSearchParams({ usr: username, pwd: password }),
    });

    if (res.ok) {
      return { success: true, redirectTo: "/" };
    }

    return {
      success: false,
      error: { name: "LoginError", message: "Invalid username or password" },
    };
  },

  logout: async () => {
    await fetch("/api/method/logout", {
      method: "POST",
      credentials: "include",
      headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
    });
    return { success: true, redirectTo: "/login" };
  },

  check: async () => {
    try {
      const res = await fetch("/api/method/frappe.auth.get_logged_user", {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return { authenticated: false, redirectTo: "/login" };
      const json = await res.json();
      if (json.message === "Guest") {
        return { authenticated: false, redirectTo: "/login" };
      }
      return { authenticated: true };
    } catch {
      return { authenticated: false, redirectTo: "/login" };
    }
  },

  getIdentity: async () => {
    try {
      const res = await fetch("/api/method/frappe.auth.get_logged_user", {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!res.ok) return null;
      const json = await res.json();
      if (json.message === "Guest") return null;
      return { email: json.message };
    } catch {
      return null;
    }
  },

  getPermissions: async () => {
    try {
      const userRes = await fetch("/api/method/frappe.auth.get_logged_user", {
        credentials: "include",
        headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
      });
      if (!userRes.ok) return [];
      const userJson = await userRes.json();
      if (userJson.message === "Guest") return [];

      const rolesRes = await fetch(
        `/api/method/frappe.core.doctype.user.user.get_roles?uid=${encodeURIComponent(userJson.message)}`,
        {
          credentials: "include",
          headers: { "X-Frappe-Site-Name": "erp.merakiwp.com" },
        }
      );
      if (!rolesRes.ok) return [];
      const rolesJson = await rolesRes.json();
      return rolesJson.message ?? [];
    } catch {
      return [];
    }
  },

  onError: async (error) => {
    if (error?.statusCode === 401 || error?.statusCode === 403) {
      return { logout: true, redirectTo: "/login" };
    }
    return { error };
  },
};
