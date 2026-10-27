import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, setAccessToken } from "./api";
import type { Session } from "./types";

interface SessionState {
  session: Session | undefined;
  loading: boolean;
  error: Error | null;
  login: (email: string, password: string) => Promise<void>;
  demo: () => Promise<void>;
}
const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  // TanStack Query owns server identity alongside cached data; UI state stays in components.
  const query = useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      const next = await api.demo();
      setAccessToken(next.access_token);
      return next;
    },
    staleTime: Infinity,
    retry: false,
  });
  async function replaceSession(next: Session) {
    // Cancel in-flight requests before clearing tenant caches so old responses cannot leak across logins.
    await client.cancelQueries();
    setAccessToken(next.access_token);
    client.removeQueries({
      predicate: (query) => query.queryKey[0] !== "session",
    });
    client.setQueryData(["session"], next);
  }
  return (
    <SessionContext.Provider
      value={{
        session: query.data,
        loading: query.isPending,
        error: query.error,
        login: async (email, password) =>
          replaceSession(await api.login(email, password)),
        demo: async () => replaceSession(await api.demo()),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

// Keeping identity access behind one hook prevents components from decoding untrusted JWT claims.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("SessionProvider is required");
  return context;
}
