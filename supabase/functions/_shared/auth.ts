// Staff auth for admin-only edge function actions.
// Front end sends the user's Supabase session JWT in the Authorization header.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface StaffContext {
  userId: string;
  email: string | null;
}

/**
 * Verifies the bearer token belongs to a user with an admin/editor role.
 * Returns null when the caller is anonymous or not staff.
 */
export async function getStaff(req: Request, serviceClient: SupabaseClient): Promise<StaffContext | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (token === anonKey) return null; // publishable key is not a user

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(supabaseUrl, anonKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return null;

  const { data: roles } = await serviceClient
    .from("user_roles")
    .select("role")
    .eq("user_id", data.user.id);

  const isStaff = (roles ?? []).some((r) => r.role === "admin" || r.role === "editor");
  if (!isStaff) return null;

  return { userId: data.user.id, email: data.user.email ?? null };
}

/** Allows a server-to-server call that presents the service role key or a shared pipeline secret. */
export function isInternalCall(req: Request): boolean {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const pipelineSecret = Deno.env.get("PIPELINE_SECRET");
  if (serviceKey && token === serviceKey) return true;
  if (pipelineSecret && req.headers.get("x-pipeline-secret") === pipelineSecret) return true;
  return false;
}

export function unauthorized(corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
