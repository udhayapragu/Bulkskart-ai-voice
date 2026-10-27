import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { get, post, put } from '../lib/api';
import { errorMessage, useData } from '../lib/useData';
import type { AgentSettings, Scenario, Supplier } from '../lib/types';
import { Badge, Button, Card, Notice, PageHeader } from '../components/ui';

export function VoiceAgentPage() {
  const settings = useData(() => get<AgentSettings>('/settings'), []);
  const scenarios = useData(() => get<Scenario[]>('/scenarios'), []);
  const suppliers = useData(() => get<Supplier[]>('/suppliers?limit=200'), []);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error' | 'info'; text: string; callId?: string } | null>(null);
  const [calling, setCalling] = useState<AgentSettings['calling'] | null>(null);
  const [sim, setSim] = useState({ supplier_id: '', scenario_id: '' });
  const [busy, setBusy] = useState(false);

  const saveCalling = async (event: FormEvent) => {
    event.preventDefault();
    if (!calling) return;
    try {
      await put('/settings/calling', calling);
      setNotice({ tone: 'success', text: 'Calling rules saved.' });
      void settings.reload();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    }
  };

  const runSimulation = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const call = await post<{ id: string; status: string; outcome: string | null }>('/calls/simulate', sim);
      setNotice({ tone: 'success', text: `Simulated conversation finished (${call.status}). No telephone call was placed.`, callId: call.id });
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const current = calling ?? settings.data?.calling ?? null;

  return (
    <>
      <PageHeader title="Voice agent" subtitle="How the AI assistant introduces itself, what it may say, and how it calls suppliers." />
      {notice && <Notice tone={notice.tone}>{notice.text} {notice.callId && <Link to={`/calls/${notice.callId}`}>View transcript →</Link>}</Notice>}
      <div className="grid grid-2">
        <Card title="Identity and guardrails">
          <dl className="kv">
            <dt>Speaks as</dt><dd>{settings.data?.voice.persona_name ?? '—'}</dd>
            <dt>Company</dt><dd>{settings.data?.company.name ?? '—'}</dd>
            <dt>Website link</dt><dd>{settings.data?.company.website_url ?? '—'}</dd>
            <dt>Speech provider</dt><dd>{settings.data?.voice.provider ?? '—'} <Badge tone={settings.data?.voice.provider === 'mock' ? 'sim' : 'good'}>{settings.data?.voice.provider === 'mock' ? 'Simulated' : 'Configured'}</Badge></dd>
          </dl>
          <ul className="muted" style={{ paddingLeft: 18, lineHeight: 1.7, marginTop: 14 }}>
            <li>Introduces itself as Bulkskart's AI assistant on every call.</li>
            <li>Answers only from approved knowledge-base entries. Otherwise it says it does not know.</li>
            <li>Never states fees, approvals, customer counts or guarantees unless approved in the knowledge base.</li>
            <li>Honours "stop calling" immediately and records do-not-call.</li>
            <li>Hands complex requests and repeated misunderstandings to a person.</li>
          </ul>
        </Card>

        <Card title="Calling rules">
          {!current ? <Notice tone="info">Loading…</Notice> : (
            <form onSubmit={saveCalling}>
              <div className="field">
                <label htmlFor="min-hours">Minimum hours between calls to the same supplier</label>
                <input id="min-hours" type="number" min={1} max={720} value={current.min_hours_between_calls} onChange={(e) => setCalling({ ...current, min_hours_between_calls: Number(e.target.value) })} />
              </div>
              <label className="check" style={{ marginBottom: 12 }}>
                <input type="checkbox" checked={current.require_consent} onChange={(e) => setCalling({ ...current, require_consent: e.target.checked })} />
                Only call suppliers with granted consent (recommended)
              </label>
              <Button type="submit">Save rules</Button>
            </form>
          )}
        </Card>

        <Card title="Run a simulated call" actions={<Badge tone="sim">No telephone call</Badge>}>
          <p className="muted" style={{ fontSize: '0.88rem', marginBottom: 12 }}>
            Runs a scripted supplier through the real conversation engine. Use it to test the flow before any live campaign.
          </p>
          <form onSubmit={runSimulation}>
            <div className="field">
              <label htmlFor="sim-supplier">Supplier</label>
              <select id="sim-supplier" required value={sim.supplier_id} onChange={(e) => setSim({ ...sim, supplier_id: e.target.value })}>
                <option value="">Choose a supplier</option>
                {(suppliers.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.company_name ?? 'Unnamed'} · {s.phone_e164}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="sim-scenario">Supplier behaviour</label>
              <select id="sim-scenario" required value={sim.scenario_id} onChange={(e) => setSim({ ...sim, scenario_id: e.target.value })}>
                <option value="">Choose a scenario</option>
                {(scenarios.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.description}</option>)}
              </select>
            </div>
            <Button type="submit" disabled={busy || !sim.supplier_id || !sim.scenario_id}>{busy ? 'Running…' : 'Run simulation'}</Button>
          </form>
        </Card>

        <Card title="Opening line by language">
          <p className="muted" style={{ fontSize: '0.88rem', marginBottom: 10 }}>Full scripts for every language are on the Languages page.</p>
          <Link to="/languages">Review scripts →</Link>
        </Card>
      </div>
    </>
  );
}
