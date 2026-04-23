import { useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useToast } from '@/hooks/use-toast';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig, ProjectType, ReportTemplate } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';
import { categorizeInboundResult } from '@/lib/statsHelpers';
import { ceilHours } from '@/lib/hours';
import { exportOutboundStandardYear } from '@/hooks/templates/outboundStandardExport';
import { exportFlatYear } from '@/hooks/templates/flatExport';
import { exportInboundServiceYear } from '@/hooks/templates/inboundServiceExport';
import { exportInboundRetentionYear } from '@/hooks/templates/inboundRetentionExport';

interface UseExcelExportParams {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  selectedWeek: string | number;
  projectName: string;
  mappingConfig?: MappingConfig;
  vatRate?: number;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
  projectType?: ProjectType;
  projectId?: string;
  reportTemplate?: ReportTemplate | null;
}

export function useExcelExport({
  data, hourlyRate, selectedWeek, projectName,
  mappingConfig, vatRate = 21, loggedTimeHours, dailyLoggedHours,
  projectType = 'outbound',
  projectId,
  reportTemplate,
}: UseExcelExportParams) {
  const { toast } = useToast();

  const handleExportToExcel = useCallback(() => {
    // Template-specific year export: when a report_template is set, route to its builder.
    // Each template writes its own multi-sheet workbook (Totaal + weektabs) matching the
    // historical rapportage layout. Falls through to legacy single-week export when the
    // template has no builder yet.
    if (reportTemplate === 'outbound_standard' && projectId) {
      void exportOutboundStandardYear({
        projectId,
        projectName,
        hourlyRate,
        vatRate,
        mappingConfig,
        onToast: (msg) => toast(msg),
      });
      return;
    }

    if (reportTemplate === 'flat' && projectId) {
      void exportFlatYear({
        projectId,
        projectName,
        mappingConfig,
        onToast: (msg) => toast(msg),
      });
      return;
    }

    if (reportTemplate === 'inbound_service' && projectId) {
      void exportInboundServiceYear({
        projectId,
        projectName,
        mappingConfig,
        onToast: (msg) => toast(msg),
      });
      return;
    }

    if (reportTemplate === 'inbound_retention' && projectId) {
      void exportInboundRetentionYear({
        projectId,
        projectName,
        mappingConfig,
        onToast: (msg) => toast(msg),
      });
      return;
    }

    if (!data || data.length === 0) {
      toast({
        title: 'Geen gegevens',
        description: 'Er zijn geen records om te exporteren.',
        variant: 'destructive',
      });
      return;
    }

    const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

    const getHourlyRateForDay = (dayName?: string): number => {
      if (dayName && mappingConfig?.weekday_rates) {
        const rate = mappingConfig.weekday_rates[dayName as keyof typeof mappingConfig.weekday_rates];
        if (rate !== undefined && rate > 0) return rate;
      }
      return hourlyRate;
    };

    // Triple Tree regel: per cel naar boven afronden op hele uren.
    const getHoursForDay = (dayName: string, durationSec: number): number => {
      if (dailyLoggedHours) {
        const dh = dailyLoggedHours[dayName as keyof DailyLoggedTimeBreakdown];
        if (dh !== undefined && dh > 0) return ceilHours(dh);
      }
      return ceilHours(durationSec / 3600);
    };

    const getTotalHours = (totalDurationSec: number): number => {
      if (loggedTimeHours !== undefined && loggedTimeHours > 0) return ceilHours(loggedTimeHours);
      return ceilHours(totalDurationSec / 3600);
    };

    // ============================
    // OUTBOUND EXPORT
    // ============================
    if (projectType === 'outbound') {
      const aggregated: Record<string, { calls: number; sales: number; recurring: number; oneoff: number; annualValue: number; annualValueRecurring: number; durationSec: number; totalAmount: number; unreachableCount: number }> = {};
      days.forEach((d) => (aggregated[d] = { calls: 0, sales: 0, recurring: 0, oneoff: 0, annualValue: 0, annualValueRecurring: 0, durationSec: 0, totalAmount: 0, unreachableCount: 0 }));
      aggregated.total = { calls: 0, sales: 0, recurring: 0, oneoff: 0, annualValue: 0, annualValueRecurring: 0, durationSec: 0, totalAmount: 0, unreachableCount: 0 };

      data.forEach((record) => {
        const day = record.day_name?.toLowerCase();
        if (!day || !aggregated[day]) return;
        aggregated[day].calls++;
        aggregated[day].durationSec += record.bc_gesprekstijd;
        aggregated.total.calls++;
        aggregated.total.durationSec += record.bc_gesprekstijd;

        if (record.is_sale) {
          aggregated[day].sales++;
          aggregated[day].annualValue += record.annual_value || 0;
          aggregated[day].totalAmount += record.annual_value || 0;
          aggregated.total.sales++;
          aggregated.total.annualValue += record.annual_value || 0;
          aggregated.total.totalAmount += record.annual_value || 0;
          if (record.is_recurring) {
            aggregated[day].recurring++;
            aggregated[day].annualValueRecurring += record.annual_value || 0;
            aggregated.total.recurring++;
            aggregated.total.annualValueRecurring += record.annual_value || 0;
          } else {
            aggregated[day].oneoff++;
            aggregated.total.oneoff++;
          }
        }
      });

      const calcDayHours = (d: string) => getHoursForDay(d, aggregated[d].durationSec);
      const calcDayInvestment = (d: string) => calcDayHours(d) * getHourlyRateForDay(d);
      const totalHrs = getTotalHours(aggregated.total.durationSec);
      const totalInvestment = days.reduce((sum, d) => sum + calcDayInvestment(d), 0);
      const totalInvestmentInclVat = totalInvestment * (1 + vatRate / 100);
      const roi = totalInvestment > 0 ? aggregated.total.annualValue / totalInvestment : 0;
      const avgDonation = aggregated.total.sales > 0 ? aggregated.total.annualValue / aggregated.total.sales : 0;
      const nettoConversion = aggregated.total.calls > 0 
        ? ((aggregated.total.sales / (aggregated.total.calls - aggregated.total.unreachableCount || aggregated.total.calls)) * 100) 
        : 0;

      const fmt = (v: number) => `€ ${v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const pct = (v: number) => `${v.toFixed(1)}%`;

      const excelData = [
        ['', ...days.map(d => d.charAt(0).toUpperCase() + d.slice(1)), 'Totaal'],
        ['RESULTATEN', '', '', '', '', '', '', '', ''],
        ['Aantal positief', ...days.map(d => aggregated[d].sales), aggregated.total.sales],
        ['Doorlopende machtigingen', ...days.map(d => aggregated[d].recurring), aggregated.total.recurring],
        ['Eenmalige machtigingen', ...days.map(d => aggregated[d].oneoff), aggregated.total.oneoff],
        ['', '', '', '', '', '', '', '', ''],
        ['FINANCIEEL', '', '', '', '', '', '', '', ''],
        ['Jaarwaarde Totaal', ...days.map(d => fmt(aggregated[d].annualValue)), fmt(aggregated.total.annualValue)],
        ['Jaarwaarde Doorlopend', ...days.map(d => fmt(aggregated[d].annualValueRecurring)), fmt(aggregated.total.annualValueRecurring)],
        ['Gem. donatiebedrag', ...days.map(d => aggregated[d].sales > 0 ? fmt(aggregated[d].annualValue / aggregated[d].sales) : fmt(0)), fmt(avgDonation)],
        ['', '', '', '', '', '', '', '', ''],
        ['PRODUCTIVITEIT', '', '', '', '', '', '', '', ''],
        ['Aantal beluren', ...days.map(d => calcDayHours(d).toFixed(1)), totalHrs.toFixed(1)],
        ['Bruto Conversie', ...days.map(d => aggregated[d].calls > 0 ? pct((aggregated[d].sales / aggregated[d].calls) * 100) : '0,0%'), aggregated.total.calls > 0 ? pct((aggregated.total.sales / aggregated.total.calls) * 100) : '0,0%'],
        ['Netto Conversie', '', '', '', '', '', '', '', pct(nettoConversion)],
        ['', '', '', '', '', '', '', '', ''],
        ['INVESTERING', '', '', '', '', '', '', '', ''],
        ['Investering (Excl BTW)', ...days.map(d => fmt(calcDayInvestment(d))), fmt(totalInvestment)],
        ['Investering (Incl BTW)', ...days.map(d => fmt(calcDayInvestment(d) * (1 + vatRate / 100))), fmt(totalInvestmentInclVat)],
        ['BTW bedrag', ...days.map(d => fmt(calcDayInvestment(d) * (vatRate / 100))), fmt(totalInvestment * (vatRate / 100))],
        ['Investering per donateur', ...days.map(d => aggregated[d].sales > 0 ? fmt(calcDayInvestment(d) / aggregated[d].sales) : fmt(0)), aggregated.total.sales > 0 ? fmt(totalInvestment / aggregated.total.sales) : fmt(0)],
        ['ROI (jaarwaarde / investering)', '', '', '', '', '', '', '', roi > 0 ? `${roi.toFixed(2)}x` : '-'],
      ];

      buildAndDownload(excelData, days, 22, [2, 7, 12, 17], ['RESULTATEN', 'FINANCIEEL', 'PRODUCTIVITEIT', 'INVESTERING'], [6, 11, 16]);
    }

    // ============================
    // INBOUND (RETENTIE) EXPORT
    // ============================
    else if (projectType === 'inbound') {
      const agg: Record<string, { calls: number; retained: number; lost: number; partial: number; pending: number; unreachable: number; retainedValue: number; lostValue: number; partialValue: number; durationSec: number }> = {};
      days.forEach(d => (agg[d] = { calls: 0, retained: 0, lost: 0, partial: 0, pending: 0, unreachable: 0, retainedValue: 0, lostValue: 0, partialValue: 0, durationSec: 0 }));
      agg.total = { calls: 0, retained: 0, lost: 0, partial: 0, pending: 0, unreachable: 0, retainedValue: 0, lostValue: 0, partialValue: 0, durationSec: 0 };

      data.forEach((record) => {
        const day = record.day_name?.toLowerCase() || '';
        if (!agg[day]) return;
        const resultName = record.bc_result_naam || 'Onbekend';
        const annualValue = record.annual_value || 0;
        const durationSec = Number(record.bc_gesprekstijd) || 0;

        agg[day].calls++; agg[day].durationSec += durationSec;
        agg.total.calls++; agg.total.durationSec += durationSec;

        if (!mappingConfig) return;
        const cat = categorizeInboundResult(resultName, mappingConfig);
        if (cat === 'retained') { agg[day].retained++; agg[day].retainedValue += annualValue; agg.total.retained++; agg.total.retainedValue += annualValue; }
        else if (cat === 'lost') { agg[day].lost++; agg[day].lostValue += annualValue; agg.total.lost++; agg.total.lostValue += annualValue; }
        else if (cat === 'partial') { agg[day].partial++; agg[day].partialValue += annualValue; agg.total.partial++; agg.total.partialValue += annualValue; }
        else if (cat === 'unreachable') { agg[day].unreachable++; agg.total.unreachable++; }
        else { agg[day].pending++; agg.total.pending++; }
      });

      const fmt = (v: number) => `€ ${v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const pct = (v: number) => `${v.toFixed(1)}%`;
      const calcDayHours = (d: string) => getHoursForDay(d, agg[d].durationSec);
      const calcDayInv = (d: string) => calcDayHours(d) * getHourlyRateForDay(d);
      const totalHrs = getTotalHours(agg.total.durationSec);
      const totalInv = days.reduce((sum, d) => sum + calcDayInv(d), 0);
      const retentionRatio = (s: typeof agg.total) => { const dec = s.retained + s.lost + s.partial; return dec > 0 ? ((s.retained + s.partial) / dec) * 100 : 0; };

      const excelData = [
        ['', ...days.map(d => d.charAt(0).toUpperCase() + d.slice(1)), 'Totaal'],
        ['RETENTIE OVERZICHT', '', '', '', '', '', '', '', ''],
        ['Totaal gesprekken', ...days.map(d => agg[d].calls), agg.total.calls],
        ['Behouden donateurs', ...days.map(d => agg[d].retained), agg.total.retained],
        ['Verloren donateurs', ...days.map(d => agg[d].lost), agg.total.lost],
        ['Omgezet naar eenmalig', ...days.map(d => agg[d].partial), agg.total.partial],
        ['Niet bereikbaar', ...days.map(d => agg[d].unreachable), agg.total.unreachable],
        ['', '', '', '', '', '', '', '', ''],
        ['RETENTIE METRICS', '', '', '', '', '', '', '', ''],
        ['Retentie ratio', ...days.map(d => pct(retentionRatio(agg[d]))), pct(retentionRatio(agg.total))],
        ['', '', '', '', '', '', '', '', ''],
        ['BEHOUDEN WAARDE', '', '', '', '', '', '', '', ''],
        ['Jaarwaarde behouden', ...days.map(d => fmt(agg[d].retainedValue)), fmt(agg.total.retainedValue)],
        ['Jaarwaarde verloren', ...days.map(d => fmt(agg[d].lostValue)), fmt(agg.total.lostValue)],
        ['Netto behouden', ...days.map(d => fmt(agg[d].retainedValue - agg[d].lostValue)), fmt(agg.total.retainedValue - agg.total.lostValue)],
        ['', '', '', '', '', '', '', '', ''],
        ['PRODUCTIVITEIT', '', '', '', '', '', '', '', ''],
        ['Aantal beluren', ...days.map(d => calcDayHours(d).toFixed(1)), totalHrs.toFixed(1)],
        ['Gesprekken per uur', ...days.map(d => { const h = calcDayHours(d); return h > 0 ? (agg[d].calls / h).toFixed(1) : '0'; }), totalHrs > 0 ? (agg.total.calls / totalHrs).toFixed(1) : '0'],
        ['', '', '', '', '', '', '', '', ''],
        ['INVESTERING', '', '', '', '', '', '', '', ''],
        ['Investering (Excl BTW)', ...days.map(d => fmt(calcDayInv(d))), fmt(totalInv)],
        ['Investering (Incl BTW)', ...days.map(d => fmt(calcDayInv(d) * (1 + vatRate / 100))), fmt(totalInv * (1 + vatRate / 100))],
        ['Kosten per behouden', ...days.map(d => agg[d].retained > 0 ? fmt(calcDayInv(d) / agg[d].retained) : fmt(0)), agg.total.retained > 0 ? fmt(totalInv / agg.total.retained) : fmt(0)],
      ];

      buildAndDownload(excelData, days, excelData.length, [2, 9, 12, 17, 21], ['RETENTIE OVERZICHT', 'RETENTIE METRICS', 'BEHOUDEN WAARDE', 'PRODUCTIVITEIT', 'INVESTERING'], [8, 11, 16, 20]);
    }

    // ============================
    // INBOUND SERVICE EXPORT
    // ============================
    else if (projectType === 'inbound_service') {
      const handledSet = new Set(mappingConfig?.handled_results || []);
      const notHandledSet = new Set(mappingConfig?.not_handled_results || []);

      const agg: Record<string, { calls: number; handled: number; notHandled: number; other: number; durationSec: number }> = {};
      days.forEach(d => (agg[d] = { calls: 0, handled: 0, notHandled: 0, other: 0, durationSec: 0 }));
      agg.total = { calls: 0, handled: 0, notHandled: 0, other: 0, durationSec: 0 };

      data.forEach((record) => {
        const day = record.day_name?.toLowerCase() || '';
        if (!agg[day]) return;
        const resultName = record.bc_result_naam || 'Onbekend';
        const dur = Number(record.bc_gesprekstijd) || 0;
        agg[day].calls++; agg[day].durationSec += dur;
        agg.total.calls++; agg.total.durationSec += dur;
        if (handledSet.has(resultName)) { agg[day].handled++; agg.total.handled++; }
        else if (notHandledSet.has(resultName)) { agg[day].notHandled++; agg.total.notHandled++; }
        else { agg[day].other++; agg.total.other++; }
      });

      const fmt = (v: number) => `€ ${v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const pct = (v: number) => `${v.toFixed(1)}%`;
      const calcDayHours = (d: string) => getHoursForDay(d, agg[d].durationSec);
      const calcDayInv = (d: string) => calcDayHours(d) * getHourlyRateForDay(d);
      const totalHrs = getTotalHours(agg.total.durationSec);
      const totalInv = days.reduce((sum, d) => sum + calcDayInv(d), 0);
      const handledRatio = (s: typeof agg.total) => { const t = s.handled + s.notHandled; return t > 0 ? (s.handled / t) * 100 : 0; };

      const excelData = [
        ['', ...days.map(d => d.charAt(0).toUpperCase() + d.slice(1)), 'Totaal'],
        ['OVERZICHT', '', '', '', '', '', '', '', ''],
        ['Totaal gesprekken', ...days.map(d => agg[d].calls), agg.total.calls],
        ['Afgehandeld', ...days.map(d => agg[d].handled), agg.total.handled],
        ['Niet afgehandeld', ...days.map(d => agg[d].notHandled), agg.total.notHandled],
        ['Overig', ...days.map(d => agg[d].other), agg.total.other],
        ['', '', '', '', '', '', '', '', ''],
        ["RATIO'S", '', '', '', '', '', '', '', ''],
        ['Afhandel ratio', ...days.map(d => pct(handledRatio(agg[d]))), pct(handledRatio(agg.total))],
        ['', '', '', '', '', '', '', '', ''],
        ['PRODUCTIVITEIT', '', '', '', '', '', '', '', ''],
        ['Aantal beluren', ...days.map(d => calcDayHours(d).toFixed(1)), totalHrs.toFixed(1)],
        ['Gesprekken per uur', ...days.map(d => { const h = calcDayHours(d); return h > 0 ? (agg[d].calls / h).toFixed(1) : '0'; }), totalHrs > 0 ? (agg.total.calls / totalHrs).toFixed(1) : '0'],
        ['Afgehandeld per uur', ...days.map(d => { const h = calcDayHours(d); return h > 0 ? (agg[d].handled / h).toFixed(1) : '0'; }), totalHrs > 0 ? (agg.total.handled / totalHrs).toFixed(1) : '0'],
        ['', '', '', '', '', '', '', '', ''],
        ['INVESTERING', '', '', '', '', '', '', '', ''],
        ['Investering (Excl BTW)', ...days.map(d => fmt(calcDayInv(d))), fmt(totalInv)],
        ['Investering (Incl BTW)', ...days.map(d => fmt(calcDayInv(d) * (1 + vatRate / 100))), fmt(totalInv * (1 + vatRate / 100))],
        ['Kosten per gesprek', ...days.map(d => agg[d].calls > 0 ? fmt(calcDayInv(d) / agg[d].calls) : fmt(0)), agg.total.calls > 0 ? fmt(totalInv / agg.total.calls) : fmt(0)],
        ['Kosten per afgehandeld', ...days.map(d => agg[d].handled > 0 ? fmt(calcDayInv(d) / agg[d].handled) : fmt(0)), agg.total.handled > 0 ? fmt(totalInv / agg.total.handled) : fmt(0)],
      ];

      buildAndDownload(excelData, days, excelData.length, [2, 8, 11, 16], ['OVERZICHT', "RATIO'S", 'PRODUCTIVITEIT', 'INVESTERING'], [7, 10, 15]);
    }

    // ============================
    // Shared styling + download
    // ============================
    function buildAndDownload(
      excelData: unknown[][],
      days: string[],
      totalRows: number,
      categoryRowNums: number[],
      categoryNames: string[],
      emptyRows: number[]
    ) {
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${selectedWeek}`);

      const thinBorder = {
        top: { style: 'thin', color: { rgb: 'CCCCCC' } },
        bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
        left: { style: 'thin', color: { rgb: 'CCCCCC' } },
        right: { style: 'thin', color: { rgb: 'CCCCCC' } },
      };

      const headerStyle = {
        font: { bold: true, color: { rgb: 'FFFFFF' } },
        fill: { fgColor: { rgb: '4A7C4E' } },
        alignment: { horizontal: 'center' as const },
        border: thinBorder,
      };

      const categoryColors: Record<string, string> = {
        'RESULTATEN': '22C55E', 'FINANCIEEL': '3B82F6', 'PRODUCTIVITEIT': '8B5CF6', 'INVESTERING': '06B6D4',
        'RETENTIE OVERZICHT': '22C55E', 'RETENTIE METRICS': '3B82F6', 'BEHOUDEN WAARDE': '8B5CF6',
        'OVERZICHT': '22C55E', "RATIO'S": '3B82F6',
      };

      const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
      const dataStyle = { border: thinBorder };
      const totalColStyle = { font: { bold: true }, border: thinBorder };

      for (let row = 1; row <= totalRows; row++) {
        cols.forEach((col, colIdx) => {
          const cellRef = `${col}${row}`;
          if (!ws[cellRef]) ws[cellRef] = { v: '', t: 's' };

          if (row === 1) {
            ws[cellRef].s = headerStyle;
          } else if (categoryRowNums.includes(row)) {
            const catIdx = categoryRowNums.indexOf(row);
            const catName = categoryNames[catIdx];
            const color = categoryColors[catName] || '666666';
            ws[cellRef].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: color } }, border: thinBorder };
          } else if (emptyRows.includes(row)) {
            ws[cellRef].s = dataStyle;
          } else if (colIdx === 8) {
            ws[cellRef].s = totalColStyle;
          } else {
            ws[cellRef].s = dataStyle;
          }
        });
      }

      ws['!cols'] = [{ wch: 28 }, ...days.map(() => ({ wch: 14 })), { wch: 14 }];

      const weekLabel = typeof selectedWeek === 'string' && selectedWeek.includes('-') ? selectedWeek.replace(/\//g, '-') : `Week${selectedWeek}`;
      const filename = `${projectName}_${weekLabel}_Rapport.xlsx`;

      try {
        XLSX.writeFile(wb, filename);
        toast({
          title: 'Export succesvol',
          description: `Rapport geëxporteerd als ${filename}`,
        });
      } catch (error) {
        toast({
          title: 'Export mislukt',
          description: error instanceof Error ? error.message : 'Onbekende fout bij het schrijven van het Excel-bestand.',
          variant: 'destructive',
        });
      }
    }
  }, [data, hourlyRate, selectedWeek, projectName, toast, mappingConfig, vatRate, loggedTimeHours, dailyLoggedHours, projectType, projectId, reportTemplate]);

  return { handleExportToExcel };
}
