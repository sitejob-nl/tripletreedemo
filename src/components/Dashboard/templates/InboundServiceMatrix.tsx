import { useMemo } from 'react';
import { Target, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { ServiceReportMatrix } from '../ServiceReportMatrix';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';
import { ceilHours } from '@/lib/hours';

interface InboundServiceMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  mappingConfig?: MappingConfig;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
  showInvestment?: boolean;
}

// Variant 3 of the historical rapportages (Sligro Tintelingen, NL Tour Rides,
// Take 5, Kemkens Solar, Doorpro). Wraps ServiceReportMatrix and adds two
// extra blocks that match the historical klantenservice rapport:
//   1. Service-targets card: Bereikbaarheid / Service level with target comparison
//   2. Toeslag-uren card: minuten na 17:00 / op zaterdag / op zondag (for
//      weekend/evening toeslag-tarief calculations)
//
// Metrics we deliberately skip (BasiCall levert ze niet via Record.get):
// Aangeboden-vs-Aangenomen (only answered), Short Abandoned, Inzet mail uren,
// Gemiddelde nawerktijd. The approximations documented in the plan:
//   Bereikbaarheid ≈ handled / (handled + notHandled)
//   Service level  ≈ calls with gesprekstijd_sec < N / total calls
export function InboundServiceMatrix({
  data,
  hourlyRate,
  vatRate,
  selectedWeek,
  mappingConfig,
  loggedTimeHours,
  dailyLoggedHours,
  showInvestment = false,
}: InboundServiceMatrixProps) {
  const targets = mappingConfig?.service_targets;
  const targetBereikbaarheid = targets?.bereikbaarheid ?? 0.95;
  const targetServiceLevel = targets?.service_level ?? 0.70;
  const serviceLevelSec = targets?.service_level_sec ?? 30;

  const handledSet = useMemo(() => new Set(mappingConfig?.handled_results ?? []), [mappingConfig]);
  const notHandledSet = useMemo(() => new Set(mappingConfig?.not_handled_results ?? []), [mappingConfig]);

  const { bereikbaarheid, serviceLevel, avgDurationMin, toeslag17, toeslagZa, toeslagZo } = useMemo(() => {
    let handled = 0;
    let notHandled = 0;
    let totalCalls = 0;
    let totalDuration = 0;
    let fastAnswered = 0;
    let sec17 = 0;
    let secZa = 0;
    let secZo = 0;

    for (const record of data) {
      const resultName = record.bc_result_naam || 'Onbekend';
      const durationSec = Number(record.bc_gesprekstijd) || 0;
      totalCalls++;
      totalDuration += durationSec;
      if (durationSec > 0 && durationSec < serviceLevelSec) fastAnswered++;

      if (handledSet.has(resultName)) handled++;
      else if (notHandledSet.has(resultName)) notHandled++;

      const day = record.day_name?.toLowerCase() ?? '';
      const beltijd = (record as unknown as { raw_data?: Record<string, unknown> }).raw_data?.bc_beltijd as string | undefined
        ?? (record as unknown as { beltijd?: string }).beltijd
        ?? '';
      const hourMatch = beltijd.match(/^(\d{1,2}):/);
      const hour = hourMatch ? parseInt(hourMatch[1], 10) : NaN;
      if (!isNaN(hour) && hour >= 17) sec17 += durationSec;
      if (day === 'zaterdag') secZa += durationSec;
      else if (day === 'zondag') secZo += durationSec;
    }

    const decided = handled + notHandled;
    return {
      bereikbaarheid: decided > 0 ? handled / decided : 0,
      serviceLevel: totalCalls > 0 ? fastAnswered / totalCalls : 0,
      avgDurationMin: totalCalls > 0 ? totalDuration / totalCalls / 60 : 0,
      toeslag17: ceilHours(sec17 / 3600),
      toeslagZa: ceilHours(secZa / 3600),
      toeslagZo: ceilHours(secZo / 3600),
    };
  }, [data, handledSet, notHandledSet, serviceLevelSec]);

  return (
    <div className="space-y-4">
      {mappingConfig && (
        <ServiceReportMatrix
          data={data}
          hourlyRate={hourlyRate}
          vatRate={vatRate}
          selectedWeek={selectedWeek}
          mappingConfig={mappingConfig}
          loggedTimeHours={loggedTimeHours}
          dailyLoggedHours={dailyLoggedHours}
          showInvestment={showInvestment}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <TargetsCard
          bereikbaarheid={bereikbaarheid}
          bereikbaarheidTarget={targetBereikbaarheid}
          serviceLevel={serviceLevel}
          serviceLevelTarget={targetServiceLevel}
          serviceLevelSec={serviceLevelSec}
          avgDurationMin={avgDurationMin}
        />
        <ToeslagCard toeslag17={toeslag17} toeslagZa={toeslagZa} toeslagZo={toeslagZo} />
      </div>
    </div>
  );
}

function TargetsCard({
  bereikbaarheid,
  bereikbaarheidTarget,
  serviceLevel,
  serviceLevelTarget,
  serviceLevelSec,
  avgDurationMin,
}: {
  bereikbaarheid: number;
  bereikbaarheidTarget: number;
  serviceLevel: number;
  serviceLevelTarget: number;
  serviceLevelSec: number;
  avgDurationMin: number;
}) {
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const bereikbaarheidOK = bereikbaarheid >= bereikbaarheidTarget;
  const serviceLevelOK = serviceLevel >= serviceLevelTarget;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Target size={16} className="text-primary" aria-hidden="true" />
        KPI&apos;s met target
      </h3>
      <div className="space-y-3">
        <MetricRow
          label="Bereikbaarheid"
          value={fmtPct(bereikbaarheid)}
          target={fmtPct(bereikbaarheidTarget)}
          ok={bereikbaarheidOK}
          helper="Afgehandeld / (afgehandeld + niet afgehandeld)"
        />
        <MetricRow
          label={`Service level (< ${serviceLevelSec}s)`}
          value={fmtPct(serviceLevel)}
          target={fmtPct(serviceLevelTarget)}
          ok={serviceLevelOK}
          helper={`Gesprekken korter dan ${serviceLevelSec} seconden / totaal`}
        />
        <MetricRow
          label="Gemiddelde gesprekstijd"
          value={`${avgDurationMin.toFixed(2)} min`}
          target="—"
          ok={null}
          helper="Totale gesprekstijd / aantal gesprekken"
        />
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  target,
  ok,
  helper,
}: {
  label: string;
  value: string;
  target: string;
  ok: boolean | null;
  helper?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {helper && <div className="text-[11px] text-muted-foreground">{helper}</div>}
      </div>
      <div className="text-right">
        <div className="flex items-center justify-end gap-1.5 text-sm font-bold text-foreground">
          {ok !== null &&
            (ok ? (
              <CheckCircle2 size={14} className="text-green-600" aria-hidden="true" />
            ) : (
              <AlertCircle size={14} className="text-destructive" aria-hidden="true" />
            ))}
          <span>{value}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">Target: {target}</div>
      </div>
    </div>
  );
}

function ToeslagCard({
  toeslag17,
  toeslagZa,
  toeslagZo,
}: {
  toeslag17: number;
  toeslagZa: number;
  toeslagZo: number;
}) {
  const fmt = (v: number) => `${v.toFixed(2)} u`;
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <Clock size={16} className="text-primary" aria-hidden="true" />
        Toeslag-uren
      </h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium">Na 17:00 uur</span>
          <span className="font-mono font-bold">{fmt(toeslag17)}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium">Op zaterdag</span>
          <span className="font-mono font-bold">{fmt(toeslagZa)}</span>
        </div>
        <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium">Op zondag</span>
          <span className="font-mono font-bold">{fmt(toeslagZo)}</span>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Uren berekend uit gesprekstijd per record. Relevant voor evening/weekend-toeslag-tarief.
        </p>
      </div>
    </div>
  );
}
