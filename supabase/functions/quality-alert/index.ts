import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "Triple Tree Dashboard <tripletree@sitejob.nl>";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization");
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const recipients = (Deno.env.get("QUALITY_ALERT_EMAILS") || "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);

  if (!supabaseUrl || !resendApiKey || recipients.length === 0) {
    console.error("Quality alert configuration is incomplete");
    return jsonResponse({ error: "Mail configuration incomplete" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: issues, error } = await supabase
    .from("data_quality_issues")
    .select(
      "id,source,public_message,period_start,last_notified_at,projects!inner(name,reporting_state,quality_enforcement_enabled)",
    )
    .is("resolved_at", null)
    .eq("severity", "critical")
    .eq("projects.reporting_state", "live")
    .or(`last_notified_at.is.null,last_notified_at.lt.${cutoff}`)
    .order("last_seen_at", { ascending: false });

  if (error) {
    console.error("Could not load quality issues:", error.message);
    return jsonResponse({ error: "Could not load quality issues" }, 500);
  }
  const alertableIssues = (issues || []).filter((issue) => {
    const project = Array.isArray(issue.projects)
      ? issue.projects[0]
      : issue.projects;
    return issue.source === "sync" || project?.quality_enforcement_enabled === true;
  });

  if (alertableIssues.length === 0) {
    return jsonResponse({ sent: 0 });
  }

  // One issue per affected day makes a project with a five-day gap produce five
  // identical lines. Group them so each line names the project once and lists the days.
  type IssueGroup = {
    project: string;
    source: string;
    message: string;
    days: string[];
  };
  const groups = new Map<string, IssueGroup>();
  for (const issue of alertableIssues) {
    const project = Array.isArray(issue.projects)
      ? issue.projects[0]
      : issue.projects;
    const projectName = project?.name || "Onbekend project";
    const key = `${projectName}|${issue.source}|${issue.public_message}`;
    const group: IssueGroup = groups.get(key) ?? {
      project: projectName,
      source: issue.source,
      message: issue.public_message,
      days: [],
    };
    if (issue.period_start && !group.days.includes(issue.period_start)) {
      group.days.push(issue.period_start);
    }
    groups.set(key, group);
  }

  const MONTHS = [
    "januari", "februari", "maart", "april", "mei", "juni",
    "juli", "augustus", "september", "oktober", "november", "december",
  ];
  const formatDay = (isoDate: string) => {
    const [, month, day] = isoDate.split("-");
    return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
  };

  const lines = [...groups.values()].map((group) => {
    const days = group.days.sort();
    const when = days.length === 0 ? "" : ` — ${days.map(formatDay).join(", ")}`;
    return `- ${group.project} (${group.source})${when}: ${group.message}`;
  });

  const mailResponse = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: Deno.env.get("QUALITY_ALERT_FROM") || DEFAULT_FROM,
      to: recipients,
      subject: `Dashboard datakwaliteit: ${alertableIssues.length} open probleem${alertableIssues.length === 1 ? "" : "en"}`,
      text: [
        "Na de herstelronde staan onderstaande klantveilige kwaliteitsproblemen nog open.",
        "Deze melding bevat geen recorddata of persoonsgegevens.",
        "",
        ...lines,
      ].join("\n"),
    }),
  });

  if (!mailResponse.ok) {
    console.error("Resend rejected quality alert:", mailResponse.status);
    await supabase
      .from("data_quality_issues")
      .update({ email_status: "error" })
      .in("id", alertableIssues.map((issue) => issue.id));
    return jsonResponse({ error: "Mail delivery failed" }, 502);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("data_quality_issues")
    .update({ last_notified_at: now, email_status: "sent" })
    .in("id", alertableIssues.map((issue) => issue.id));
  if (updateError) {
    console.error("Could not mark quality issues as notified:", updateError.message);
    return jsonResponse({ error: "Mail sent but status update failed" }, 500);
  }

  return jsonResponse({ sent: alertableIssues.length });
});
