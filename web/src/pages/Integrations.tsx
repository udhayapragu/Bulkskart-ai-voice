import { useState, type ReactNode } from 'react';
import { get, post } from '../lib/api';
import { errorMessage, useData } from '../lib/useData';
import type { SystemHealth } from '../lib/types';
import { formatDateTime } from '../lib/format';
import { Badge, Button, Card, Notice, PageHeader } from '../components/ui';

interface TickReport { dialed: number; failed: number; campaigns: number; skipped: Record<string, number> }

export function IntegrationsPage() {
  const health = useData(() => get<SystemHealth>('/system/health'), []);
  const [tick, setTick] = useState<TickReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;

  const runTick = async () => {
    try {
      setTick(await post<TickReport>('/scheduler/tick'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const h = health.data;
  const row = (label: string, value: ReactNode) => (
    <div className="row" style={{ justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <>
      <PageHeader title="Integrations and system health" subtitle="What is connected, what is simulated, and what is switched off." />
      {error && <Notice tone="error">{error}</Notice>}
      {h && !h.live_calling_enabled && <Notice tone="info">Live telephone calling is switched off on this server. Campaigns run in simulated mode only.</Notice>}
      <div className="grid grid-2">
        <Card title="Providers">
          {!h ? <p className="muted">Loading…</p> : (
            <>
              {row('Database', <Badge tone={h.store === 'postgres' ? 'good' : 'warn'}>{h.store === 'postgres' ? 'Supabase PostgreSQL' : 'In-memory (not durable)'}</Badge>)}
              {row('Telephony', <>{h.telephony.provider} <Badge tone={h.telephony.mode === 'live' ? 'warn' : 'sim'}>{h.telephony.mode === 'live' ? 'Live' : 'Simulated'}</Badge></>)}
              {row('Webhook signing secret', h.telephony.webhook_secret_configured ? <Badge tone="good">Configured</Badge> : <Badge tone="bad">Missing — webhooks rejected</Badge>)}
              {row('Voice AI', <>{h.voice.provider} {h.voice.live_ready ? <Badge tone="good">Verified</Badge> : <Badge tone="warn">Not verified for live calls</Badge>}</>)}
              {row('Live calling kill switch', h.live_calling_enabled ? <Badge tone="warn">On</Badge> : <Badge tone="good">Off</Badge>)}
              {row('Campaign scheduler', h.scheduler_enabled ? <Badge tone="good">Running</Badge> : <Badge tone="neutral">Disabled</Badge>)}
              {row('Checked', formatDateTime(h.checked_at))}
            </>
          )}
        </Card>

        <Card title="Webhook endpoints" actions={<Badge tone="neutral">Signed requests only</Badge>}>
          <p className="muted" style={{ fontSize: '0.88rem', marginBottom: 10 }}>
            Configure these in your telephony provider. Every request must carry a valid signature, or it is rejected.
          </p>
          <div className="mono" style={{ display: 'grid', gap: 8, wordBreak: 'break-all' }}>
            <div>POST {origin}/webhooks/telephony/status</div>
            <div>POST {origin}/webhooks/telephony/inbound</div>
          </div>
        </Card>

        <Card title="Run the scheduler now" actions={<Button variant="ghost" onClick={() => void runTick()}>Run one pass</Button>}>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Checks running campaigns once: calling window, concurrency, do-not-call, consent, cooldown. Runs automatically in the background as well.
          </p>
          {tick && (
            <div style={{ marginTop: 12 }}>
              <Badge tone="purple">Dialed {tick.dialed}</Badge>{' '}
              <Badge tone="neutral">Failed {tick.failed}</Badge>{' '}
              <Badge tone="neutral">Campaigns checked {tick.campaigns}</Badge>
              {Object.keys(tick.skipped).length > 0 && (
                <div className="muted" style={{ marginTop: 10, fontSize: '0.88rem' }}>
                  Skipped: {Object.entries(tick.skipped).map(([k, v]) => `${k.replace(/_/g, ' ')} ×${v}`).join(', ')}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card title="Before going live">
          <ol className="muted" style={{ paddingLeft: 18, lineHeight: 1.8, fontSize: '0.92rem' }}>
            <li>Native-speaker review of every language script.</li>
            <li>Approved knowledge-base entries for every answer you want the agent to give.</li>
            <li>Verified Sarvam AI and Exotel adapters, tested with real credentials.</li>
            <li>Consent sources recorded and a DND-registry check completed by your compliance team.</li>
            <li>Set LIVE_CALLING_ENABLED=true only after the above, and launch with explicit confirmation.</li>
          </ol>
        </Card>
      </div>
    </>
  );
}
