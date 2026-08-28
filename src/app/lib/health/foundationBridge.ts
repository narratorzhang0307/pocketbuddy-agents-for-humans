import type { GarminReadQuery, HealthsyncQuery } from '../../../../frost-agent/skills/health/foundation';

export interface ConnectorStatus {
  available: boolean;
  reason?: string;
  version?: unknown;
}

export interface HealthSkillBridgeStatus {
  localBridgeEnabled: boolean;
  healthsync: ConnectorStatus;
  garmin: ConnectorStatus;
  openFoodFacts: ConnectorStatus;
  cnFoodLibrary: ConnectorStatus;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({ error: `http_${response.status}` }));
  if (!response.ok) throw new Error(String(payload?.error || `http_${response.status}`));
  return payload as T;
}

export async function getHealthSkillBridgeStatus(signal?: AbortSignal): Promise<HealthSkillBridgeStatus> {
  return readJson(await fetch('/api/health-skills/status', { signal }));
}

export async function queryHealthsync(query: HealthsyncQuery, signal?: AbortSignal): Promise<unknown> {
  return readJson(await fetch('/api/health-skills/healthsync/query', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query), signal,
  }));
}

export async function queryGarmin(query: GarminReadQuery, signal?: AbortSignal): Promise<unknown> {
  return readJson(await fetch('/api/health-skills/garmin/query', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(query), signal,
  }));
}

export async function uploadAppleHealthExport(file: File): Promise<{ jobId: string; status: string; receivedBytes: number }> {
  const url = new URL('/api/health-skills/healthsync/import', window.location.origin);
  url.searchParams.set('filename', file.name);
  return readJson(await fetch(url, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file }));
}

export async function getHealthsyncImportStatus(): Promise<Record<string, unknown>> {
  return readJson(await fetch('/api/health-skills/healthsync/import/status'));
}

export interface OpenFoodFactsProduct {
  barcode: string;
  name: string;
  brands: string;
  quantity: string;
  servingSize: string;
  nutritionGrade: string;
  nutritionPer100g: Record<string, number | null>;
  missing: string[];
  source: 'Open Food Facts';
}

export async function lookupOpenFoodFacts(input: string, signal?: AbortSignal): Promise<{ products: OpenFoodFactsProduct[]; count: number; retrievedAt: string }> {
  const value = input.trim();
  const url = new URL('/api/health-skills/openfoodfacts', window.location.origin);
  url.searchParams.set(/^\d{8,14}$/.test(value) ? 'barcode' : 'query', value);
  return readJson(await fetch(url, { signal }));
}
