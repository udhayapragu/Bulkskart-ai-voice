import { useState, type FormEvent } from 'react';
import { get, post } from '../lib/api';
import { useData, errorMessage } from '../lib/useData';
import type { LeadStatus, Supplier } from '../lib/types';
import { LEAD_LABELS, LEAD_STATUSES, formatDateTime } from '../lib/format';
import { Badge, Button, Card, Empty, Loading, Notice, PageHeader, Table } from '../components/ui';

export function SuppliersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | ''>('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, error, loading, reload } = useData(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (status) params.set('lead_status', status);
    return get<Supplier[]>(`/suppliers?${params.toString()}`);
  }, [search, status]);

  const markDnc = async (supplier: Supplier) => {
    if (!window.confirm(`Mark ${supplier.phone_e164} as do-not-call? All queued campaign calls to this number will stop.`)) return;
    try {
      await post(`/suppliers/${supplier.id}/do-not-call`, { reason: 'Marked from dashboard by administrator' });
      setNotice({ tone: 'success', text: 'Supplier suppressed from all marketing calls.' });
      void reload();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    }
  };

  return (
    <>
      <PageHeader title="Supplier contacts" subtitle="Manufacturers and suppliers, with the source and consent of every number." />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <AddSupplierForm onAdded={(text) => { setNotice({ tone: 'success', text }); void reload(); }} onError={(text) => setNotice({ tone: 'error', text })} />
        <ImportForm onImported={(text) => { setNotice({ tone: 'success', text }); void reload(); }} onError={(text) => setNotice({ tone: 'error', text })} />
      </div>
      <Card
        title="Contacts"
        actions={
          <div className="row">
            <input aria-label="Search contacts" placeholder="Search company, phone, city" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 240 }} />
            <select aria-label="Filter by lead status" value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | '')} style={{ width: 180 }}>
              <option value="">All statuses</option>
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_LABELS[s]}</option>)}
            </select>
          </div>
        }
      >
        {loading && !data ? <Loading /> : error ? <Notice tone="error">{error}</Notice> : !data?.length ? (
          <Empty>No suppliers match. Add a contact or import a list above.</Empty>
        ) : (
          <Table headers={['Company', 'Phone', 'Products', 'Lead status', 'Consent source', 'Added', 'Actions']}>
            {data.map((s) => (
              <tr key={s.id}>
                <td>{s.company_name ?? <span className="muted">Unnamed</span>}<div className="muted" style={{ fontSize: '0.8rem' }}>{[s.city, s.state].filter(Boolean).join(', ')}</div></td>
                <td className="mono">{s.phone_e164}</td>
                <td>{s.products.length ? s.products.join(', ') : <span className="muted">—</span>}</td>
                <td><Badge tone={s.lead_status === 'interested' || s.lead_status === 'registered' ? 'good' : s.lead_status === 'not_interested' ? 'bad' : 'purple'}>{LEAD_LABELS[s.lead_status]}</Badge></td>
                <td className="muted">{s.contact_source}</td>
                <td className="muted">{formatDateTime(s.created_at)}</td>
                <td>{s.do_not_call ? <Badge tone="bad">Do not call</Badge> : <Button variant="ghost" onClick={() => void markDnc(s)}>Do not call</Button>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

function AddSupplierForm({ onAdded, onError }: { onAdded: (text: string) => void; onError: (text: string) => void }) {
  const [form, setForm] = useState({ phone: '', company_name: '', city: '', contact_source: '', preferred_language: '', consent_basis: 'b2b_outreach_approved', consent_status: 'granted' });
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await post<{ created: boolean }>('/suppliers', {
        phone: form.phone,
        company_name: form.company_name || null,
        city: form.city || null,
        contact_source: form.contact_source,
        preferred_language: form.preferred_language || null,
        consent: { status: form.consent_status, basis: form.consent_basis },
      });
      onAdded(result.created ? 'Supplier added.' : 'That phone number already exists. No duplicate was created.');
      setForm({ ...form, phone: '', company_name: '', city: '' });
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Add a supplier">
      <form onSubmit={submit}>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="s-phone">Mobile number</label><input id="s-phone" required placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} /></div>
          <div className="field"><label htmlFor="s-company">Company</label><input id="s-company" value={form.company_name} onChange={set('company_name')} /></div>
          <div className="field"><label htmlFor="s-city">City</label><input id="s-city" value={form.city} onChange={set('city')} /></div>
          <div className="field"><label htmlFor="s-source">Where the number came from</label><input id="s-source" required placeholder="e.g. trade fair list 2026" value={form.contact_source} onChange={set('contact_source')} /></div>
          <div className="field"><label htmlFor="s-lang">Preferred language</label>
            <select id="s-lang" value={form.preferred_language} onChange={set('preferred_language')}>
              <option value="">Detect on call</option><option value="en">English</option><option value="hi">Hindi</option><option value="ta">Tamil</option><option value="te">Telugu</option><option value="ml">Malayalam</option>
            </select>
          </div>
          <div className="field"><label htmlFor="s-consent">Consent status</label>
            <select id="s-consent" value={form.consent_status} onChange={set('consent_status')}>
              <option value="granted">Granted</option><option value="unknown">Unknown</option><option value="withdrawn">Withdrawn</option>
            </select>
          </div>
        </div>
        <div className="field"><label htmlFor="s-basis">Consent basis (how this contact may be called)</label><input id="s-basis" value={form.consent_basis} onChange={set('consent_basis')} /></div>
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Add supplier'}</Button>
      </form>
    </Card>
  );
}

function ImportForm({ onImported, onError }: { onImported: (text: string) => void; onError: (text: string) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const rows = text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [phone, company_name, contact_source] = line.split(',').map((c) => c.trim());
      return { phone, company_name: company_name || null, contact_source: contact_source || 'csv_import', consent: { status: 'unknown' as const, basis: 'import_pending_review' } };
    });
    if (!rows.length) return onError('Paste at least one line: phone, company, source');
    setBusy(true);
    try {
      const result = await post<{ created: number; duplicates: number; invalid: Array<{ row: number; reason: string }> }>('/suppliers/import', { rows });
      onImported(`Imported ${result.created}. Duplicates skipped: ${result.duplicates}. Invalid rows: ${result.invalid.length}.`);
      setText('');
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Import a list">
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="import-rows">One supplier per line: phone, company, source</label>
          <textarea id="import-rows" placeholder={'+91 98765 43210, Acme Textiles, trade fair 2026'} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 12 }}>
          Imported contacts get consent status "unknown", so they are not called until consent is recorded or the campaign rules allow it.
        </p>
        <Button type="submit" variant="ghost" disabled={busy}>{busy ? 'Importing…' : 'Import'}</Button>
      </form>
    </Card>
  );
}
