import { Link } from 'react-router-dom';
import { get } from '../lib/api';
import { useData } from '../lib/useData';
import type { Overview } from '../lib/types';
import { LEAD_LABELS, LEAD_STATUSES } from '../lib/format';
import { Card, Empty, Loading, Notice, PageHeader, Stat } from '../components/ui';

export function OverviewPage() {
  const { data, error, loading } = useData(() => get<Overview>('/overview'));
  if (loading) return <Loading />;
  if (error || !data) return <Notice tone="error">{error ?? 'No data'}</Notice>;
  const totalOutcomes = LEAD_STATUSES.reduce((sum, s) => sum + (data.outcomes[s] ?? 0), 0);
  return (
    <>
      <PageHeader title="Overview" subtitle="Supplier pipeline and AI calling activity at a glance." />
      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Stat label="Supplier contacts" value={data.suppliers} hint={`${data.do_not_call} on do-not-call`} />
        <Stat label="Calls today" value={data.calls.today} hint={`${data.calls.total} total`} />
        <Stat label="Active calls" value={data.calls.active} />
        <Stat label="Running campaigns" value={data.campaigns.running ?? 0} hint={`${data.campaigns.paused ?? 0} paused`} />
        <Stat label="Open follow-ups" value={data.open_follow_ups} />
      </div>
      <div className="grid grid-2">
        <Card title="Lead statuses" actions={<Link to="/leads">Open board →</Link>}>
          {LEAD_STATUSES.map((status) => (
            <div key={status} style={{ marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                <span>{LEAD_LABELS[status]}</span>
                <strong>{data.leads[status] ?? 0}</strong>
              </div>
              <div className="bar"><span style={{ width: `${data.suppliers ? (100 * (data.leads[status] ?? 0)) / data.suppliers : 0}%` }} /></div>
            </div>
          ))}
        </Card>
        <Card title="Call outcomes">
          {totalOutcomes === 0 ? (
            <Empty>No outcomes yet. Launch a campaign or run a simulated call to see results.</Empty>
          ) : (
            LEAD_STATUSES.map((status) => (
              <div key={status} className="row" style={{ justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{LEAD_LABELS[status]}</span>
                <span className="muted">{data.outcomes[status] ?? 0}</span>
              </div>
            ))
          )}
          <p className="muted" style={{ marginTop: 12, fontSize: '0.85rem' }}>
            Simulated calls: {data.calls.simulated}. Simulated calls never reached a telephone.
          </p>
        </Card>
      </div>
    </>
  );
}
