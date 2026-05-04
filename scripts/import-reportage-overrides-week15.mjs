#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx-js-style";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPORTAGES_DIR = path.join(ROOT, "rapportages");
const DEFAULT_OUT = path.join(REPORTAGES_DIR, "_audit", "week15-overrides-preview.json");

const MATCHED_REPORTS = [
  { file: "Rapportage ANBO_nabellen Informatiepakket_2026_TTG.xlsx", basicallProjectId: 734, template: "flat" },
  { file: "Rapportage ANBO_Tipgids_2026_TTG.xlsx", basicallProjectId: 827, template: "flat" },
  { file: "Rapportage Proefdiervrij Storno 2026.xlsx", basicallProjectId: 11, template: "outbound_standard" },
  { file: "Rapportage Proefdiervrij Winback 2026.xlsx", basicallProjectId: 759, template: "outbound_standard" },
  { file: "Rapportage Hersenstichting storno 2026 nieuw.xlsx", basicallProjectId: 539, template: "outbound_standard" },
  { file: "Rapportage Hersenstichting Bestellers 2026.xlsx", basicallProjectId: 869, template: "outbound_standard" },
  { file: "Rapportage Inbound Hersenstichting Retentie_2026_TTC.xlsx", basicallProjectId: 849, template: "inbound_retention" },
  { file: "Rapportage Save the Children Winback 2026.xlsx", basicallProjectId: 540, template: "outbound_standard" },
  { file: "Rapportage Save the Children Giftgevers 2026.xlsx", basicallProjectId: 864, template: "outbound_standard" },
  { file: "Rapportage Save the Children Storno 2026.xlsx", basicallProjectId: 904, template: "outbound_standard" },
  { file: "Rapportage Save the Children WB Mailgroep 2026.xlsx", basicallProjectId: 905, template: "outbound_standard" },
  { file: "Rapportage Save the Children WB 6 maanden 2026.xlsx", basicallProjectId: 907, template: "outbound_standard" },
  { file: "Rapportage Trombose stichting Folder 2026.xlsx", basicallProjectId: 761, template: "outbound_standard" },
  { file: "Rapportage Kerk in Actie 2026.xlsx", basicallProjectId: 807, template: "outbound_standard" },
  { file: "Rapportage Cliniclowns 2026.xlsx", basicallProjectId: 888, template: "outbound_standard" },
  { file: "Rapportage Inbound Sligro Tintelingen_klantenservice_2026_TTC.xlsx", basicallProjectId: 870, template: "inbound_service" },
  { file: "Rapportage Inbound NL Tour Rides_2026_TTC.xlsx", basicallProjectId: 901, template: "inbound_service" },
];

const DAY_ALIASES = {
  maandag: new Set(["maandag", "ma", "monday"]),
  dinsdag: new Set(["dinsdag", "di", "tuesday"]),
  woensdag: new Set(["woensdag", "wo", "wednesday"]),
  donderdag: new Set(["donderdag", "do", "thursday"]),
  vrijdag: new Set(["vrijdag", "vr", "friday"]),
  zaterdag: new Set(["zaterdag", "za", "saturday"]),
  zondag: new Set(["zondag", "zo", "sunday"]),
};
const DAYS = Object.keys(DAY_ALIASES);

function parseArgs(argv) {
  const args = {
    year: 2026,
    throughWeek: 15,
    apply: false,
    out: DEFAULT_OUT,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--year" && next) {
      args.year = Number(next);
      i += 1;
    } else if (arg === "--through-week" && next) {
      args.throughWeek = Number(next);
      i += 1;
    } else if (arg === "--out" && next) {
      args.out = path.resolve(ROOT, next);
      i += 1;
    } else if (arg === "--apply") {
      args.apply = true;
    } else if (arg === "--dry-run") {
      args.apply = false;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.year) || args.year < 2000) throw new Error("--year must be a valid year");
  if (!Number.isInteger(args.throughWeek) || args.throughWeek < 1 || args.throughWeek > 53) {
    throw new Error("--through-week must be between 1 and 53");
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/import-reportage-overrides-week15.mjs [--dry-run|--apply] [--year 2026] [--through-week 15]

Default mode is --dry-run. It writes a preview JSON and performs no writes.
--apply upserts aggregate, non-PII rows into public.reportage_weekly_overrides.`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function loadLocalEnv() {
  [
    path.join(ROOT, ".env.local"),
    path.join(ROOT, ".env"),
    path.join(ROOT, "scripts/basicall-sync/.env"),
  ].forEach(loadEnvFile);
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function parseCliJson(stdout) {
  const text = String(stdout || "").trim();
  const start = Math.min(...["[", "{"].map((char) => text.indexOf(char)).filter((index) => index >= 0));
  if (!Number.isFinite(start)) throw new Error(`Supabase CLI returned non-JSON output: ${text.slice(0, 300)}`);
  const parsed = JSON.parse(text.slice(start));
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.data)) return parsed.data;
  if (Array.isArray(parsed.result)) return parsed.result;
  return parsed;
}

function runCliQuery(query) {
  const proc = spawnSync(
    "supabase",
    ["db", "query", query, "--linked", "--output", "json", "--agent", "no"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
  if (proc.error) throw proc.error;
  if (proc.status !== 0) {
    throw new Error(`Supabase CLI query failed: ${proc.stderr?.trim() || proc.stdout?.trim() || `exit ${proc.status}`}`);
  }
  return parseCliJson(proc.stdout);
}

function createSupabaseJsProvider(url, serviceKey) {
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    name: "supabase-js-service-role",
    async fetchProjects(basicallIds) {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,basicall_project_id,report_template")
        .in("basicall_project_id", basicallIds);
      if (error) throw error;
      return data || [];
    },
    async upsertOverrides(rows) {
      const { error } = await supabase
        .from("reportage_weekly_overrides")
        .upsert(rows, { onConflict: "project_id,year,week_number" });
      if (error) throw error;
    },
  };
}

function sqlValue(value) {
  if (value === null || value === undefined) return "null";
  return `'${escapeSql(value)}'`;
}

function sqlJson(value) {
  return `'${escapeSql(JSON.stringify(value))}'::jsonb`;
}

function createSupabaseCliProvider() {
  return {
    name: "supabase-cli-linked",
    async fetchProjects(basicallIds) {
      return runCliQuery(`
        select id, name, basicall_project_id, report_template
        from public.projects
        where basicall_project_id = any(array[${basicallIds.map(Number).join(",")}])
        order by basicall_project_id;
      `);
    },
    async upsertOverrides(rows) {
      const chunkSize = 25;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const values = chunk.map((row) => `(
          ${sqlValue(row.project_id)}::uuid,
          ${Number(row.year)},
          ${Number(row.week_number)},
          ${sqlValue(row.template)},
          ${sqlValue(row.source_file)},
          ${sqlValue(row.source_sheet)},
          ${sqlJson(row.metrics)},
          ${sqlJson(row.daily_metrics)},
          ${sqlJson(row.result_rows)},
          ${sqlValue(row.source_hash)},
          ${sqlValue(row.imported_by)}
        )`).join(",");
        runCliQuery(`
          insert into public.reportage_weekly_overrides (
            project_id, year, week_number, template, source_file, source_sheet,
            metrics, daily_metrics, result_rows, source_hash, imported_by
          )
          values ${values}
          on conflict (project_id, year, week_number)
          do update set
            template = excluded.template,
            source_file = excluded.source_file,
            source_sheet = excluded.source_sheet,
            metrics = excluded.metrics,
            daily_metrics = excluded.daily_metrics,
            result_rows = excluded.result_rows,
            source_hash = excluded.source_hash,
            imported_by = excluded.imported_by,
            imported_at = now()
          returning id;
        `);
      }
    },
  };
}

function createProvider() {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) return createSupabaseJsProvider(url, serviceKey);
  return createSupabaseCliProvider();
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDutchFloat(value) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const str = String(value).trim();
  if (!str) return 0;
  if (str.includes(",") && str.includes(".")) {
    return Number(str.replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "")) || 0;
  }
  return Number(str.replace(",", ".").replace(/[^0-9.-]/g, "")) || 0;
}

function parseExcelNumber(value, unit = "number") {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const str = String(value).trim();
  if (!str || !/[0-9]/.test(str)) return null;
  const parsed = parseDutchFloat(str);
  if (unit === "percent" && str.includes("%")) return parsed / 100;
  return parsed;
}

function roundMetric(value, unit = "number") {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  if (unit === "percent") return Number(value.toFixed(6));
  if (unit === "money") return Number(value.toFixed(2));
  if (unit === "hours") return Number(value.toFixed(3));
  return Number(value.toFixed(3));
}

function workbookRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

function parseWeekFromSheetName(name) {
  const match = String(name).trim().match(/\b(?:week|w)\s*-?\s*0?([1-9]|[1-4][0-9]|5[0-3])\b/i);
  return match ? Number(match[1]) : null;
}

function getWeekSheets(workbook, year, throughWeek) {
  const byWeek = new Map();
  const hasExplicitYears = workbook.SheetNames.some((name) => /\b20\d{2}\b/.test(name));
  for (const sheetName of workbook.SheetNames) {
    const week = parseWeekFromSheetName(sheetName);
    if (!week || week > throughWeek) continue;
    const explicitYear = new RegExp(`\\b${year}\\b`).test(sheetName);
    const plainCurrentYear = /^W0?([1-9]|[1-4][0-9]|5[0-3])$/i.test(sheetName.trim());
    if (hasExplicitYears && !explicitYear && !plainCurrentYear) continue;
    const current = byWeek.get(week);
    if (!current || (explicitYear && !current.explicitYear)) {
      byWeek.set(week, { week, sheetName, explicitYear });
    }
  }
  return Array.from(byWeek.values()).sort((a, b) => a.week - b.week);
}

function dayKeyForCell(value) {
  const key = normalizeKey(value).replace(/\.$/, "");
  for (const [day, aliases] of Object.entries(DAY_ALIASES)) {
    if (aliases.has(key)) return day;
  }
  return null;
}

function findDayColumns(rows) {
  const found = {};
  for (const row of rows) {
    let dayHits = 0;
    const rowDays = {};
    row.forEach((cell, index) => {
      const day = dayKeyForCell(cell);
      if (day) {
        rowDays[day] = index;
        dayHits += 1;
      }
    });
    if (dayHits >= 2) return rowDays;
    Object.assign(found, rowDays);
  }
  return found;
}

function findTotalColumn(rows) {
  for (const row of rows) {
    let hasDay = false;
    let totalCol = null;
    row.forEach((cell, index) => {
      if (dayKeyForCell(cell)) hasDay = true;
      if (normalizeKey(cell) === "totaal") totalCol = index;
    });
    if (hasDay && totalCol !== null) return totalCol;
  }
  return null;
}

function findRowByLabel(rows, label) {
  const target = normalizeKey(label);
  return rows.find((row) => row.some((cell) => normalizeKey(cell) === target)) || null;
}

function getMetricFromRows(rows, label, unit = "number") {
  const target = normalizeKey(label);
  const totalCol = findTotalColumn(rows);
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      if (normalizeKey(row[i]) !== target) continue;
      if (totalCol !== null) {
        const totalValue = parseExcelNumber(row[totalCol], unit);
        if (totalValue !== null) return totalValue;
      }
      for (let j = i + 1; j < row.length; j += 1) {
        const value = parseExcelNumber(row[j], unit);
        if (value !== null) return value;
      }
      return null;
    }
  }
  return null;
}

function firstMetric(rows, labels, unit = "number") {
  for (const label of labels) {
    const value = getMetricFromRows(rows, label, unit);
    if (value !== null) return value;
  }
  return null;
}

function metricFromDay(row, column, unit) {
  if (!row || column === undefined) return null;
  return parseExcelNumber(row[column], unit);
}

function buildDailyMetrics(rows, labelConfig) {
  const dayColumns = findDayColumns(rows);
  const daily = {};
  for (const day of DAYS) {
    const column = dayColumns[day];
    if (column === undefined) continue;
    const metrics = {};
    for (const [metricKey, config] of Object.entries(labelConfig)) {
      const labels = Array.isArray(config.labels) ? config.labels : [config.labels];
      const row = labels.map((label) => findRowByLabel(rows, label)).find(Boolean);
      const value = metricFromDay(row, column, config.unit || "number");
      if (value !== null) metrics[metricKey] = roundMetric(value, config.unit);
    }
    if (Object.keys(metrics).length > 0) daily[day] = metrics;
  }
  return daily;
}

function extractOutboundWeek(rows) {
  const config = {
    sales: { labels: "Aantal positief", unit: "count" },
    recurring: { labels: "Aantal doorlopende machtigingen", unit: "count" },
    oneoff: { labels: "Aantal eenmalige machtigingen", unit: "count" },
    annualValue: { labels: "Jaarwaarde", unit: "money" },
    annualValueRecurring: { labels: "Jaarwaarde doorlopende machtigingen", unit: "money" },
    brutoConversion: { labels: "Bruto conversie", unit: "percent" },
    nettoConversion: { labels: "Netto conversie", unit: "percent" },
    hours: { labels: ["Aantal uur", "Aantal beluren", "Beluren"], unit: "hours" },
  };
  const metrics = Object.fromEntries(
    Object.entries(config).map(([key, item]) => [key, roundMetric(firstMetric(rows, [].concat(item.labels), item.unit), item.unit)]),
  );
  metrics.stockSupplied = roundMetric(getMetricFromRows(rows, "Totaal aangeleverd:"));
  metrics.stockHandled = roundMetric(getMetricFromRows(rows, "Afgehandeld:"));
  metrics.stockRemaining = roundMetric(getMetricFromRows(rows, "Nog te bellen:"));
  return { metrics, dailyMetrics: buildDailyMetrics(rows, config), resultRows: [] };
}

function extractFlatWeek(rows) {
  const resultRows = [];
  let totalHandled = null;
  let positive = null;
  let voicemail = null;
  let nawt = null;
  let hours = null;

  for (const row of rows) {
    const label = row[0] == null ? "" : String(row[0]).trim();
    if (!label || normalizeKey(label) === "omschrijving") continue;
    const type = row[1] == null ? "" : String(row[1]).trim();
    const count = parseExcelNumber(row[2]);
    const percentage = parseExcelNumber(row[3], "percent");
    const labelKey = normalizeKey(label);
    const typeKey = normalizeKey(type);

    if (labelKey === "totaal afgehandeld" || labelKey === "totaal effectief afgehandeld" || labelKey === "totaal") {
      totalHandled = count ?? totalHandled;
      continue;
    }
    if (labelKey === "positief") positive = count ?? positive;
    if (labelKey.includes("voicemail")) voicemail = (voicemail ?? 0) + (count ?? 0);
    if (labelKey.includes("nawt")) nawt = (nawt ?? 0) + (count ?? 0);
    if (labelKey === "aantal uur" || labelKey === "uren" || labelKey === "bel uren") {
      hours = count ?? hours;
      continue;
    }
    if (count !== null && typeKey) {
      resultRows.push({ label, type, count, percentage });
    }
  }

  const computedHandled = resultRows
    .filter((row) => normalizeKey(row.type).includes("effectief afgehandeld") && !normalizeKey(row.type).includes("niet effectief"))
    .reduce((sum, row) => sum + row.count, 0);
  const computedPositive = resultRows
    .filter((row) => normalizeKey(row.type).includes("sale") || normalizeKey(row.type).includes("positief"))
    .reduce((sum, row) => sum + row.count, 0);

  return {
    metrics: {
      totalHandled: roundMetric(totalHandled ?? computedHandled),
      positive: roundMetric(positive ?? computedPositive),
      voicemail: roundMetric(voicemail ?? 0),
      nawt: roundMetric(nawt ?? 0),
      hours: roundMetric(hours, "hours"),
    },
    dailyMetrics: {},
    resultRows,
  };
}

function extractInboundWeek(rows, template) {
  const config = {
    offered: { labels: ["Total calls offered", "Aangeboden calls", "Aangeboden Calls"], unit: "count" },
    answered: { labels: ["Total calls answered", "Aangenomen Calls", "Aangenomen calls"], unit: "count" },
    answeredUnder60: { labels: ["Total calls answered < 60 sec.", "Binnen 60 seconden", "Binnen 30 seconden"], unit: "count" },
    answeredOver60: { labels: ["Total calls answered > 60 sec."], unit: "count" },
    avgWait: { labels: ["Average waittime (sec.)"], unit: "number" },
    avgCall: { labels: ["Average calltime (sec.)", "Gemiddelde gesprekstijd (sec.)"], unit: "number" },
    avgHandling: { labels: ["Average handlingtime (sec.)"], unit: "number" },
    abandonedUnder60: { labels: ["Total calls abandoned < 60 sec.", "Short Abandoned"], unit: "count" },
    abandonedOver60: { labels: ["Total calls abandoned > 60 sec."], unit: "count" },
    abandonedRate: { labels: ["Abandoned rate (%)"], unit: "percent" },
    serviceLevel: { labels: ["Service level (%)"], unit: "percent" },
    totalCalltimeMin: { labels: ["Total calltime (min)"], unit: "number" },
    totalHandlingtimeMin: { labels: ["Total handelingstime (min)", "Total handlingtime (min)"], unit: "number" },
    hours: { labels: ["Inzet agenten (uren)", "Aantal beluren", "Bel uren"], unit: "hours" },
    mailHours: { labels: ["Inzet mail (uren)"], unit: "hours" },
  };
  const metrics = Object.fromEntries(
    Object.entries(config).map(([key, item]) => [key, roundMetric(firstMetric(rows, item.labels, item.unit), item.unit)]),
  );

  if (template === "inbound_retention") {
    Object.assign(metrics, {
      deceased: roundMetric(getMetricFromRows(rows, "Overleden")),
      retained: roundMetric(getMetricFromRows(rows, "Positief / behouden")),
      retainedPartial: roundMetric(getMetricFromRows(rows, "Behouden opzeggers eenmalig / na bepaalde tijd stoppen")),
      retainedOther: roundMetric(getMetricFromRows(rows, "Behouden opzeggers Overig")),
      oldDonationValue: roundMetric(getMetricFromRows(rows, "Oude donatiewaarde"), "money"),
      newDonationValue: roundMetric(getMetricFromRows(rows, "Nieuwe donatiewaarde"), "money"),
      retainedValue: roundMetric(getMetricFromRows(rows, "Waarde behoud"), "money"),
      retentionPercentage: roundMetric(getMetricFromRows(rows, "Behoudpercentage %", "percent"), "percent"),
    });
  }

  return {
    metrics,
    dailyMetrics: buildDailyMetrics(rows, config),
    resultRows: [],
  };
}

function readOverrides(config, args, project) {
  const filePath = path.join(REPORTAGES_DIR, config.file);
  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    cellFormula: false,
    cellStyles: false,
  });

  return getWeekSheets(workbook, args.year, args.throughWeek).map(({ week, sheetName }) => {
    const rows = workbookRows(workbook, sheetName);
    const extracted =
      config.template === "outbound_standard"
        ? extractOutboundWeek(rows)
        : config.template === "flat"
          ? extractFlatWeek(rows)
          : extractInboundWeek(rows, config.template);
    const sourceHash = crypto
      .createHash("sha256")
      .update(`${fileHash}:${sheetName}:${JSON.stringify(extracted)}`)
      .digest("hex");

    return {
      project_id: project.id,
      year: args.year,
      week_number: week,
      template: config.template,
      source_file: config.file,
      source_sheet: sheetName,
      metrics: extracted.metrics,
      daily_metrics: extracted.dailyMetrics,
      result_rows: extracted.resultRows,
      source_hash: sourceHash,
      imported_by: "scripts/import-reportage-overrides-week15.mjs",
      project_name: project.name,
      basicall_project_id: config.basicallProjectId,
    };
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const provider = createProvider();
  const projects = await provider.fetchProjects(MATCHED_REPORTS.map((item) => item.basicallProjectId));
  const projectsByBasicallId = new Map(projects.map((project) => [Number(project.basicall_project_id), project]));

  const missingProjects = [];
  const overrides = [];
  for (const config of MATCHED_REPORTS) {
    const project = projectsByBasicallId.get(config.basicallProjectId);
    if (!project) {
      missingProjects.push(config);
      continue;
    }
    overrides.push(...readOverrides(config, args, project));
  }

  const preview = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    dataProvider: provider.name,
    year: args.year,
    throughWeek: args.throughWeek,
    matchedReports: MATCHED_REPORTS.length - missingProjects.length,
    missingProjects: missingProjects.map((item) => ({
      file: item.file,
      basicall_project_id: item.basicallProjectId,
    })),
    overrideRows: overrides.length,
    rows: overrides,
  };

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(preview, null, 2));

  if (args.apply) {
    const dbRows = overrides.map(({ project_name, basicall_project_id, ...row }) => row);
    await provider.upsertOverrides(dbRows);
    console.log(`Applied ${dbRows.length} override rows to public.reportage_weekly_overrides.`);
  } else {
    console.log(`Dry run: prepared ${overrides.length} override rows. No database writes performed.`);
  }
  console.log(`Matched reports: ${preview.matchedReports}; missing projects: ${missingProjects.length}`);
  console.log(`Preview written to ${path.relative(ROOT, args.out)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
