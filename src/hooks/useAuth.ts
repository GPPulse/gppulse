import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  isStaff: boolean;
  roles: string[];
}

export function useAuth(): AuthState & { signIn: (email: string, password: string) => Promise<string | null>; signOut: () => Promise<void> } {
  const [state, setState] = useState<AuthState>({ loading: true, session: null, user: null, isStaff: false, roles: [] });

  useEffect(() => {
    let active = true;

    const loadRoles = async (session: Session | null) => {
      if (!session?.user) {
        if (active) setState({ loading: false, session: null, user: null, isStaff: false, roles: [] });
        return;
      }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id);
      const roles = (data ?? []).map((r) => r.role as string);
      if (active) setState({ loading: false, session, user: session.user, isStaff: roles.some((r) => r === "admin" || r === "editor"), roles });
    };

    // Listener first, then initial session — avoids missing the first event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setTimeout(() => loadRoles(session), 0);
    });
    supabase.auth.getSession().then(({ data: { session } }) => loadRoles(session));

    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error ? error.message : null;
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  return { ...state, signIn, signOut };
}
