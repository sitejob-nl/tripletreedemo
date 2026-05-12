// Admin-only edge function voor project_secrets.basicall_token CRUD.
//
// Waarom een edge function en niet direct een RLS-policy?
// - project_secrets heeft bewust 0 policies (default-deny) zodat de token nooit
//   richting frontend lekt via een stray SELECT.
// - De VPS-sync leest ze met service_role-key; frontend mag ze alleen via deze
//   gatekeeper aanpassen/checken (boolean-state, geen waarde).
//
// Routes (allemaal admin/superadmin only):
//   POST   body { project_id, token }  -> upsert token
//   GET    ?project_id=...             -> { hasToken: boolean }
//   DELETE ?project_id=...             -> verwijder secret

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Je sessie is verlopen. Log opnieuw in." });

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) return json(401, { error: "Je sessie is verlopen. Log opnieuw in." });

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (!roleData || (roleData.role !== "admin" && roleData.role !== "superadmin")) {
      return json(403, { error: "Alleen beheerders kunnen API-tokens beheren." });
    }

    const url = new URL(req.url);

    if (req.method === "POST") {
      const body = await req.json().catch(() => null) as { project_id?: string; token?: string } | null;
      const projectId = body?.project_id;
      const token = body?.token?.trim();
      if (!projectId || !token) return json(400, { error: "Vul zowel een project als een token in." });

      const { error } = await supabaseAdmin
        .from("project_secrets")
        .upsert({ project_id: projectId, basicall_token: token }, { onConflict: "project_id" });

      if (error) {
        console.error("project-secret upsert error:", error);
        return json(500, { error: "Kon het token niet opslaan. Probeer het opnieuw." });
      }
      return json(200, { success: true, hasToken: true });
    }

    if (req.method === "GET") {
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json(400, { error: "Geen project geselecteerd." });

      const { data, error } = await supabaseAdmin
        .from("project_secrets")
        .select("project_id")
        .eq("project_id", projectId)
        .maybeSingle();

      if (error) {
        console.error("project-secret select error:", error);
        return json(500, { error: "Kon de tokenstatus niet ophalen. Probeer het opnieuw." });
      }
      return json(200, { hasToken: !!data });
    }

    if (req.method === "DELETE") {
      const projectId = url.searchParams.get("project_id");
      if (!projectId) return json(400, { error: "Geen project geselecteerd." });

      const { error } = await supabaseAdmin
        .from("project_secrets")
        .delete()
        .eq("project_id", projectId);

      if (error) {
        console.error("project-secret delete error:", error);
        return json(500, { error: "Kon het token niet verwijderen. Probeer het opnieuw." });
      }
      return json(200, { success: true, hasToken: false });
    }

    return json(405, { error: "Deze actie wordt niet ondersteund." });
  } catch (err) {
    console.error("project-secret unexpected error:", err);
    return json(500, { error: "Er ging iets mis aan onze kant. Probeer het opnieuw." });
  }
});
