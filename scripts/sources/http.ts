import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { parse } from 'csv-parse/sync';

export const RAW_DIR = path.resolve('data/raw');

/** Returns the cached raw file if present, otherwise fetches and caches it. Keeps re-runs fast and offline-friendly. */
export async function cachedDownload(
  fileName: string,
  fetcher: () => Promise<Buffer>,
): Promise<Buffer> {
  const filePath = path.join(RAW_DIR, fileName);
  if (existsSync(filePath)) {
    console.log(`  cache hit  ${fileName}`);
    return readFile(filePath);
  }
  console.log(`  download   ${fileName}`);
  const data = await fetcher();
  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(filePath, data);
  return data;
}

export async function fetchBuffer(url: string, init?: RequestInit): Promise<Buffer> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Extracts the first CSV in a zip archive and parses it into header-keyed records. */
export function parseZippedCsv(zip: Buffer): Record<string, string>[] {
  const entry = new AdmZip(zip)
    .getEntries()
    .find((e) => e.entryName.toLowerCase().endsWith('.csv') && !/documentation/i.test(e.entryName));
  if (!entry) throw new Error('No CSV found in archive');
  return parseCsv(entry.getData());
}

export function parseCsv(data: Buffer | string): Record<string, string>[] {
  return parse(data, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  });
}

export const num = (value: string | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
