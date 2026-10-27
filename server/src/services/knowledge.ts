import type { LanguageCode } from '../domain/languages.js';
import type { KnowledgeEntry, KnowledgeStatus } from '../agent/knowledge.js';
import { audit, ServiceError, type Services } from './context.js';

export interface KnowledgeInput {
  language: LanguageCode;
  topic: string;
  question: string;
  answer: string;
  keywords?: string[];
}

export async function createKnowledgeEntry(services: Services, actor: string, input: KnowledgeInput) {
  // New entries always start as drafts. Only an explicit approval makes them speakable.
  const row = await services.store.insert('knowledge_base', { ...input, keywords: input.keywords ?? [], status: 'draft' });
  await audit(services, actor, 'knowledge.create', 'knowledge_base', String(row.id), { topic: input.topic, language: input.language });
  return row;
}

export async function updateKnowledgeEntry(services: Services, actor: string, id: string, patch: Partial<KnowledgeInput>) {
  const current = await services.store.get('knowledge_base', id);
  if (!current) throw new ServiceError(404, 'Knowledge entry not found');
  // Editing an approved entry returns it to draft, so the changed wording is re-approved.
  const reapprove = current.status === 'approved' ? { status: 'draft', approved_by: null, approved_at: null } : {};
  const updated = await services.store.update('knowledge_base', id, { ...patch, ...reapprove });
  await audit(services, actor, 'knowledge.update', 'knowledge_base', id, { reapprove: Boolean(reapprove.status) });
  return updated;
}

export async function setKnowledgeStatus(services: Services, actor: string, id: string, status: KnowledgeStatus) {
  const patch =
    status === 'approved'
      ? { status, approved_by: actor, approved_at: services.now().toISOString() }
      : { status, approved_by: null, approved_at: null };
  const updated = await services.store.update('knowledge_base', id, patch);
  if (!updated) throw new ServiceError(404, 'Knowledge entry not found');
  await audit(services, actor, `knowledge.${status}`, 'knowledge_base', id, {});
  return updated;
}

export async function listKnowledge(services: Services, language?: LanguageCode) {
  return services.store.find('knowledge_base', {
    where: language ? { language } : {},
    orderBy: { column: 'created_at', direction: 'asc' },
  });
}

export async function loadApprovedKnowledge(services: Services): Promise<KnowledgeEntry[]> {
  const rows = await services.store.find('knowledge_base', { where: { status: 'approved' } });
  return rows as unknown as KnowledgeEntry[];
}
