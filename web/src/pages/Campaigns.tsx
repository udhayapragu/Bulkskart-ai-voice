import { useState, type FormEvent } from 'react';
import { get, post } from '../lib/api';
import { errorMessage, useData } from '../lib/useData';
import type { Campaign, CampaignStats, LanguageCode, Supplier } from '../lib/types';
import { LANGUAGE_NAMES, formatDateTime, titleCase } from '../lib/format';
import { Badge, Button, Card, Empty, Loading, Modal, Notice, PageHeader, Stat, Table } from '../components/ui';

interface Health { live_calling_enabled: boolean; telephony: { mode: 'mock' | 'live' }; voice: { live_ready: boolean } }

export function CampaignsPage() {
  const campaigns = useData(() => get<Campaign[]>('/campaigns'), []);
  const health = useData(() => get<Health>('/system/health'), []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const selected = campaigns.data?.find((c) => c.id === selectedId) ?? campaigns.data?.[0] ?? null;
  const fail = (err: unknown) => setNotice({ tone: 'error', text: errorMessage(err) });

  return (
    <>
      <PageHeader title="AI calling campaigns" subtitle="Campaigns only dial inside their calling window, respect do-not-call and consent, and need explicit confirmation to launch." />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <div className="grid grid-2" style={{ marginBottom: 16 }}>
        <CreateCampaignForm liveAllowed={Boolean(health.data?.live_calling_enabled && health.data?.telephony.mode === 'live' && health.data?.voice.live_ready)} onCreated={(c) => { setSelectedId(c.id); setNotice({ tone: 'success', text: `Campaign "${c.name}" created as a draft.` }); void campaigns.reload(); }} onError={fail} />
        <Card title="Campaigns">
          {campaigns.loading && !campaigns.data ? <Loading /> : !campaigns.data?.length ? <Empty>No campaigns yet.</Empty> : (
            <Table headers={['Name', 'Language', 'Mode', 'Status']}>
              {campaigns.data.map((c) => (
                <tr key={c.id} onClick={() => setSelectedId(c.id)} style={{ cursor: 'pointer', background: selected?.id === c.id ? 'var(--purple-soft)' : undefined }}>
                  <td>{c.name}</td>
                  <td>{LANGUAGE_NAMES[c.language]}</td>
                  <td>{c.mode === 'mock' ? <Badge tone="sim">Simulated</Badge> : <Badge tone="warn">Live</Badge>}</td>
                  <td><Badge tone={c.status === 'running' ? 'good' : c.status === 'paused' ? 'warn' : 'neutral'}>{titleCase(c.status)}</Badge></td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      {selected && <CampaignDetail key={selected.id} campaign={selected} onChanged={() => void campaigns.reload()} onNotice={setNotice} onError={fail} />}
    </>
  );
}

function CreateCampaignForm({ liveAllowed, onCreated, onError }: { liveAllowed: boolean; onCreated: (c: Campaign) => void; onError: (e: unknown) => void }) {
  const [form, setForm] = useState({ name: '', language: 'en' as LanguageCode, mode: 'mock' as 'mock' | 'live', max_attempts: 3, retry_delay_minutes: 240, calling_window_start: '09:00', calling_window_end: '19:00', concurrency: 2 });
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      onCreated(await post<Campaign>('/campaigns', form));
      setForm({ ...form, name: '' });
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="New campaign">
      <form onSubmit={submit}>
        <div className="field"><label htmlFor="c-name">Campaign name</label><input id="c-name" required minLength={3} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <div className="field"><label htmlFor="c-lang">Language</label>
            <select id="c-lang" value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value as LanguageCode })}>
              {(Object.keys(LANGUAGE_NAMES) as LanguageCode[]).map((l) => <option key={l} value={l}>{LANGUAGE_NAMES[l]}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor="c-mode">Mode</label>
            <select id="c-mode" value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value as 'mock' | 'live' })}>
              <option value="mock">Simulated (no phone calls)</option>
              <option value="live" disabled={!liveAllowed}>Live telephone calls{liveAllowed ? '' : ' (not enabled)'}</option>
            </select>
          </div>
          <div className="field"><label htmlFor="c-attempts">Max attempts</label><input id="c-attempts" type="number" min={1} max={10} value={form.max_attempts} onChange={(e) => setForm({ ...form, max_attempts: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="c-retry">Minutes between retries</label><input id="c-retry" type="number" min={5} value={form.retry_delay_minutes} onChange={(e) => setForm({ ...form, retry_delay_minutes: Number(e.target.value) })} /></div>
          <div className="field"><label htmlFor="c-start">Calling window start (IST)</label><input id="c-start" type="time" value={form.calling_window_start} onChange={(e) => setForm({ ...form, calling_window_start: e.target.value })} /></div>
          <div className="field"><label htmlFor="c-end">Calling window end (IST)</label><input id="c-end" type="time" value={form.calling_window_end} onChange={(e) => setForm({ ...form, calling_window_end: e.target.value })} /></div>
          <div className="field"><label htmlFor="c-conc">Concurrent calls</label><input id="c-conc" type="number" min={1} max={50} value={form.concurrency} onChange={(e) => setForm({ ...form, concurrency: Number(e.target.value) })} /></div>
        </div>
        <Button type="submit" disabled={busy || form.name.length < 3}>{busy ? 'Creating…' : 'Create draft'}</Button>
      </form>
    </Card>
  );
}

function CampaignDetail({ campaign, onChanged, onNotice, onError }: { campaign: Campaign; onChanged: () => void; onNotice: (n: { tone: 'success' | 'error'; text: string }) => void; onError: (e: unknown) => void }) {
  const stats = useData(() => get<{ campaign: Campaign; stats: CampaignStats }>(`/campaigns/${campaign.id}`), [campaign.id, campaign.status]);
  const suppliers = useData(() => get<Supplier[]>('/suppliers?limit=200'), []);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const expected = `LAUNCH ${campaign.name}`;
  const closed = campaign.status === 'completed' || campaign.status === 'archived';

  const enroll = async () => {
    try {
      const result = await post<{ added: number; duplicates: number; blocked: Array<{ reason: string }> }>(`/campaigns/${campaign.id}/enroll`, { supplier_ids: picked });
      onNotice({ tone: 'success', text: `Added ${result.added}. Already enrolled: ${result.duplicates}. Blocked by consent or do-not-call: ${result.blocked.length}.` });
      setPicked([]);
      void stats.reload();
    } catch (err) {
      onError(err);
    }
  };

  const launch = async () => {
    try {
      await post(`/campaigns/${campaign.id}/launch`, { confirmation: typed });
      setConfirming(false);
      setTyped('');
      onNotice({ tone: 'success', text: `Campaign launched. Calls run only inside the ${campaign.calling_window_start}–${campaign.calling_window_end} window.` });
      onChanged();
    } catch (err) {
      onError(err);
    }
  };

  const togglePause = async () => {
    try {
      if (campaign.status === 'running') await post(`/campaigns/${campaign.id}/pause`);
      else if (campaign.status === 'paused') {
        if (!window.confirm(`Resume "${campaign.name}"?`)) return;
        await post(`/campaigns/${campaign.id}/resume`, { confirmation: `LAUNCH ${campaign.name}` });
      }
      onChanged();
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="stack">
      <Card
        title={campaign.name}
        actions={
          <div className="row">
            {campaign.mode === 'mock' ? <Badge tone="sim">Simulated — no telephone calls</Badge> : <Badge tone="warn">Live telephone calls</Badge>}
            {(campaign.status === 'draft' || campaign.status === 'paused') && <Button onClick={() => setConfirming(true)}>{campaign.status === 'paused' ? 'Resume…' : 'Launch…'}</Button>}
            {(campaign.status === 'running' || campaign.status === 'paused') && <Button variant="ghost" onClick={() => void togglePause()}>{campaign.status === 'running' ? 'Pause' : 'Resume'}</Button>}
          </div>
        }
      >
        <div className="grid grid-stats" style={{ marginBottom: 14 }}>
          <Stat label="Status" value={titleCase(campaign.status)} />
          <Stat label="Contacts" value={stats.data?.stats.contacts ?? '—'} />
          <Stat label="Calls" value={stats.data?.stats.calls ?? '—'} />
          <Stat label="Window (IST)" value={`${campaign.calling_window_start}–${campaign.calling_window_end}`} hint={`Up to ${campaign.max_attempts} attempts`} />
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>Launched by {campaign.launched_by ?? '—'} at {formatDateTime(campaign.launched_at)}. Retries are {campaign.retry_delay_minutes} minutes apart.</p>
        {stats.data && Object.keys(stats.data.stats.by_contact_status).length > 0 && (
          <div className="row" style={{ marginTop: 10 }}>
            {Object.entries(stats.data.stats.by_contact_status).map(([k, v]) => <Badge key={k} tone="purple">{titleCase(k)}: {v}</Badge>)}
          </div>
        )}
      </Card>

      {!closed && (
        <Card title="Add suppliers to this campaign" actions={<Button variant="ghost" disabled={!picked.length} onClick={() => void enroll()}>Add {picked.length || ''} selected</Button>}>
          <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 10 }}>Duplicates are skipped. Suppliers without consent or on do-not-call are blocked with the reason recorded.</p>
          {suppliers.loading && !suppliers.data ? <Loading /> : (
            <div style={{ maxHeight: 260, overflowY: 'auto', display: 'grid', gap: 6 }}>
              {(suppliers.data ?? []).map((s) => (
                <label key={s.id} className="check" style={{ padding: '6px 8px', borderRadius: 8, background: 'var(--surface)' }}>
                  <input type="checkbox" checked={picked.includes(s.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, s.id] : picked.filter((id) => id !== s.id))} />
                  <span>{s.company_name ?? 'Unnamed'} <span className="muted mono">{s.phone_e164}</span></span>
                </label>
              ))}
            </div>
          )}
        </Card>
      )}

      {confirming && (
        <Modal title={`Launch "${campaign.name}"?`} onClose={() => setConfirming(false)}>
          <Notice tone="warn">
            {campaign.mode === 'live'
              ? 'This campaign will place real telephone calls to suppliers. Only numbers with recorded consent and no do-not-call flag will be dialled, inside the calling window.'
              : 'This simulated campaign runs scripted conversations without placing any telephone calls.'}
          </Notice>
          <div className="field">
            <label htmlFor="confirm-text">Type <span className="mono">{expected}</span> to confirm</label>
            <input id="confirm-text" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button disabled={typed !== expected} onClick={() => void launch()}>Launch campaign</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
