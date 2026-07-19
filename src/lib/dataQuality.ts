import type {
  DataQualityStatus,
  MappingConfig,
  ProjectType,
  QualityMetric,
  ReportingState,
} from '@/types/database';

export const ALL_REPORT_METRICS: QualityMetric[] = [
  'records',
  'sales',
  'annual_value',
  'conversion',
  'retention',
  'service',
  'hours',
  'costs',
  'analysis',
  'export',
];

export interface SyncCoverage {
  day: string;
  status: 'running' | 'success' | 'warning' | 'failed';
  expectedRecords: number;
  recordsSynced: number;
  failedRecords: number;
}

export const isCompleteSyncCoverage = (coverage: SyncCoverage) => (
  coverage.status === 'success'
  && coverage.expectedRecords === coverage.recordsSynced
  && coverage.failedRecords === 0
);

export const findMissingSyncDays = (
  requiredDays: string[],
  coverage: SyncCoverage[],
) => {
  const completeDays = new Set(
    coverage.filter(isCompleteSyncCoverage).map((item) => item.day),
  );
  return requiredDays.filter((day) => !completeDays.has(day));
};

export const resultDriftImpact = (projectType: ProjectType): QualityMetric[] => {
  if (projectType === 'inbound_service') return ['service', 'analysis', 'export'];
  if (projectType === 'inbound') return ['retention', 'annual_value', 'analysis', 'export'];
  return ['sales', 'conversion', 'costs', 'annual_value', 'analysis', 'export'];
};

export const mappingRequiresValueFields = (
  projectType: ProjectType,
  config: MappingConfig,
) => projectType !== 'inbound_service' && config.flat_sale_value === undefined;

export const isMetricBlocked = (
  blockedMetrics: readonly QualityMetric[] | undefined,
  metric: QualityMetric,
) => blockedMetrics?.includes(metric) ?? false;

interface DeriveQualityStateInput {
  reportingState: ReportingState;
  enforcementEnabled: boolean;
  requiredDays: string[];
  coverage: SyncCoverage[];
  issueMetrics?: QualityMetric[];
}

export interface DerivedQualityState {
  status: DataQualityStatus;
  blockedMetrics: QualityMetric[];
  missingDays: string[];
}

export const deriveQualityState = ({
  reportingState,
  enforcementEnabled,
  requiredDays,
  coverage,
  issueMetrics = [],
}: DeriveQualityStateInput): DerivedQualityState => {
  const missingDays = findMissingSyncDays(requiredDays, coverage);
  if (reportingState === 'ended') {
    return { status: 'historical', blockedMetrics: [], missingDays };
  }
  if (reportingState === 'paused') {
    return { status: 'attention', blockedMetrics: [], missingDays };
  }
  if (missingDays.length === 0 && issueMetrics.length === 0) {
    return { status: 'verified', blockedMetrics: [], missingDays };
  }
  if (!enforcementEnabled) {
    return { status: 'attention', blockedMetrics: [], missingDays };
  }
  return {
    status: 'blocked',
    blockedMetrics: missingDays.length > 0 ? [...ALL_REPORT_METRICS] : [...new Set(issueMetrics)],
    missingDays,
  };
};
