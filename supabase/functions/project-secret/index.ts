// Admin-only edge function voor project_secrets.basicall_token CRUD.
//
// Waarom een edge function en niet direct een RLS-policy?
// - project_secrets heeft bewust 0 policies (default-deny) zodat de token nooit
//   richting frontend lekt via een stray SELECT.
// - De VPS-sync leest ze met service_role-key; frontend mag ze alleen via deze
//   gatekeeper aanpassen/checken (boolean-state, geen waarde).
//
// Routes (allemaal admin/superadmin only):
//   POST   body { project_id, token? } -> upsert token; zonder token wordt het
//                                          gedeelde account-token hergebruikt
//   GET    ?project_id=...             -> { hasToken: boolean }
//   DELETE ?project_id=...             -> verwijder secret

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Alle echte Triple Tree-projecten delen één BasiCall account-token; per request
// verschilt alleen de Project-header. We bepalen dat account-token als de meest
// voorkomende niet-lege waarde in project_secrets (placeholders zoals demo/test
// zijn in de minderheid en verliezen het altijd). Zo hoeft een admin bij een
// nieuw project geen token meer te plakken.
function mostFrequentToken(rows: { basicall_token: string | null }[]): string | null {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const token = row.basicall_token?.trim();
    if (!token) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [token, count] of counts) {
    if (count > bestCount) {
      best = token;
      bestCount = count;
    }
  }
  return best;
}

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
      if (!projectId) return json(400, { error: "Geen project geselecteerd." });

      // Token is optioneel: als de admin geen waarde meegeeft, hergebruiken we het
      // gedeelde account-token zodat een nieuw project meteen kan syncen.
      let token = body?.token?.trim();
      if (!token) {
        const { data: rows, error: readError } = await supabaseAdmin
          .from("project_secrets")
          .select("basicall_token");
        if (readError) {
          console.error("project-secret read-for-reuse error:", readError);
          return json(500, { error: "Kon het account-token niet ophalen. Probeer het opnieuw." });
        }
        token = mostFrequentToken(rows ?? []) ?? undefined;
        if (!token) return json(400, { error: "Geen account-token gevonden om te hergebruiken." });
      }

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
