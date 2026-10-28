import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Wraps the admin dashboard. Shows a sign-in form to anonymous visitors and a
 * "no access" screen to signed-in users who aren't in user_roles.
 *
 * To grant yourself access after creating a user in Supabase Auth:
 *   insert into public.user_roles (user_id, role)
 *   select id, 'admin' from auth.users where email = 'you@firm.com';
 */
export function AdminGate({ children }: { children: (ctx: { email: string | null; signOut: () => Promise<void> }) => React.ReactNode }) {
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (auth.loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (!auth.user) {
    const submit = async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      const m = await auth.signIn(email, password);
      setBusy(false);
      if (m) setErr(m);
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <form onSubmit={submit} className="w-full max-w-sm border-2 border-foreground p-8 shadow-md space-y-5">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] font-bold">The GP Pulse</p>
            <h1 className="text-2xl font-bold mt-1">Editor sign-in</h1>
          </div>
          <div>
            <Label htmlFor="email" className="font-mono text-[11px] uppercase tracking-wider">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 border-2 border-foreground" autoComplete="username" required />
          </div>
          <div>
            <Label htmlFor="pw" className="font-mono text-[11px] uppercase tracking-wider">Password</Label>
            <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 border-2 border-foreground" autoComplete="current-password" required />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}</Button>
          <p className="text-xs text-muted-foreground text-center"><Link to="/" className="underline">Back to the site</Link></p>
        </form>
      </div>
    );
  }

  if (!auth.isStaff) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md border-2 border-foreground p-8 space-y-4">
          <h1 className="text-2xl font-bold">No editor access</h1>
          <p className="text-sm text-muted-foreground">
            You're signed in as <strong>{auth.user.email}</strong>, but this account isn't on the editor list. An admin can add it with:
          </p>
          <pre className="text-xs bg-secondary p-3 overflow-x-auto border border-border">{`insert into public.user_roles (user_id, role)\nselect id, 'admin' from auth.users\nwhere email = '${auth.user.email}';`}</pre>
          <Button variant="outline" onClick={auth.signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  return <>{children({ email: auth.user.email ?? null, signOut: auth.signOut })}</>;
}
