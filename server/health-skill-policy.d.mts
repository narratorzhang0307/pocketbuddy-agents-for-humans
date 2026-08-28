export interface HealthsyncQuery {
  metric: string;
  from?: string;
  to?: string;
  limit?: number;
}

export type GarminReadOperation =
  | 'auth-status' | 'activities' | 'activity' | 'splits' | 'athlete-stats'
  | 'sleep' | 'heart-rate' | 'steps' | 'stress' | 'body-battery'
  | 'resting-heart-rate' | 'training-status' | 'training-readiness' | 'vo2max' | 'hrv';

export interface GarminReadQuery {
  operation: GarminReadOperation;
  activityId?: string;
  date?: string;
  limit?: number;
}

export function buildHealthsyncReadCommand(query: HealthsyncQuery): string[];
export function buildHealthsyncImportCommand(filePath: string): string[];
export function buildGarminReadCommand(query: GarminReadQuery): string[];
export function buildOpenFoodFactsRequest(input: { barcode?: string; query?: string; pageSize?: number }): URL;
