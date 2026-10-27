import { useState, type FormEvent } from 'react';
import { get, put } from '../lib/api';
import { errorMessage, useData } from '../lib/useData';
import type { AgentSettings, Usage } from '../lib/types';
import { Button, Card, Loading, Notice, PageHeader, Stat } from '../components/ui';

export function UsagePage() {
  const usage = useData(() => get<Usage>('/analytics/usage'), []);
  const settings = useData(() => get<AgentSettings>('/settings'), []);
  const [rates, setRates] = useState<AgentSettings['usage_rates'] | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const current = rates ?? settings.data?.usage_rates ?? null;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!current) return;
    try {
      await put('/settings/usage_rates', current);
      setNotice({ tone: 'success', text: 'Rates saved. The estimate below now uses them.' });
      setRates(null);
      void settings.reload();
      void usage.reload();
    } catch (err) {
      setNotice({ tone: 'error', text: errorMessage(err) });
    }
  };

  if (usage.loading && !usage.data) return <Loading />;
  return (
    <>
      <PageHeader title="Usage and cost" subtitle="Call volume, minutes and an estimate from the rates you enter." />
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {usage.data && (
        <>
          <div className="grid grid-stats" style={{ marginBottom: 16 }}>
            <Stat label="Calls" value={usage.data.calls_total} hint={`${usage.data.calls_by_mode.live} telephone · ${usage.data.calls_by_mode.mock} simulated`} />
            <Stat label="Telephone minutes" value={usage.data.minutes.live} hint="Only real provider calls" />
            <Stat label="Simulated minutes" value={usage.data.minutes.mock_simulated} hint="Not billed by any provider" />
            <Stat label="Estimated cost" value={`${usage.data.estimated_cost.currency} ${usage.data.estimated_cost.amount}`} hint={usage.data.estimated_cost.note} />
          </div>
        </>
      )}
      <Card title="Rates (from your provider invoices)">
        {!current ? <Loading /> : (
          <form onSubmit={save} className="grid grid-2" style={{ gap: 12 }}>
            <div className="field"><label htmlFor="r-tel">Telephony cost per minute</label><input id="r-tel" type="number" min={0} step="0.01" value={current.telephony_per_minute} onChange={(e) => setRates({ ...current, telephony_per_minute: Number(e.target.value) })} /></div>
            <div className="field"><label htmlFor="r-ai">Voice AI cost per minute</label><input id="r-ai" type="number" min={0} step="0.01" value={current.voice_ai_per_minute} onChange={(e) => setRates({ ...current, voice_ai_per_minute: Number(e.target.value) })} /></div>
            <div className="field"><label htmlFor="r-cur">Currency code</label><input id="r-cur" maxLength={3} value={current.currency} onChange={(e) => setRates({ ...current, currency: e.target.value.toUpperCase() })} /></div>
            <div style={{ alignSelf: 'end' }}><Button type="submit">Save rates</Button></div>
          </form>
        )}
      </Card>
    </>
  );
}
