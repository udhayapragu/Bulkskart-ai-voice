import { useState, type FormEvent } from 'react';
import { get, post } from '../lib/api';
import { errorMessage, useData } from '../lib/useData';
import type { KnowledgeEntry, LanguageCode } from '../lib/types';
import { LANGUAGE_NAMES, formatDateTime } from '../lib/format';
import { Badge, Button, Card, Empty, Loading, Notice, PageHeader, Table } from '../components/ui';

export function KnowledgePage() {
  const [language, setLanguage] = useState<LanguageCode | ''>('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const entries = useData(() => get<KnowledgeEntry[]>(`/knowledge${language ? `?language=${language}` : ''}`), [language]);

  const setStatus = async (entry: KnowledgeEntry, status: 'approved' | 'retired' | 'draft') => {
    try {
      await post(`/knowledge/${entry.id}/status`, { status });
      setNotice({ tone: 'success', text: status === 'approved' ? 'Approved. The agent may now speak this answer.' : `Entry set to ${status}.` });
      void entries.reload();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <PageHeader title="Knowledge base and FAQ" subtitle="The agent speaks only approved answers. Drafts are never spoken." />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <NewEntryForm onCreated={() => { setNotice({ tone: 'success', text: 'Draft saved. Approve it to make it speakable.' }); void entries.reload(); }} onError={(text) => setNotice({ tone: 'error', text })} />
        <Card title="Governance">
          <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.7 }}>
            <li>New entries are drafts. Approval records who approved and when.</li>
            <li>Editing an approved answer returns it to draft until re-approved.</li>
            <li>Leave a fee, approval, or customer-count answer as draft until Bulkskart confirms it.</li>
          </ul>
        </Card>
      </div>
      <Card title="Entries" actions={
        <select aria-label="Filter by language" value={language} onChange={(e) => setLanguage(e.target.value as LanguageCode | '')} style={{ width: 200 }}>
          <option value="">All languages</option>
          {(Object.keys(LANGUAGE_NAMES) as LanguageCode[]).map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
        </select>
      }>
        {entries.loading && !entries.data ? <Loading /> : !entries.data?.length ? <Empty>No entries for this filter.</Empty> : (
          <Table headers={['Topic', 'Question', 'Answer', 'Status', 'Approved', 'Actions']}>
            {entries.data.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.topic}<div className="muted" style={{ fontSize: '0.8rem' }}>{LANGUAGE_NAMES[entry.language]}</div></td>
                <td>{entry.question}</td>
                <td style={{ maxWidth: 320 }}>{entry.answer}</td>
                <td><Badge tone={entry.status === 'approved' ? 'good' : entry.status === 'retired' ? 'bad' : 'warn'}>{entry.status}</Badge></td>
                <td className="muted" style={{ fontSize: '0.85rem' }}>{entry.approved_by ? `${entry.approved_by} · ${formatDateTime(entry.approved_at)}` : '—'}</td>
                <td>
                  <div className="row">
                    {entry.status !== 'approved' && <Button variant="ghost" onClick={() => void setStatus(entry, 'approved')}>Approve</Button>}
                    {entry.status !== 'retired' && <Button variant="danger" onClick={() => void setStatus(entry, 'retired')}>Retire</Button>}
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function NewEntryForm({ onCreated, onError }: { onCreated: () => void; onError: (text: string) => void }) {
  const [form, setForm] = useState({ language: 'en' as LanguageCode, topic: '', question: '', answer: '', keywords: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await post('/knowledge', { ...form, keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean) });
      setForm({ ...form, topic: '', question: '', answer: '', keywords: '' });
      onCreated();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add an answer">
      <form onSubmit={submit}>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="kb-lang">Language</label>
            <select id="kb-lang" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as LanguageCode })}>
              {(Object.keys(LANGUAGE_NAMES) as LanguageCode[]).map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="kb-topic">Topic</label><input id="kb-topic" required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></div>
        </div>
        <div className="field"><label htmlFor="kb-q">Question a supplier might ask</label><input id="kb-q" required value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></div>
        <div className="field"><label htmlFor="kb-a">Approved answer (exact wording the agent may say)</label><textarea id="kb-a" required value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></div>
        <div className="field"><label htmlFor="kb-k">Trigger words, comma separated</label><input id="kb-k" placeholder="fee, price, charges" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} /></div>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save as draft'}</Button>
      </form>
    </Card>
  );
}

