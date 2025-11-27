import { useMemo } from 'react';
import { ProcessedCallRecord, DayStats } from '@/types/dashboard';

interface ReportMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  selectedWeek: string | number;
}

export const ReportMatrix = ({ data, hourlyRate, selectedWeek }: ReportMatrixProps) => {
  const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

  const aggregated = useMemo(() => {
    const result: Record<string, DayStats> = {};
    days.forEach((d) => (result[d] = {
      calls: 0,
      sales: 0,
      recurring: 0,
      oneoff: 0,
      annualValue: 0,
      annualValueRecurring: 0,
      durationSec: 0,
    }));
    result.total = {
      calls: 0,
      sales: 0,
      recurring: 0,
      oneoff: 0,
      annualValue: 0,
      annualValueRecurring: 0,
      durationSec: 0,
    };

    data.forEach((record) => {
      const day = record.day_name.toLowerCase();
      if (!result[day]) return;

      result[day].calls++;
      result[day].durationSec += record.bc_gesprekstijd;

      if (record.is_sale) {
        result[day].sales++;
        result[day].annualValue += record.annual_value;

        if (record.is_recurring) {
          result[day].recurring++;
          result[day].annualValueRecurring += record.annual_value;
        } else {
          result[day].oneoff++;
        }
      }

      result.total.calls++;
      result.total.durationSec += record.bc_gesprekstijd;
      if (record.is_sale) {
        result.total.sales++;
        result.total.annualValue += record.annual_value;
        if (record.is_recurring) {
          result.total.recurring++;
          result.total.annualValueRecurring += record.annual_value;
        } else {
          result.total.oneoff++;
        }
      }
    });
    return result;
  }, [data]);

  const calcHours = (stats: DayStats) => stats.durationSec / 3600;
  const calcSalesPerHour = (stats: DayStats) => {
    const hours = calcHours(stats);
    return hours > 0 ? (stats.sales / hours).toFixed(2) : '0.00';
  };
  const calcInvestment = (stats: DayStats) => calcHours(stats) * hourlyRate;
  const calcCostPerDonor = (stats: DayStats) =>
    stats.sales > 0 ? calcInvestment(stats) / stats.sales : 0;
  const calcConversion = (stats: DayStats) =>
    stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0;

  const renderRow = (
    label: string,
    valueKey: keyof DayStats | null,
    isCurrency = false,
    isPercent = false,
    isCalculation: ((stats: DayStats) => number | string) | null = null
  ) => (
    <tr className="hover:bg-muted/30 transition-colors border-b border-border/50">
      <td className="px-6 py-4 font-medium text-foreground bg-muted/30 sticky left-0">{label}</td>
      {days.map((day) => {
        let val: number | string = 0;
        if (isCalculation) {
          val = isCalculation(aggregated[day]);
        } else if (valueKey) {
          val = aggregated[day][valueKey] as number;
        }

        return (
          <td key={day} className="px-6 py-4 text-right text-foreground">
            {isCurrency
              ? `€ ${(typeof val === 'number' ? val : parseFloat(val as string)).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`
              : isPercent
              ? `${(typeof val === 'number' ? val : parseFloat(val as string)).toFixed(1)}%`
              : val}
          </td>
        );
      })}
      <td className="px-6 py-4 text-right font-bold text-foreground bg-muted/30">
        {isCalculation
          ? isCurrency
            ? `€ ${(typeof isCalculation(aggregated.total) === 'number' ? isCalculation(aggregated.total) : parseFloat(isCalculation(aggregated.total) as string)).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`
            : isCalculation(aggregated.total)
          : valueKey
          ? isCurrency
            ? `€ ${(aggregated.total[valueKey] as number).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`
            : aggregated.total[valueKey]
          : ''}
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto bg-card rounded-2xl border border-border shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-foreground font-semibold">
          <tr>
            <th className="px-6 py-4 text-left sticky left-0 bg-muted/50 z-10 rounded-tl-2xl">
              Week {selectedWeek === 'all' ? 'Totaal' : selectedWeek}
            </th>
            {days.map((d) => (
              <th key={d} className="px-6 py-4 text-right capitalize">
                {d}
              </th>
            ))}
            <th className="px-6 py-4 text-right font-bold rounded-tr-2xl">Totaal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-green text-kpi-green-text font-bold text-xs uppercase tracking-wider">
              Resultaten
            </td>
          </tr>
          {renderRow('Aantal positief', 'sales')}
          {renderRow('Aantal doorlopende machtigingen', 'recurring')}
          {renderRow('Aantal eenmalige machtigingen', 'oneoff')}

          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-blue text-kpi-blue-text font-bold text-xs uppercase tracking-wider">
              Financieel
            </td>
          </tr>
          {renderRow('Jaarwaarde Totaal', 'annualValue', true)}
          {renderRow('Jaarwaarde Doorlopend', 'annualValueRecurring', true)}

          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-purple text-kpi-purple-text font-bold text-xs uppercase tracking-wider">
              Productiviteit & Conversie
            </td>
          </tr>
          {renderRow('Aantal beluren', null, false, false, (s) => calcHours(s).toFixed(1))}
          {renderRow('Gesprekken per uur', null, false, false, calcSalesPerHour)}
          {renderRow('Bruto Conversie', null, false, true, calcConversion)}

          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-cyan text-kpi-cyan-text font-bold text-xs uppercase tracking-wider">
              Investering (o.b.v. €{hourlyRate}/u)
            </td>
          </tr>
          {renderRow('Investering (Excl BTW)', null, true, false, calcInvestment)}
          {renderRow('Investering per donateur', null, true, false, calcCostPerDonor)}
        </tbody>
      </table>
    </div>
  );
};
