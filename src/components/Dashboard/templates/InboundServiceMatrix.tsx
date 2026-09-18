import { useMemo } from 'react';
import { AlertCircle, CheckCircle2, Database, FileSpreadsheet } from 'lucide-react';
import type { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';
import {
  averageMetric,
  buildInboundServiceBreakdown,
  completeMetric,
  SERVICE_DAYS,
  type InboundServiceBucket,
  type ServiceDay,
} from '@/lib/inboundServiceMetrics';
import type { ProcessedCallRecord } from '@/types/dashboard';
import type { MappingConfig, ReportageWeeklyOverride } from '@/types/database';

interface InboundServiceMatrixProps {
  data: ProcessedCallRecord[];
  selectedWeek: string | number;
  mappingConfig?: MappingConfig;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
  reportageOverrides?: ReportageWeeklyOverride[];
}

type MetricValue = number | null;
type Formatter = (value: number) => string;

const DAY_LABELS: Record<ServiceDay, string> = {
  maandag: 'Ma',
  dinsdag: 'Di',
  woensdag: 'Wo',
  donderdag: 'Do',
  vrijdag: 'Vr',
  zaterdag: 'Za',
  zondag: 'Zo',
};

const formatNumber: Formatter = (value) => Math.round(value).toLocaleString('nl-NL');
const formatHours: Formatter = (value) => value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMinutes: Formatter = (value) => value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPercent: Formatter = (value) => `${(value * 100).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function MetricCell({ value, format = formatNumber, emphasis = false }: { value: MetricValue; format?: Formatter; emphasis?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-2 py-2.5 text-right text-xs sm:px-3 sm:text-sm ${emphasis ? 'bg-muted/50 font-bold text-foreground' : 'text-foreground'}`}>
      {value === null ? <span className="text-muted-foreground" title="Niet beschikbaar uit de gekoppelde bron">—</span> : format(value)}
    </td>
  );
}

export function InboundServiceMatrix({
  data,
  selectedWeek,
  mappingConfig,
  dailyLoggedHours,
  reportageOverrides = [],
}: InboundServiceMatrixProps) {
  const serviceLevelSec = mappingConfig?.service_targets?.service_level_sec ?? 30;
  const targetReachability = mappingConfig?.service_targets?.bereikbaarheid ?? 0.95;
  const targetServiceLevel = mappingConfig?.service_targets?.service_level ?? 0.70;
  const report = useMemo(
    () => buildInboundServiceBreakdown(data, mappingConfig, reportageOverrides),
    [data, mappingConfig, reportageOverrides],
  );

  const activeDays = SERVICE_DAYS.filter((day) => report.perDay[day].offered > 0);
  const agentHoursForDay = (day: ServiceDay): MetricValue => {
    const bucket = report.perDay[day];
    if (bucket.agentHoursKnown) return bucket.agentHours;
    const liveHours = dailyLoggedHours?.[day] ?? 0;
    return liveHours > 0 ? liveHours : bucket.offered === 0 ? 0 : null;
  };
  const totalAgentHours = (() => {
    if (report.total.agentHoursKnown) return report.total.agentHours;
    if (activeDays.length === 0) return 0;
    const daily = activeDays.map(agentHoursForDay);
    return daily.every((value) => value !== null)
      ? daily.reduce<number>((sum, value) => sum + (value ?? 0), 0)
      : null;
  })();
  const totalMailHours = report.total.mailHoursKnown ? report.total.mailHours : null;
  const missingWaitTime = completeMetric(
    report.total.answeredWithinThreshold,
    report.total.waitTimeKnown,
    report.total.answered,
  ) === null;
  const missingAfterCall = averageMetric(report.total.afterCallSec, report.total.afterCallKnown, report.total.answered) === null;
  const missingAgentHours = totalAgentHours === null;
  const missingMailHours = totalMailHours === null;
  const unavailableLabels = [
    missingWaitTime ? 'wachttijd / binnen 30 seconden' : null,
    missingAfterCall ? 'nawerktijd' : null,
    missingAgentHours ? 'volledige agenturen' : null,
    missingMailHours ? 'mailuren' : null,
  ].filter(Boolean);

  if (data.length === 0 && reportageOverrides.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Geen klantenservicegesprekken in {selectedWeek === 'all' ? 'deze periode' : `week ${selectedWeek}`}.
        </p>
      </div>
    );
  }

  const bucketWithin = (bucket: InboundServiceBucket) => completeMetric(
    bucket.answeredWithinThreshold,
    bucket.waitTimeKnown,
    bucket.answered,
  );
  const bucketAvgCallMinutes = (bucket: InboundServiceBucket) => {
    const averageSeconds = averageMetric(bucket.durationSec, bucket.durationKnown, bucket.answered);
    return averageSeconds === null ? null : averageSeconds / 60;
  };
  const bucketAvgAfterCallMinutes = (bucket: InboundServiceBucket) => {
    const averageSeconds = averageMetric(bucket.afterCallSec, bucket.afterCallKnown, bucket.answered);
    return averageSeconds === null ? null : averageSeconds / 60;
  };
  const bucketReachability = (bucket: InboundServiceBucket) => ratio(
    bucket.answered,
    Math.max(0, bucket.offered - bucket.shortAbandoned),
  );
  const bucketServiceLevel = (bucket: InboundServiceBucket): MetricValue => {
    const within = bucketWithin(bucket);
    return within === null ? null : ratio(within, bucket.answered);
  };

  const renderRow = (
    label: string,
    getValue: (bucket: InboundServiceBucket, day?: ServiceDay) => MetricValue,
    format: Formatter = formatNumber,
    target?: MetricValue,
  ) => (
    <tr className="border-b border-border/50 transition-colors hover:bg-muted/30">
      <th scope="row" className="sticky left-0 z-10 min-w-[190px] border-r border-border/30 bg-card px-3 py-2.5 text-left text-xs font-medium text-foreground sm:min-w-[260px] sm:px-4 sm:text-sm">
        {label}
      </th>
      <MetricCell value={target ?? null} format={format} />
      {SERVICE_DAYS.map((day) => <MetricCell key={day} value={getValue(report.perDay[day], day)} format={format} />)}
      <MetricCell value={getValue(report.total)} format={format} emphasis />
    </tr>
  );

  const renderSection = (title: string, className: string) => (
    <tr>
      <th colSpan={SERVICE_DAYS.length + 3} className={`px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider sm:text-xs ${className}`}>
        {title}
      </th>
    </tr>
  );

  const categoryRow = (label: string, type: 'reason' | 'caller') => renderRow(
    label,
    (bucket) => bucket[type === 'reason' ? 'reasons' : 'callers'][label] ?? 0,
  );

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border p-4 ${unavailableLabels.length > 0 ? 'border-amber-300/70 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100' : 'border-emerald-300/70 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100'}`}>
        <div className="flex items-start gap-3">
          {unavailableLabels.length > 0
            ? <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            : <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
          <div>
            <p className="text-sm font-semibold">
              {unavailableLabels.length > 0 ? 'Rapportage gebruikt alleen aantoonbare brondata' : 'Alle rapportagevelden zijn beschikbaar'}
            </p>
            <p className="mt-1 text-xs leading-relaxed opacity-90">
              {unavailableLabels.length > 0
                ? `Nog niet volledig aangeleverd: ${unavailableLabels.join(', ')}. Deze waarden blijven bewust leeg en worden niet uit gespreksduur afgeleid.`
                : 'De geselecteerde periode bevat alle benodigde waarden voor de overeengekomen KPI’s.'}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
              <span className="inline-flex items-center gap-1 rounded-full border border-current/20 px-2 py-0.5">
                <Database className="h-3 w-3" aria-hidden="true" /> Live BasiCall-records
              </span>
              {report.usesExcelOverrides && (
                <span className="inline-flex items-center gap-1 rounded-full border border-current/20 px-2 py-0.5">
                  <FileSpreadsheet className="h-3 w-3" aria-hidden="true" /> Goedgekeurde Excel-aanvulling
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto rounded-xl border border-border bg-card shadow-sm sm:mx-0 sm:rounded-2xl">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-muted/50 font-semibold text-foreground">
            <tr>
              <th scope="col" className="sticky left-0 z-20 min-w-[190px] rounded-tl-xl bg-muted/50 px-3 py-3 text-left sm:min-w-[260px] sm:rounded-tl-2xl sm:px-4">
                {selectedWeek === 'all' ? 'Klantenservice totaal' : `Klantenservice week ${selectedWeek}`}
              </th>
              <th scope="col" className="min-w-[72px] px-2 py-3 text-right">Target</th>
              {SERVICE_DAYS.map((day) => <th key={day} scope="col" className="min-w-[62px] px-2 py-3 text-right" title={day}>{DAY_LABELS[day]}</th>)}
              <th scope="col" className="min-w-[82px] rounded-tr-xl bg-muted/70 px-2 py-3 text-right sm:rounded-tr-2xl">Totaal</th>
            </tr>
          </thead>
          <tbody>
            {renderSection('Uren', 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100')}
            {renderRow('Inzet agenten (uren)', (bucket, day) => day ? agentHoursForDay(day) : totalAgentHours, formatHours)}
            {renderRow('Inzet mail (uren)', (bucket) => bucket.mailHoursKnown ? bucket.mailHours : null, formatHours)}
            {renderRow('Totaal uren', (bucket, day) => {
              const agent = day ? agentHoursForDay(day) : totalAgentHours;
              const mail = bucket.mailHoursKnown ? bucket.mailHours : null;
              return agent === null || mail === null ? null : agent + mail;
            }, formatHours)}

            {renderSection('Records', 'bg-kpi-green text-kpi-green-text')}
            {renderRow('Aangeboden calls', (bucket) => bucket.offered)}
            {renderRow('Aangenomen calls', (bucket) => bucket.answered)}
            {renderRow(`Binnen ${serviceLevelSec} seconden`, bucketWithin)}
            {renderRow('Short abandoned', (bucket) => bucket.shortAbandoned)}

            {renderSection("KPI's", 'bg-kpi-blue text-kpi-blue-text')}
            {renderRow('Gemiddelde gesprekstijd (min)', bucketAvgCallMinutes, formatMinutes)}
            {renderRow('Gemiddelde nawerktijd (min)', bucketAvgAfterCallMinutes, formatMinutes)}
            {renderRow('Bereikbaarheid', bucketReachability, formatPercent, targetReachability)}
            {renderRow('Service level', bucketServiceLevel, formatPercent, targetServiceLevel)}
            {renderRow('Short abandoned %', (bucket) => ratio(bucket.shortAbandoned, bucket.offered), formatPercent)}

            {report.reasonLabels.length > 0 && (
              <>
                {renderSection('Callreasons', 'bg-kpi-cyan text-kpi-cyan-text')}
                {report.reasonLabels.map((label) => categoryRow(label, 'reason'))}
                {renderRow('Totaal callreasons', (bucket) => Object.values(bucket.reasons).reduce((sum, count) => sum + count, 0))}
              </>
            )}

            {report.callerLabels.length > 0 && (
              <>
                {renderSection('Gebeld door', 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100')}
                {report.callerLabels.map((label) => categoryRow(label, 'caller'))}
                {renderRow('Totaal gebeld door', (bucket) => Object.values(bucket.callers).reduce((sum, count) => sum + count, 0))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
