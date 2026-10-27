import { LANGUAGES, type LanguageCode } from '../domain/languages.js';
import { normalizePhone } from '../domain/phone.js';
import type { ConsentStatus } from '../domain/compliance.js';
import type { LeadStatus, Supplier } from '../domain/types.js';
import { audit, ServiceError, type Services } from './context.js';

export interface SupplierInput {
  phone: string;
  company_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  products?: string[];
  preferred_language?: LanguageCode | null;
  contact_source: string;
  consent?: { status: ConsentStatus; basis: string; evidence?: string | null };
}

export interface CreateSupplierResult {
  supplier: Supplier;
  created: boolean;
}

export async function createSupplier(services: Services, actor: string, input: SupplierInput): Promise<CreateSupplierResult> {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new ServiceError(422, `Invalid phone number: ${input.phone}`);

  const existing = await services.store.find('suppliers', { where: { phone_e164: phone } });
  if (existing[0]) return { supplier: existing[0] as unknown as Supplier, created: false };

  const supplier = (await services.store.insert('suppliers', {
    phone_e164: phone,
    company_name: input.company_name ?? null,
    contact_name: input.contact_name ?? null,
    email: input.email ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    products: input.products ?? [],
    preferred_language: input.preferred_language ?? null,
    lead_status: 'new',
    do_not_call: false,
    contact_source: input.contact_source,
  })) as unknown as Supplier;

  if (input.consent) {
    await services.store.insert('consent_records', {
      supplier_id: supplier.id,
      status: input.consent.status,
      basis: input.consent.basis,
      source: input.contact_source,
      evidence: input.consent.evidence ?? null,
    });
  }
  await audit(services, actor, 'supplier.create', 'supplier', supplier.id, { contact_source: input.contact_source });
  return { supplier, created: true };
}

export interface ImportResult {
  created: number;
  duplicates: number;
  invalid: Array<{ row: number; phone: string; reason: string }>;
}

export async function importSuppliers(services: Services, actor: string, rows: SupplierInput[]): Promise<ImportResult> {
  const result: ImportResult = { created: 0, duplicates: 0, invalid: [] };
  for (const [index, row] of rows.entries()) {
    try {
      const { created } = await createSupplier(services, actor, row);
      if (created) result.created += 1;
      else result.duplicates += 1;
    } catch (error) {
      result.invalid.push({ row: index + 1, phone: row.phone, reason: (error as Error).message });
    }
  }
  return result;
}

export async function setDoNotCall(services: Services, actor: string, supplierId: string, reason: string): Promise<Supplier> {
  const now = services.now().toISOString();
  const supplier = await services.store.update('suppliers', supplierId, { do_not_call: true, do_not_call_at: now });
  if (!supplier) throw new ServiceError(404, 'Supplier not found');
  await services.store.insert('consent_records', {
    supplier_id: supplierId,
    status: 'withdrawn',
    basis: 'do_not_call_request',
    source: actor,
    evidence: reason,
  });
  // Suppress every queued contact so no campaign dials this supplier again.
  const contacts = await services.store.find('campaign_contacts', { where: { supplier_id: supplierId } });
  for (const contact of contacts) {
    if (contact.status === 'pending' || contact.status === 'in_progress') {
      await services.store.update('campaign_contacts', contact.id as string, { status: 'suppressed', last_outcome: 'do_not_call' });
    }
  }
  await audit(services, actor, 'supplier.do_not_call', 'supplier', supplierId, { reason });
  return supplier as unknown as Supplier;
}

export async function recordConsent(
  services: Services,
  actor: string,
  supplierId: string,
  input: { status: ConsentStatus; basis: string; evidence?: string | null },
) {
  const supplier = await services.store.get('suppliers', supplierId);
  if (!supplier) throw new ServiceError(404, 'Supplier not found');
  const record = await services.store.insert('consent_records', {
    supplier_id: supplierId,
    status: input.status,
    basis: input.basis,
    source: supplier.contact_source,
    evidence: input.evidence ?? null,
  });
  await audit(services, actor, 'consent.record', 'supplier', supplierId, { status: input.status, basis: input.basis });
  return record;
}

export async function updateLeadStatus(services: Services, actor: string, supplierId: string, status: LeadStatus) {
  const updated = await services.store.update('suppliers', supplierId, { lead_status: status });
  if (!updated) throw new ServiceError(404, 'Supplier not found');
  await audit(services, actor, 'lead.status', 'supplier', supplierId, { status });
  return updated as unknown as Supplier;
}

export interface SupplierFilters {
  lead_status?: LeadStatus;
  search?: string;
  limit?: number;
}

export async function listSuppliers(services: Services, filters: SupplierFilters = {}): Promise<Supplier[]> {
  const rows = await services.store.find('suppliers', {
    where: filters.lead_status ? { lead_status: filters.lead_status } : {},
    orderBy: { column: 'created_at', direction: 'desc' },
  });
  const needle = filters.search?.toLowerCase().trim();
  const filtered = needle
    ? rows.filter((row) =>
        [row.company_name, row.phone_e164, row.contact_name, row.city].some((value) =>
          String(value ?? '').toLowerCase().includes(needle),
        ),
      )
    : rows;
  return filtered.slice(0, filters.limit ?? 200) as unknown as Supplier[];
}

export async function getSupplierDetail(services: Services, supplierId: string) {
  const supplier = await services.store.get('suppliers', supplierId);
  if (!supplier) throw new ServiceError(404, 'Supplier not found');
  const [consents, calls, followUps] = await Promise.all([
    services.store.find('consent_records', { where: { supplier_id: supplierId }, orderBy: { column: 'recorded_at', direction: 'desc' } }),
    services.store.find('calls', { where: { supplier_id: supplierId }, orderBy: { column: 'created_at', direction: 'desc' }, limit: 50 }),
    services.store.find('follow_up_tasks', { where: { supplier_id: supplierId }, orderBy: { column: 'created_at', direction: 'desc' } }),
  ]);
  return { supplier, consents, calls, follow_ups: followUps };
}

export const SUPPORTED_LANGUAGES = LANGUAGES;
