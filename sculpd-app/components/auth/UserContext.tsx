// components/auth/UserContext.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { SafeUser, AvatarColor } from "@/types/models";
import {
  listSafeUsers,
  getSafeUserById,
  authenticateUser,
  createUser,
  updateUserBodyweight,
} from "@/lib/db/user-repository";

const SESSION_STORAGE_KEY = "sculpd_active_user_id";
const TOKEN_STORAGE_KEY = "sculpd_session_token";

interface UserContextValue {
  activeUserId: string | null;
  activeUser: SafeUser | null;
  sessionToken: string | null;
  allProfiles: SafeUser[];
  isLoading: boolean;
  signIn: (
    userId: string,
    pin: string
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  switchUser: () => void;
  refreshProfiles: () => Promise<void>;
  createProfile: (
    displayName: string,
    pin: string,
    avatarColor?: AvatarColor,
    bodyweight?: number
  ) => Promise<SafeUser>;
  updateBodyweight: (bodyweight: number) => Promise<SafeUser>;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<SafeUser | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [allProfiles, setAllProfiles] = useState<SafeUser[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load all profiles from Dexie
  const refreshProfiles = useCallback(async () => {
    try {
      const users = await listSafeUsers();
      setAllProfiles(users);
      return;
    } catch (err) {
      console.error("Failed to load profiles from IndexedDB:", err);
    }
  }, []);

  // Initialize session on mount
  useEffect(() => {
    async function initSession() {
      setIsLoading(true);
      try {
        const users = await listSafeUsers();
        setAllProfiles(users);

        const savedUserId =
          typeof window !== "undefined"
            ? localStorage.getItem(SESSION_STORAGE_KEY)
            : null;

        if (savedUserId) {
          const matchingUser = await getSafeUserById(savedUserId);
          if (matchingUser) {
            setActiveUserId(matchingUser.id);
            setActiveUser(matchingUser);

            // Fetch or restore session token
            try {
              const res = await fetch("/api/auth/session", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: matchingUser.id }),
              });
              if (res.ok) {
                const data = await res.json();
                if (data.token) {
                  setSessionToken(data.token);
                  if (typeof window !== "undefined") {
                    localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
                  }
                }
              }
            } catch {
              // Offline fallback: load cached token
              if (typeof window !== "undefined") {
                const cachedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
                if (cachedToken) setSessionToken(cachedToken);
              }
            }
          } else {
            localStorage.removeItem(SESSION_STORAGE_KEY);
            localStorage.removeItem(TOKEN_STORAGE_KEY);
          }
        }
      } catch (error) {
        console.error("Session initialization error:", error);
      } finally {
        setIsLoading(false);
      }
    }

    initSession();
  }, []);

  const signIn = useCallback(
    async (userId: string, pin: string) => {
      try {
        const result = await authenticateUser(userId, pin);
        if (result.success && result.user) {
          setActiveUserId(result.user.id);
          setActiveUser(result.user);
          if (typeof window !== "undefined") {
            localStorage.setItem(SESSION_STORAGE_KEY, result.user.id);
          }

          // Request signed cloud sync token
          try {
            const res = await fetch("/api/auth/session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ userId: result.user.id }),
            });
            if (res.ok) {
              const data = await res.json();
              if (data.token) {
                setSessionToken(data.token);
                if (typeof window !== "undefined") {
                  localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
                }
              }
            }
          } catch {
            // Offline fallback: load cached token
            if (typeof window !== "undefined") {
              const cachedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
              if (cachedToken) setSessionToken(cachedToken);
            }
          }

          return { success: true };
        }
        return { success: false, error: result.error || "Authentication failed." };
      } catch (err: any) {
        return { success: false, error: err?.message || "Sign-in error." };
      }
    },
    []
  );

  const logout = useCallback(() => {
    setActiveUserId(null);
    setActiveUser(null);
    setSessionToken(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, []);

  const switchUser = useCallback(() => {
    logout();
  }, [logout]);

  const createProfile = useCallback(
    async (
      displayName: string,
      pin: string,
      avatarColor?: AvatarColor,
      bodyweight?: number
    ): Promise<SafeUser> => {
      const newUser = await createUser({
        displayName,
        pin,
        avatarColor,
        bodyweight,
      });

      await refreshProfiles();
      return newUser;
    },
    [refreshProfiles]
  );

  const updateBodyweight = useCallback(
    async (bodyweight: number): Promise<SafeUser> => {
      if (!activeUserId) {
        throw new Error("No active user to update bodyweight.");
      }
      const updated = await updateUserBodyweight(activeUserId, bodyweight);
      setActiveUser(updated);
      await refreshProfiles();
      return updated;
    },
    [activeUserId, refreshProfiles]
  );

  return (
    <UserContext.Provider
      value={{
        activeUserId,
        activeUser,
        sessionToken,
        allProfiles,
        isLoading,
        signIn,
        logout,
        switchUser,
        refreshProfiles,
        createProfile,
        updateBodyweight,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
