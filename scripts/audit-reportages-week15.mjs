#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx-js-style";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPORTAGES_DIR = path.join(ROOT, "rapportages");

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

const UNMATCHED_FILES = new Set([
  "Rapportage Amazone Kinderen 2026.xlsx",
  "Rapportage Cordaid 2026.xlsx",
  "Rapportage Inbound Doorpro_2026_TTC.xlsx",
  "Rapportage Inbound Kemkens_Solar_2026.xlsx",
  "Rapportage Omroep Max 2026.xlsx",
  "Rapportage Inbound Take 5 Nederland_2026_TTC.xlsx",
  "Rapportage Trombose stichting Petitie 2026.xlsx",
]);

const COUNT_TOLERANCE = 0.001;
const MONEY_TOLERANCE = 0.01;
const PERCENT_TOLERANCE = 0.0005;
const HOURS_TOLERANCE = 0.001;

function parseArgs(argv) {
  const args = {
    year: 2026,
    throughWeek: 15,
    out: path.join(REPORTAGES_DIR, "_audit"),
    mode: "raw",
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
    } else if (arg === "--mode" && next) {
      args.mode = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.year) || args.year < 2000) {
    throw new Error("--year must be a valid year");
  }
  if (!Number.isInteger(args.throughWeek) || args.throughWeek < 1 || args.throughWeek > 53) {
    throw new Error("--through-week must be between 1 and 53");
  }
  if (!["raw", "effective"].includes(args.mode)) {
    throw new Error("--mode must be raw or effective");
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/audit-reportages-week15.mjs [--year 2026] [--through-week 15] [--out rapportages/_audit]

Data source:
  1. SUPABASE_SERVICE_KEY/SUPABASE_SERVICE_ROLE_KEY + SUPABASE_URL/VITE_SUPABASE_URL
  2. Fallback: linked Supabase CLI (supabase link --project-ref tvsdbztjqksxybxjwtrf)

Modes:
  --mode raw        Compare Excel to raw Supabase aggregates.
  --mode effective Compare Excel to reportage_weekly_overrides where present.

The script only performs Supabase SELECT queries and writes audit files under --out.`);
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    if (process.env[key] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadLocalEnv() {
  [
    path.join(ROOT, ".env.local"),
    path.join(ROOT, ".env"),
    path.join(ROOT, "scripts/basicall-sync/.env"),
  ].forEach(loadEnvFile);
}

function getSupabaseConfig() {
  loadLocalEnv();
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, serviceKey };
}

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}

function parseCliJson(stdout) {
  const text = String(stdout || "").trim();
  const start = Math.min(
    ...["[", "{"]
      .map((char) => text.indexOf(char))
      .filter((index) => index >= 0),
  );
  if (!Number.isFinite(start)) {
    throw new Error(`Supabase CLI returned non-JSON output: ${text.slice(0, 300)}`);
  }
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
    {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  if (proc.error) {
    throw proc.error;
  }
  if (proc.status !== 0) {
    const stderr = proc.stderr?.trim();
    const stdout = proc.stdout?.trim();
    throw new Error(`Supabase CLI query failed: ${stderr || stdout || `exit ${proc.status}`}`);
  }
  return parseCliJson(proc.stdout);
}

function createSupabaseJsProvider(url, serviceKey) {
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return {
    name: "supabase-js-service-role",
    async fetchProjects(matchedIds) {
      const { data, error } = await supabase
        .from("projects")
        .select("id,name,project_key,basicall_project_id,project_type,report_template,is_active,mapping_config")
        .in("basicall_project_id", matchedIds)
        .order("basicall_project_id", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    async fetchRecords(projectId, start, end) {
      return fetchAllPages(
        supabase
          .from("call_records")
          .select("basicall_record_id,beldatum,beldatum_date,beltijd,gesprekstijd_sec,resultaat,week_number,raw_data")
          .eq("project_id", projectId)
          .gte("beldatum_date", start)
          .lte("beldatum_date", end)
          .order("beldatum_date", { ascending: true })
          .order("basicall_record_id", { ascending: true }),
      );
    },
    async fetchLoggedRows(projectId, start, end) {
      return fetchAllPages(
        supabase
          .from("daily_logged_time")
          .select("date,total_seconds,corrected_seconds")
          .eq("project_id", projectId)
          .gte("date", start)
          .lte("date", end)
          .order("date", { ascending: true }),
      );
    },
    async fetchOverrides(projectId, year, throughWeek) {
      return fetchAllPages(
        supabase
          .from("reportage_weekly_overrides")
          .select("*")
          .eq("project_id", projectId)
          .eq("year", year)
          .lte("week_number", throughWeek)
          .order("week_number", { ascending: true }),
      );
    },
  };
}

function createSupabaseCliProvider() {
  return {
    name: "supabase-cli-linked",
    async fetchProjects(matchedIds) {
      return runCliQuery(`
        select id, name, project_key, basicall_project_id, project_type, report_template, is_active, mapping_config
        from public.projects
        where basicall_project_id = any(array[${matchedIds.map(Number).join(",")}])
        order by basicall_project_id;
      `);
    },
    async fetchRecords(projectId, start, end) {
      return runCliQuery(`
        select basicall_record_id, beldatum, beldatum_date, beltijd, gesprekstijd_sec, resultaat, week_number, raw_data
        from public.call_records
        where project_id = '${escapeSql(projectId)}'
          and beldatum_date >= date '${escapeSql(start)}'
          and beldatum_date <= date '${escapeSql(end)}'
        order by beldatum_date asc, basicall_record_id asc;
      `);
    },
    async fetchLoggedRows(projectId, start, end) {
      return runCliQuery(`
        select date, total_seconds, corrected_seconds
        from public.daily_logged_time
        where project_id = '${escapeSql(projectId)}'
          and date >= date '${escapeSql(start)}'
          and date <= date '${escapeSql(end)}'
        order by date asc;
      `);
    },
    async fetchOverrides(projectId, year, throughWeek) {
      return runCliQuery(`
        select *
        from public.reportage_weekly_overrides
        where project_id = '${escapeSql(projectId)}'
          and year = ${Number(year)}
          and week_number <= ${Number(throughWeek)}
        order by week_number asc;
      `);
    },
  };
}

function createDataProvider() {
  const { url, serviceKey } = getSupabaseConfig();
  if (url && serviceKey) {
    return createSupabaseJsProvider(url, serviceKey);
  }
  return createSupabaseCliProvider();
}

function isoWeekDate(year, week, isoDay) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const date = new Date(week1Monday);
  date.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + (isoDay - 1));
  return date;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseBasiCallDate(str) {
  if (!str) return null;
  let match = String(str).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = String(str).match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getISOWeekYear(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
}

function getISOWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function ceilHoursFromSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.ceil(seconds / 3600);
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
  if (!str) return null;
  if (!/[0-9]/.test(str)) return null;
  const parsed = parseDutchFloat(str);
  if (unit === "percent" && str.includes("%")) return parsed / 100;
  return parsed;
}

function detectFrequencyFromConfig(freqRaw, freqMap = {}, resultaat = null) {
  const defaultResult = { type: "oneoff", multiplier: 1, isOneOff: true };
  if (!freqRaw) return defaultResult;
  const freqStr = String(freqRaw).toLowerCase().trim();
  const freqNum = parseInt(freqStr, 10);
  if (!Number.isNaN(freqNum) && freqNum > 0 && freqStr === String(freqNum)) {
    return { type: mapMultiplierToType(freqNum), multiplier: freqNum, isOneOff: freqNum === 1 };
  }
  if (freqStr.includes("eenmalig") || freqStr === "0" || freqStr === "e") {
    return { type: "oneoff", multiplier: 1, isOneOff: true };
  }
  for (const [mapKey, mapValue] of Object.entries(freqMap || {})) {
    const lowerMapKey = String(mapKey).toLowerCase();
    if (freqStr.includes(lowerMapKey) || lowerMapKey.includes(freqStr)) {
      const multiplier = Number(mapValue) || 1;
      return {
        type: mapMultiplierToType(multiplier),
        multiplier,
        isOneOff: multiplier === 1 && !freqStr.includes("jaar"),
      };
    }
  }
  if (freqStr.includes("maand") || freqStr.includes("mnd") || freqStr === "m") {
    return { type: "monthly", multiplier: 12, isOneOff: false };
  }
  if (freqStr.includes("kwartaal") || freqStr === "k") {
    return { type: "quarterly", multiplier: 4, isOneOff: false };
  }
  if (freqStr.includes("halfjaar") || freqStr.includes("half jaar") || freqStr === "h") {
    return { type: "halfYearly", multiplier: 2, isOneOff: false };
  }
  if (freqStr.includes("jaar") || freqStr === "j") {
    return { type: "yearly", multiplier: 1, isOneOff: false };
  }
  if (resultaat) {
    const resultLower = String(resultaat).toLowerCase();
    if (resultLower.includes("per maand") || resultLower.includes("maandelijks")) {
      return { type: "monthly", multiplier: 12, isOneOff: false };
    }
    if (resultLower.includes("per kwartaal") || resultLower.includes("kwartaal")) {
      return { type: "quarterly", multiplier: 4, isOneOff: false };
    }
    if (resultLower.includes("per half jaar") || resultLower.includes("halfjaar")) {
      return { type: "halfYearly", multiplier: 2, isOneOff: false };
    }
    if (resultLower.includes("per jaar") || resultLower.includes("jaarlijks")) {
      return { type: "yearly", multiplier: 1, isOneOff: false };
    }
    if (resultLower.includes("eenmalig")) {
      return { type: "oneoff", multiplier: 1, isOneOff: true };
    }
  }
  return defaultResult;
}

function mapMultiplierToType(multiplier) {
  if (multiplier === 12) return "monthly";
  if (multiplier === 4) return "quarterly";
  if (multiplier === 2) return "halfYearly";
  if (multiplier === 1) return "yearly";
  return multiplier > 4 ? "monthly" : "yearly";
}

function normalizeKey(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function dayKeyForCell(value) {
  const key = normalizeKey(value).replace(/\.$/, "");
  const aliases = {
    maandag: ["maandag", "ma"],
    dinsdag: ["dinsdag", "di"],
    woensdag: ["woensdag", "wo"],
    donderdag: ["donderdag", "do"],
    vrijdag: ["vrijdag", "vr"],
    zaterdag: ["zaterdag", "za"],
    zondag: ["zondag", "zo"],
  };
  return Object.entries(aliases).find(([, values]) => values.includes(key))?.[0] || null;
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

function getWeekSheets(workbook, year, throughWeek) {
  const byWeek = new Map();
  const sheetNames = workbook.SheetNames;
  const hasExplicitYears = sheetNames.some((name) => /\b20\d{2}\b/.test(name));

  for (const sheetName of sheetNames) {
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

function extractOutboundWeek(rows) {
  return {
    sales: getMetricFromRows(rows, "Aantal positief"),
    recurring: getMetricFromRows(rows, "Aantal doorlopende machtigingen"),
    oneoff: getMetricFromRows(rows, "Aantal eenmalige machtigingen"),
    annualValue: getMetricFromRows(rows, "Jaarwaarde"),
    annualValueRecurring: getMetricFromRows(rows, "Jaarwaarde doorlopende machtigingen"),
    brutoConversion: getMetricFromRows(rows, "Bruto conversie", "percent"),
    nettoConversion: getMetricFromRows(rows, "Netto Conversie", "percent"),
    hours:
      getMetricFromRows(rows, "Aantal uur") ??
      getMetricFromRows(rows, "Aantal beluren") ??
      getMetricFromRows(rows, "Beluren"),
    supplied: getMetricFromRows(rows, "Totaal aangeleverd:"),
    handledStock: getMetricFromRows(rows, "Afgehandeld:"),
    remainingStock: getMetricFromRows(rows, "Nog te bellen:"),
  };
}

function extractFlatWeek(rows) {
  const resultRows = [];
  let explicitTotalHandled = null;
  let explicitPositive = null;
  let explicitVoicemail = null;
  let explicitNawt = null;
  let hours = null;

  for (const row of rows) {
    const desc = row[0] == null ? "" : String(row[0]).trim();
    if (!desc || normalizeKey(desc) === "omschrijving") continue;
    const type = row[1] == null ? "" : String(row[1]).trim();
    const count = parseExcelNumber(row[2]);
    const descKey = normalizeKey(desc);
    const typeKey = normalizeKey(type);

    if (descKey === "totaal afgehandeld" || descKey === "totaal effectief afgehandeld" || descKey === "totaal") {
      explicitTotalHandled = count ?? explicitTotalHandled;
      continue;
    }
    if (descKey === "positief") {
      explicitPositive = count ?? explicitPositive;
    }
    if (descKey.includes("voicemail")) {
      explicitVoicemail = (explicitVoicemail ?? 0) + (count ?? 0);
    }
    if (descKey.includes("nawt")) {
      explicitNawt = (explicitNawt ?? 0) + (count ?? 0);
    }
    if (descKey === "aantal uur" || descKey === "uren") {
      hours = count ?? hours;
      continue;
    }
    if (count !== null && typeKey) {
      resultRows.push({ label: desc, type, count });
    }
  }

  const totalHandled =
    explicitTotalHandled ??
    resultRows
      .filter((row) => normalizeKey(row.type).includes("effectief afgehandeld") && !normalizeKey(row.type).includes("niet effectief"))
      .reduce((sum, row) => sum + row.count, 0);
  const positive =
    explicitPositive ??
    resultRows
      .filter((row) => normalizeKey(row.type).includes("positief") || normalizeKey(row.type).includes("sale") || normalizeKey(row.label) === "positief")
      .reduce((sum, row) => sum + row.count, 0);
  const voicemail =
    explicitVoicemail ??
    resultRows
      .filter((row) => normalizeKey(row.label).includes("voicemail"))
      .reduce((sum, row) => sum + row.count, 0);
  const nawt =
    explicitNawt ??
    resultRows
      .filter((row) => normalizeKey(row.label).includes("nawt"))
      .reduce((sum, row) => sum + row.count, 0);

  return { resultRows, totalHandled, positive, voicemail, nawt, hours };
}

function extractInboundWeek(rows) {
  return {
    answered:
      getMetricFromRows(rows, "Total calls answered") ??
      getMetricFromRows(rows, "Aangenomen Calls") ??
      getMetricFromRows(rows, "Aangenomen calls"),
    offered:
      getMetricFromRows(rows, "Total calls offered") ??
      getMetricFromRows(rows, "Aangeboden calls") ??
      getMetricFromRows(rows, "Aangeboden Calls"),
    answeredUnder60:
      getMetricFromRows(rows, "Total calls answered < 60 sec.") ??
      getMetricFromRows(rows, "Binnen 60 seconden") ??
      getMetricFromRows(rows, "Binnen 30 seconden"),
    answeredOver60: getMetricFromRows(rows, "Total calls answered > 60 sec."),
    avgWait: getMetricFromRows(rows, "Average waittime (sec.)"),
    avgCall: getMetricFromRows(rows, "Average calltime (sec.)"),
    avgHandling: getMetricFromRows(rows, "Average handlingtime (sec.)"),
    hours:
      getMetricFromRows(rows, "Uren") ??
      getMetricFromRows(rows, "Inzet agenten (uren)") ??
      getMetricFromRows(rows, "Totaal"),
  };
}

function readExcelReport(config, args) {
  const filePath = path.join(REPORTAGES_DIR, config.file);
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    cellFormula: false,
    cellStyles: false,
  });
  const weekSheets = getWeekSheets(workbook, args.year, args.throughWeek);
  const weeks = {};

  for (const { week, sheetName } of weekSheets) {
    const rows = workbookRows(workbook, sheetName);
    if (config.template === "outbound_standard") {
      weeks[week] = { sheetName, metrics: extractOutboundWeek(rows) };
    } else if (config.template === "flat") {
      weeks[week] = { sheetName, metrics: extractFlatWeek(rows) };
    } else {
      weeks[week] = { sheetName, metrics: extractInboundWeek(rows) };
    }
  }

  return {
    file: config.file,
    template: config.template,
    basicallProjectId: config.basicallProjectId,
    sheetCount: workbook.SheetNames.length,
    weeks,
  };
}

async function fetchAllPages(queryBuilder, pageSize = 1000) {
  const result = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilder.range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    result.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return result;
}

function emptyDbWeek() {
  return {
    calls: 0,
    sales: 0,
    recurring: 0,
    oneoff: 0,
    annualValue: 0,
    annualValueRecurring: 0,
    unreachable: 0,
    durationSec: 0,
    loggedSeconds: 0,
    handled: 0,
    notHandled: 0,
    resultCounts: new Map(),
    overrideSource: false,
  };
}

function metricNumber(metrics, key, fallback = 0) {
  const value = metrics?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function deriveCallsFromOverride(metrics) {
  const explicitCalls = metricNumber(metrics, "calls", NaN);
  if (Number.isFinite(explicitCalls)) return explicitCalls;
  const answered = metricNumber(metrics, "answered", NaN);
  if (Number.isFinite(answered)) return answered;
  const sales = metricNumber(metrics, "sales", 0);
  const bruto = metricNumber(metrics, "brutoConversion", 0);
  if (sales > 0 && bruto > 0) return sales / bruto;
  return sales;
}

function overrideToDbWeek(override) {
  const metrics = override.metrics || {};
  const bucket = emptyDbWeek();
  bucket.overrideSource = true;
  bucket.calls = deriveCallsFromOverride(metrics);
  bucket.sales = metricNumber(metrics, "sales", 0);
  bucket.recurring = metricNumber(metrics, "recurring", 0);
  bucket.oneoff = metricNumber(metrics, "oneoff", 0);
  bucket.annualValue = metricNumber(metrics, "annualValue", 0);
  bucket.annualValueRecurring = metricNumber(metrics, "annualValueRecurring", 0);
  bucket.brutoConversion = metricNumber(metrics, "brutoConversion", bucket.calls > 0 ? bucket.sales / bucket.calls : 0);
  bucket.nettoConversion = metricNumber(metrics, "nettoConversion", bucket.calls > 0 ? bucket.sales / bucket.calls : 0);
  bucket.hours = metricNumber(metrics, "hours", 0);
  bucket.stockSupplied = metricNumber(metrics, "stockSupplied", null);
  bucket.stockHandled = metricNumber(metrics, "stockHandled", null);
  bucket.stockRemaining = metricNumber(metrics, "stockRemaining", null);
  bucket.flatTotalHandled = metricNumber(metrics, "totalHandled", null);
  bucket.flatPositive = metricNumber(metrics, "positive", null);
  bucket.flatVoicemail = metricNumber(metrics, "voicemail", null);
  bucket.flatNawt = metricNumber(metrics, "nawt", null);
  bucket.offered = metricNumber(metrics, "offered", null);
  bucket.answeredUnder60 = metricNumber(metrics, "answeredUnder60", null);
  bucket.answeredOver60 = metricNumber(metrics, "answeredOver60", null);
  bucket.avgWait = metricNumber(metrics, "avgWait", null);
  bucket.avgCall = metricNumber(metrics, "avgCall", null);
  bucket.avgHandling = metricNumber(metrics, "avgHandling", null);
  for (const row of override.result_rows || []) {
    bucket.resultCounts.set(normalizeKey(row.label), row.count);
  }
  bucket.handled = metricNumber(metrics, "totalHandled", bucket.calls);
  return bucket;
}

function aggregateDb(project, records, loggedRows, args) {
  const weeks = {};
  for (let week = 1; week <= args.throughWeek; week += 1) {
    weeks[week] = emptyDbWeek();
  }

  const mapping = project.mapping_config || {};
  const saleSet = new Set(mapping.sale_results || []);
  const unreachableSet = new Set(mapping.unreachable_results || []);
  const handledSet = new Set(mapping.handled_results || []);
  const notHandledSet = new Set(mapping.not_handled_results || []);
  const amountCol = mapping.amount_col || "termijnbedrag";
  const freqCol = mapping.freq_col || "frequentie";
  const freqMap = mapping.freq_map || {};

  for (const record of records) {
    const date = parseBasiCallDate(record.beldatum_date || record.beldatum);
    if (!date || getISOWeekYear(date) !== args.year) continue;
    const week = Number(record.week_number) || getISOWeekNumber(date);
    if (!weeks[week]) continue;
    const bucket = weeks[week];
    const raw = record.raw_data || {};
    const resultName = record.resultaat || raw.bc_result_naam || "Onbekend";
    const resultKey = normalizeKey(resultName);
    const isSale = saleSet.has(resultName);
    const isUnreachable = unreachableSet.has(resultName);
    const freqRaw = raw.frequency ?? raw[freqCol] ?? raw.frequentie ?? raw.Frequentie ?? raw.Ntermijn ?? raw.Termijn;
    const freq = detectFrequencyFromConfig(freqRaw, freqMap, resultName);
    const amountRaw = raw.amount ?? raw[amountCol] ?? raw.termijnbedrag ?? raw.Bedrag ?? raw.Nbedrag;
    const amount = parseDutchFloat(amountRaw);
    const annualValue = isSale ? amount * freq.multiplier : 0;

    bucket.calls += 1;
    bucket.durationSec += Number(record.gesprekstijd_sec) || 0;
    bucket.resultCounts.set(resultKey, (bucket.resultCounts.get(resultKey) || 0) + 1);
    if (isSale) {
      bucket.sales += 1;
      bucket.annualValue += annualValue;
      if (freq.isOneOff) {
        bucket.oneoff += 1;
      } else {
        bucket.recurring += 1;
        bucket.annualValueRecurring += annualValue;
      }
    }
    if (isUnreachable) bucket.unreachable += 1;
    if (handledSet.has(resultName)) bucket.handled += 1;
    if (notHandledSet.has(resultName)) bucket.notHandled += 1;
  }

  for (const row of loggedRows) {
    const date = parseBasiCallDate(row.date);
    if (!date || getISOWeekYear(date) !== args.year) continue;
    const week = getISOWeekNumber(date);
    if (!weeks[week]) continue;
    weeks[week].loggedSeconds += Number(row.corrected_seconds ?? row.total_seconds) || 0;
  }

  for (const bucket of Object.values(weeks)) {
    bucket.brutoConversion = bucket.calls > 0 ? bucket.sales / bucket.calls : 0;
    bucket.nettoConversion = bucket.calls - bucket.unreachable > 0 ? bucket.sales / (bucket.calls - bucket.unreachable) : 0;
    bucket.hours = ceilHoursFromSeconds(bucket.loggedSeconds || bucket.durationSec);
  }

  return weeks;
}

function compareValues({ excel, db, tolerance, unit }) {
  if (excel === null || excel === undefined) {
    return { status: "not_in_excel", diff: null };
  }
  if (db === null || db === undefined) {
    return { status: "unsupported", diff: null };
  }
  const diff = db - excel;
  const status = Math.abs(diff) <= tolerance ? "match" : "mismatch";
  return { status, diff: roundValue(diff, unit) };
}

function roundValue(value, unit) {
  if (value === null || value === undefined || !Number.isFinite(value)) return value;
  if (unit === "percent") return Number(value.toFixed(6));
  if (unit === "money") return Number(value.toFixed(2));
  return Number(value.toFixed(3));
}

function addComparison(comparisons, base, metric, excel, db, unit, tolerance, note = "") {
  const { status, diff } = compareValues({ excel, db, tolerance, unit });
  comparisons.push({
    ...base,
    metric,
    unit,
    excel: roundValue(excel, unit),
    supabase: roundValue(db, unit),
    diff,
    status,
    note,
  });
}

function addUnsupported(comparisons, base, metric, excel, note) {
  comparisons.push({
    ...base,
    metric,
    unit: "number",
    excel: roundValue(excel, "number"),
    supabase: null,
    diff: null,
    status: "unsupported",
    note,
  });
}

function compareOutbound(comparisons, base, excelWeek, dbWeek) {
  const metrics = excelWeek.metrics;
  addComparison(comparisons, base, "sales", metrics.sales, dbWeek.sales, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "recurring", metrics.recurring, dbWeek.recurring, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "oneoff", metrics.oneoff, dbWeek.oneoff, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "annual_value", metrics.annualValue, dbWeek.annualValue, "money", MONEY_TOLERANCE);
  addComparison(comparisons, base, "annual_value_recurring", metrics.annualValueRecurring, dbWeek.annualValueRecurring, "money", MONEY_TOLERANCE);
  addComparison(comparisons, base, "bruto_conversion", metrics.brutoConversion, dbWeek.brutoConversion, "percent", PERCENT_TOLERANCE);
  addComparison(comparisons, base, "netto_conversion", metrics.nettoConversion, dbWeek.nettoConversion, "percent", PERCENT_TOLERANCE);
  addComparison(comparisons, base, "hours", metrics.hours, dbWeek.hours, "hours", HOURS_TOLERANCE);
  if (dbWeek.overrideSource) {
    addComparison(comparisons, base, "stock_supplied_snapshot", metrics.supplied, dbWeek.stockSupplied, "count", COUNT_TOLERANCE);
    addComparison(comparisons, base, "stock_handled_snapshot", metrics.handledStock, dbWeek.stockHandled, "count", COUNT_TOLERANCE);
    addComparison(comparisons, base, "stock_remaining_snapshot", metrics.remainingStock, dbWeek.stockRemaining, "count", COUNT_TOLERANCE);
  } else {
    addUnsupported(comparisons, base, "stock_supplied_snapshot", metrics.supplied, "Excel voorraad snapshots are not historically stored in Supabase batches.");
    addUnsupported(comparisons, base, "stock_handled_snapshot", metrics.handledStock, "Excel voorraad snapshots are not historically stored in Supabase batches.");
    addUnsupported(comparisons, base, "stock_remaining_snapshot", metrics.remainingStock, "Excel voorraad snapshots are not historically stored in Supabase batches.");
  }
}

function compareFlat(comparisons, base, excelWeek, dbWeek, project) {
  const metrics = excelWeek.metrics;
  const mapping = project.mapping_config || {};
  const saleSet = new Set(mapping.sale_results || []);
  const voicemailSet = new Set(mapping.flat_voicemail_results || []);
  const nawtSet = new Set(mapping.flat_nawt_results || []);
  const dbPositive = dbWeek.overrideSource ? dbWeek.flatPositive : countDbResults(dbWeek, saleSet);
  const dbVoicemail = dbWeek.overrideSource ? dbWeek.flatVoicemail : countDbResults(dbWeek, voicemailSet);
  const dbNawt = dbWeek.overrideSource ? dbWeek.flatNawt : countDbResults(dbWeek, nawtSet);
  const dbHandled = dbWeek.overrideSource ? dbWeek.flatTotalHandled : dbWeek.calls - dbVoicemail - dbNawt;

  for (const row of metrics.resultRows) {
    const dbCount = dbWeek.resultCounts.get(normalizeKey(row.label)) || 0;
    addComparison(
      comparisons,
      { ...base, excel_label: row.label },
      `result:${row.label}`,
      row.count,
      dbCount,
      "count",
      COUNT_TOLERANCE,
      row.type,
    );
  }
  addComparison(comparisons, base, "flat_total_handled", metrics.totalHandled, dbHandled, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "flat_positive", metrics.positive, dbPositive, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "flat_voicemail", metrics.voicemail, dbVoicemail, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "flat_nawt", metrics.nawt, dbNawt, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "hours", metrics.hours, dbWeek.hours, "hours", HOURS_TOLERANCE);
}

function countDbResults(dbWeek, labels) {
  let count = 0;
  for (const label of labels) {
    count += dbWeek.resultCounts.get(normalizeKey(label)) || 0;
  }
  return count;
}

function compareInbound(comparisons, base, excelWeek, dbWeek) {
  const metrics = excelWeek.metrics;
  addComparison(comparisons, base, "answered_calls_vs_records", metrics.answered, dbWeek.calls, "count", COUNT_TOLERANCE);
  addComparison(comparisons, base, "hours", metrics.hours, dbWeek.hours, "hours", HOURS_TOLERANCE);
  if (dbWeek.overrideSource) {
    addComparison(comparisons, base, "offered_calls", metrics.offered, dbWeek.offered, "count", COUNT_TOLERANCE);
    addComparison(comparisons, base, "answered_under_60_sec", metrics.answeredUnder60, dbWeek.answeredUnder60, "count", COUNT_TOLERANCE);
    addComparison(comparisons, base, "answered_over_60_sec", metrics.answeredOver60, dbWeek.answeredOver60, "count", COUNT_TOLERANCE);
    addComparison(comparisons, base, "average_waittime_sec", metrics.avgWait, dbWeek.avgWait, "number", 0.5);
    addComparison(comparisons, base, "average_calltime_sec", metrics.avgCall, dbWeek.avgCall, "number", 0.5);
    addComparison(comparisons, base, "average_handlingtime_sec", metrics.avgHandling, dbWeek.avgHandling, "number", 0.5);
  } else {
    addUnsupported(comparisons, base, "offered_calls", metrics.offered, "Offered calls are not present in call_records raw_data.");
    addUnsupported(comparisons, base, "answered_under_60_sec", metrics.answeredUnder60, "Answer-speed buckets require wait-time data, not stored in call_records.");
    addUnsupported(comparisons, base, "answered_over_60_sec", metrics.answeredOver60, "Answer-speed buckets require wait-time data, not stored in call_records.");
    addUnsupported(comparisons, base, "average_waittime_sec", metrics.avgWait, "Wait-time data is not stored in call_records.");
    addComparison(comparisons, base, "average_calltime_sec", metrics.avgCall, dbWeek.calls > 0 ? dbWeek.durationSec / dbWeek.calls : 0, "number", 0.5);
    addUnsupported(comparisons, base, "average_handlingtime_sec", metrics.avgHandling, "Handling time is not separately stored in call_records.");
  }
}

function summarizeComparisons(comparisons, matchedReports, unmatchedReports) {
  const statusCounts = {};
  for (const row of comparisons) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }
  const byProject = new Map();
  for (const row of comparisons) {
    const key = row.project_name;
    if (!byProject.has(key)) {
      byProject.set(key, { project_name: key, file: row.file, match: 0, mismatch: 0, unsupported: 0, not_in_excel: 0 });
    }
    const item = byProject.get(key);
    item[row.status] = (item[row.status] || 0) + 1;
  }

  return {
    statusCounts,
    projects: Array.from(byProject.values()).sort((a, b) => a.project_name.localeCompare(b.project_name, "nl")),
    matchedReports,
    unmatchedReports,
    topMismatches: comparisons
      .filter((row) => row.status === "mismatch")
      .sort((a, b) => Math.abs(b.diff || 0) - Math.abs(a.diff || 0))
      .slice(0, 25),
  };
}

function toCsv(rows) {
  const headers = [
    "file",
    "project_name",
    "basicall_project_id",
    "template",
    "week",
    "sheet",
    "metric",
    "excel_label",
    "unit",
    "excel",
    "supabase",
    "diff",
    "status",
    "note",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvCell(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function renderMarkdown(audit) {
  const lines = [];
  lines.push(`# Week 15 Reconciliation`);
  lines.push("");
  lines.push(`Generated: ${audit.generatedAt}`);
  lines.push(`Scope: ${audit.year} week 1-${audit.throughWeek} (${audit.dateRange.start} through ${audit.dateRange.end})`);
  lines.push(`Mode: ${audit.mode}`);
  lines.push("");
  lines.push("## Status Counts");
  lines.push("");
  for (const [status, count] of Object.entries(audit.summary.statusCounts)) {
    lines.push(`- ${status}: ${count}`);
  }
  lines.push("");
  lines.push("## Project Summary");
  lines.push("");
  lines.push("| Project | File | Match | Mismatch | Unsupported | Not in Excel |");
  lines.push("|---|---|---:|---:|---:|---:|");
  for (const project of audit.summary.projects) {
    lines.push(`| ${project.project_name} | ${project.file} | ${project.match || 0} | ${project.mismatch || 0} | ${project.unsupported || 0} | ${project.not_in_excel || 0} |`);
  }
  lines.push("");
  lines.push("## Unmatched / Out Of Scope Workbooks");
  lines.push("");
  for (const report of audit.summary.unmatchedReports) {
    lines.push(`- ${report.file}: ${report.reason}`);
  }
  lines.push("");
  lines.push("## Largest Mismatches");
  lines.push("");
  lines.push("| Project | Week | Metric | Excel | Supabase | Diff |");
  lines.push("|---|---:|---|---:|---:|---:|");
  for (const row of audit.summary.topMismatches) {
    lines.push(`| ${row.project_name} | ${row.week} | ${row.metric} | ${row.excel ?? ""} | ${row.supabase ?? ""} | ${row.diff ?? ""} |`);
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- This audit is read-only and uses only Supabase select queries.");
  lines.push("- Stock snapshots, offered calls, wait-time buckets, and handling time are marked unsupported when they are not present in Supabase raw data.");
  lines.push("- Excel cached formula values are treated as the Excel source of truth.");
  lines.push("");
  return `${lines.join("\n")}`;
}

async function main() {
  const args = parseArgs(process.argv);
  const provider = createDataProvider();

  const start = `${args.year}-01-01`;
  const end = formatDate(isoWeekDate(args.year, args.throughWeek, 7));
  const allFiles = fs.readdirSync(REPORTAGES_DIR).filter((file) => file.endsWith(".xlsx")).sort();
  const matchedByFile = new Map(MATCHED_REPORTS.map((item) => [item.file, item]));
  const unmatchedReports = allFiles
    .filter((file) => !matchedByFile.has(file))
    .map((file) => ({
      file,
      reason: UNMATCHED_FILES.has(file) ? "out_of_scope_no_existing_project" : "unmatched_not_in_config",
    }));

  const matchedIds = MATCHED_REPORTS.map((item) => item.basicallProjectId);
  const projects = await provider.fetchProjects(matchedIds);
  const projectsByBasicallId = new Map((projects || []).map((project) => [project.basicall_project_id, project]));

  const comparisons = [];
  const matchedReports = [];

  for (const config of MATCHED_REPORTS) {
    const project = projectsByBasicallId.get(config.basicallProjectId);
    if (!project) {
      unmatchedReports.push({ file: config.file, reason: `configured project ${config.basicallProjectId} not found in Supabase` });
      continue;
    }

    const excelReport = readExcelReport(config, args);
    const records = await provider.fetchRecords(project.id, start, end);
    const loggedRows = await provider.fetchLoggedRows(project.id, start, end);
    const dbWeeks = aggregateDb(project, records, loggedRows, args);
    let overrideWeeks = new Map();
    if (args.mode === "effective") {
      const overrides = await provider.fetchOverrides(project.id, args.year, args.throughWeek);
      overrideWeeks = new Map((overrides || []).map((override) => [Number(override.week_number), overrideToDbWeek(override)]));
      for (const [week, overrideWeek] of overrideWeeks.entries()) {
        dbWeeks[week] = overrideWeek;
      }
    }
    matchedReports.push({
      file: config.file,
      project_name: project.name,
      basicall_project_id: config.basicallProjectId,
      template: config.template,
      records_read: records.length,
      logged_rows_read: loggedRows.length,
      override_rows_read: overrideWeeks.size,
      week_sheets_read: Object.keys(excelReport.weeks).length,
    });

    for (let week = 1; week <= args.throughWeek; week += 1) {
      const excelWeek = excelReport.weeks[week];
      const dbWeek = dbWeeks[week] || emptyDbWeek();
      const base = {
        file: config.file,
        project_name: project.name,
        basicall_project_id: config.basicallProjectId,
        template: config.template,
        week,
        sheet: excelWeek?.sheetName || "",
      };

      if (!excelWeek) {
        comparisons.push({ ...base, metric: "week_sheet", status: "not_in_excel", unit: "number", excel: null, supabase: dbWeek.calls, diff: null, note: "No Excel sheet for this week." });
        continue;
      }

      if (config.template === "outbound_standard") {
        compareOutbound(comparisons, base, excelWeek, dbWeek);
      } else if (config.template === "flat") {
        compareFlat(comparisons, base, excelWeek, dbWeek, project);
      } else {
        compareInbound(comparisons, base, excelWeek, dbWeek);
      }
    }
  }

  const summary = summarizeComparisons(comparisons, matchedReports, unmatchedReports);
  const audit = {
    generatedAt: new Date().toISOString(),
    year: args.year,
    throughWeek: args.throughWeek,
    dateRange: { start, end },
    dataProvider: provider.name,
    mode: args.mode,
    matchedReports,
    unmatchedReports,
    summary,
    comparisons,
  };

  fs.mkdirSync(args.out, { recursive: true });
  fs.writeFileSync(path.join(args.out, "week15-reconciliation.json"), JSON.stringify(audit, null, 2));
  fs.writeFileSync(path.join(args.out, "week15-reconciliation.csv"), toCsv(comparisons));
  fs.writeFileSync(path.join(args.out, "week15-summary.md"), renderMarkdown(audit));

  console.log(`Wrote ${comparisons.length} comparison rows to ${path.relative(ROOT, args.out)}`);
  console.log(`Matched reports: ${matchedReports.length}; unmatched/out of scope: ${unmatchedReports.length}`);
  console.log(`Status counts: ${JSON.stringify(summary.statusCounts)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
