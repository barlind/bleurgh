import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const FASTLY_SERVICE_LIST_MAX_BUFFER = 50 * 1024 * 1024;

export interface FastlyCliService {
  id: string;
  name: string;
  updatedAt?: string;
}

export function parseFastlyServices(output: string): FastlyCliService[] {
  const parsed: unknown = JSON.parse(output);
  const services = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { data?: unknown }).data)
      ? (parsed as { data: unknown[] }).data
      : null;

  if (!services) {
    throw new Error('Fastly CLI returned an unexpected service list');
  }

  return services.map((service, index) => {
    if (typeof service !== 'object' || service === null) {
      throw new Error(`Fastly CLI returned an invalid service at position ${index + 1}`);
    }

    const record = service as Record<string, unknown>;
    const id = record.id ?? record.ID ?? record.service_id ?? record.ServiceID;
    const name = record.name ?? record.Name;
    const updatedAt = record.updated_at ?? record.UpdatedAt;

    if (typeof id !== 'string' || typeof name !== 'string') {
      throw new Error(`Fastly CLI returned an invalid service at position ${index + 1}`);
    }

    return {
      id,
      name,
      updatedAt: typeof updatedAt === 'string' ? updatedAt : undefined
    };
  });
}

export async function selectFastlyServices(): Promise<string[]> {
  const { autocompleteMultiselect, isCancel } = await import('@clack/prompts');
  let stdout: string;

  try {
    ({ stdout } = await execFileAsync('fastly', [
      'service',
      'list',
      '--sort=updated',
      '--direction=descend',
      '--json'
    ], {
      encoding: 'utf8',
      maxBuffer: FASTLY_SERVICE_LIST_MAX_BUFFER
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to list services with the Fastly CLI: ${message}`);
  }

  const services = parseFastlyServices(stdout);
  if (services.length === 0) {
    throw new Error('Fastly CLI returned no services');
  }

  const selectedServices = await autocompleteMultiselect({
    message: 'Select services to purge',
    options: services.map(service => ({
      label: service.name,
      hint: service.id,
      value: service.id
    })),
    placeholder: 'Type to filter services...',
    maxItems: 15,
    required: true
  });

  if (isCancel(selectedServices)) {
    throw new Error('Interactive service selection cancelled');
  }

  return selectedServices;
}