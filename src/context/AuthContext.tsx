import React, { createContext, useContext, useState, useEffect } from "react";

export interface AuthUser {
  name: string;
  role?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  login: (user: AuthUser) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  // We can't use useNavigate here directly if AuthProvider is outside Router
  // But usually AuthProvider is inside Router. Let's assume it will be.

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      setIsLoading(true);
      const auth = localStorage.getItem("isAuthenticated") === "true";
      const savedUser = localStorage.getItem("user");
      setIsAuthenticated(auth);

      if (!auth) {
        setUser(null);
        return;
      }

      if (!savedUser) {
        setUser(null);
        return;
      }

      try {
        const parsed = JSON.parse(savedUser) as Partial<AuthUser>;
        if (typeof parsed.name === "string" && parsed.name.trim()) {
          setUser({
            name: parsed.name.trim(),
            role: typeof parsed.role === "string" ? parsed.role : undefined,
          });
        } else {
          setUser(null);
        }
      } catch (parseError) {
        console.warn("Failed to parse saved user", parseError);
        setUser(null);
      }
    } catch (error) {
      console.error("Auth check failed", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (nextUser: AuthUser) => {
    localStorage.setItem("isAuthenticated", "true");
    localStorage.setItem("user", JSON.stringify(nextUser));
    setIsAuthenticated(true);
    setUser(nextUser);
  };

  const logout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("user");
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, user, login, logout, checkAuth }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
