import { useCallback } from 'react';
import * as XLSX from 'xlsx-js-style';
import { useToast } from '@/hooks/use-toast';
import { ProcessedCallRecord } from '@/types/dashboard';

interface UseExcelExportParams {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  selectedWeek: string | number;
  projectName: string;
}

export function useExcelExport({ data, hourlyRate, selectedWeek, projectName }: UseExcelExportParams) {
  const { toast } = useToast();

  const handleExportToExcel = useCallback(() => {
    const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    
    // Aggregate data by day
    const aggregated: Record<string, { calls: number; sales: number; recurring: number; oneoff: number; annualValue: number; annualValueRecurring: number; durationSec: number }> = {};
    days.forEach((d) => (aggregated[d] = { calls: 0, sales: 0, recurring: 0, oneoff: 0, annualValue: 0, annualValueRecurring: 0, durationSec: 0 }));
    aggregated.total = { calls: 0, sales: 0, recurring: 0, oneoff: 0, annualValue: 0, annualValueRecurring: 0, durationSec: 0 };

    data.forEach((record) => {
      const day = record.day_name?.toLowerCase();
      if (!day || !aggregated[day]) return;

      aggregated[day].calls++;
      aggregated[day].durationSec += record.bc_gesprekstijd;

      if (record.is_sale) {
        aggregated[day].sales++;
        aggregated[day].annualValue += record.annual_value || 0;
        if (record.is_recurring) {
          aggregated[day].recurring++;
          aggregated[day].annualValueRecurring += record.annual_value || 0;
        } else {
          aggregated[day].oneoff++;
        }
      }

      aggregated.total.calls++;
      aggregated.total.durationSec += record.bc_gesprekstijd;
      if (record.is_sale) {
        aggregated.total.sales++;
        aggregated.total.annualValue += record.annual_value || 0;
        if (record.is_recurring) {
          aggregated.total.recurring++;
          aggregated.total.annualValueRecurring += record.annual_value || 0;
        } else {
          aggregated.total.oneoff++;
        }
      }
    });

    // Build rows for Excel
    const calcHours = (durationSec: number) => durationSec / 3600;
    const calcInvestment = (durationSec: number) => calcHours(durationSec) * hourlyRate;
    
    const excelData = [
      ['', ...days.map(d => d.charAt(0).toUpperCase() + d.slice(1)), 'Totaal'],
      ['RESULTATEN', '', '', '', '', '', '', '', ''],
      ['Aantal positief', ...days.map(d => aggregated[d].sales), aggregated.total.sales],
      ['Doorlopende machtigingen', ...days.map(d => aggregated[d].recurring), aggregated.total.recurring],
      ['Eenmalige machtigingen', ...days.map(d => aggregated[d].oneoff), aggregated.total.oneoff],
      ['', '', '', '', '', '', '', '', ''],
      ['FINANCIEEL', '', '', '', '', '', '', '', ''],
      ['Jaarwaarde Totaal', ...days.map(d => `€ ${aggregated[d].annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), `€ ${aggregated.total.annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Jaarwaarde Doorlopend', ...days.map(d => `€ ${aggregated[d].annualValueRecurring.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), `€ ${aggregated.total.annualValueRecurring.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['', '', '', '', '', '', '', '', ''],
      ['PRODUCTIVITEIT', '', '', '', '', '', '', '', ''],
      ['Aantal beluren', ...days.map(d => calcHours(aggregated[d].durationSec).toFixed(1)), calcHours(aggregated.total.durationSec).toFixed(1)],
      ['Bruto Conversie', ...days.map(d => aggregated[d].calls > 0 ? `${((aggregated[d].sales / aggregated[d].calls) * 100).toFixed(1)}%` : '0%'), aggregated.total.calls > 0 ? `${((aggregated.total.sales / aggregated.total.calls) * 100).toFixed(1)}%` : '0%'],
      ['', '', '', '', '', '', '', '', ''],
      ['INVESTERING', '', '', '', '', '', '', '', ''],
      ['Investering (Excl BTW)', ...days.map(d => `€ ${calcInvestment(aggregated[d].durationSec).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), `€ ${calcInvestment(aggregated.total.durationSec).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Investering per donateur', ...days.map(d => aggregated[d].sales > 0 ? `€ ${(calcInvestment(aggregated[d].durationSec) / aggregated[d].sales).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€ 0,00'), aggregated.total.sales > 0 ? `€ ${(calcInvestment(aggregated.total.durationSec) / aggregated.total.sales).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€ 0,00'],
    ];

    // Create workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Week ${selectedWeek === 'all' ? 'Totaal' : selectedWeek}`);

    // Border style definition
    const thinBorder = {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } },
    };

    // Style definitions
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '4A7C4E' } },
      alignment: { horizontal: 'center' as const },
      border: thinBorder
    };
    
    const categoryStyles: Record<string, object> = {
      'RESULTATEN': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '22C55E' } }, border: thinBorder },
      'FINANCIEEL': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '3B82F6' } }, border: thinBorder },
      'PRODUCTIVITEIT': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '8B5CF6' } }, border: thinBorder },
      'INVESTERING': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '06B6D4' } }, border: thinBorder },
    };

    const dataStyle = { border: thinBorder };
    const totalColStyle = { font: { bold: true }, border: thinBorder };

    // Apply styles to all cells
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const categoryRows = [2, 7, 11, 15];
    const categoryNames = ['RESULTATEN', 'FINANCIEEL', 'PRODUCTIVITEIT', 'INVESTERING'];
    const emptyRows = [6, 10, 14];

    for (let row = 1; row <= 17; row++) {
      cols.forEach((col, colIdx) => {
        const cellRef = `${col}${row}`;
        
        if (!ws[cellRef]) {
          ws[cellRef] = { v: '', t: 's' };
        }

        if (row === 1) {
          ws[cellRef].s = headerStyle;
        } else if (categoryRows.includes(row)) {
          const categoryIdx = categoryRows.indexOf(row);
          ws[cellRef].s = categoryStyles[categoryNames[categoryIdx]];
        } else if (emptyRows.includes(row)) {
          ws[cellRef].s = dataStyle;
        } else if (colIdx === 8) {
          ws[cellRef].s = totalColStyle;
        } else {
          ws[cellRef].s = dataStyle;
        }
      });
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 28 },
      ...days.map(() => ({ wch: 14 })),
      { wch: 14 }
    ];

    // Generate filename
    const weekLabel = selectedWeek === 'all' ? 'Totaal' : `Week${selectedWeek}`;
    const filename = `${projectName}_${weekLabel}_Rapport.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);

    toast({
      title: 'Export succesvol',
      description: `Rapport geëxporteerd als ${filename}`,
    });
  }, [data, hourlyRate, selectedWeek, projectName, toast]);

  return { handleExportToExcel };
}
