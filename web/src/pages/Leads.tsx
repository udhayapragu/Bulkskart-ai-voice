import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, patch } from '../lib/api';
import { errorMessage, useData } from '../lib/useData';
import type { FollowUp, LeadStatus, Supplier } from '../lib/types';
import { LEAD_LABELS, LEAD_STATUSES, formatDateTime, titleCase } from '../lib/format';
import { Badge, Button, Card, Empty, Loading, Notice, PageHeader } from '../components/ui';

export function LeadsPage() {
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suppliers = useData(() => get<Supplier[]>('/suppliers?limit=200'), []);
  const followUps = useData(() => get<FollowUp[]>('/follow-ups?status=open'), []);

  const move = async (supplier: Supplier, status: LeadStatus) => {
    try {
      await patch(`/suppliers/${supplier.id}/lead-status`, { status });
      setNotice(`${supplier.company_name ?? supplier.phone_e164} moved to ${LEAD_LABELS[status]}.`);
      void suppliers.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const complete = async (task: FollowUp) => {
    try {
      await patch(`/follow-ups/${task.id}`, { status: 'done' });
      setNotice('Follow-up marked done.');
      void followUps.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Lead statuses" subtitle="Move suppliers through the pipeline. Registered is set when the supplier registers on Bulkskart." />
      {notice && <Notice tone="success">{notice}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {suppliers.loading && !suppliers.data ? <Loading /> : suppliers.error ? <Notice tone="error">{suppliers.error}</Notice> : (
        <div className="board">
          {LEAD_STATUSES.map((status) => {
            const items = (suppliers.data ?? []).filter((s) => s.lead_status === status);
            return (
              <section key={status} className="board-col" aria-label={LEAD_LABELS[status]}>
                <header className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                  <strong>{LEAD_LABELS[status]}</strong>
                  <Badge tone="purple">{items.length}</Badge>
                </header>
                {items.length === 0 && <div className="muted" style={{ fontSize: '0.88rem' }}>None</div>}
                {items.map((s) => (
                  <article key={s.id} className="lead-card">
                    <div style={{ fontWeight: 600 }}>{s.company_name ?? 'Unnamed supplier'}</div>
                    <div className="mono muted">{s.phone_e164}</div>
                    {s.products.length > 0 && <div className="muted" style={{ fontSize: '0.85rem' }}>{s.products.join(', ')}</div>}
                    <label className="field-label" htmlFor={`move-${s.id}`} style={{ display: 'block', marginTop: 8 }}>Move to</label>
                    <select id={`move-${s.id}`} value={s.lead_status} onChange={(e) => void move(s, e.target.value as LeadStatus)}>
                      {LEAD_STATUSES.map((opt) => <option key={opt} value={opt}>{LEAD_LABELS[opt]}</option>)}
                    </select>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Card title="Open follow-up tasks">
          {followUps.loading && !followUps.data ? <Loading /> : !followUps.data?.length ? (
            <Empty>No open follow-ups. Handoffs, callbacks and website-link requests appear here.</Empty>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {followUps.data.map((task) => (
                <div key={task.id} className="row" style={{ justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <div>
                    <Badge tone={task.task_type === 'human_handoff' ? 'warn' : 'purple'}>{titleCase(task.task_type)}</Badge>{' '}
                    <span>{task.notes}</span>
                    <div className="muted" style={{ fontSize: '0.82rem' }}>
                      Due {formatDateTime(task.due_at)}{task.call_id && <> · <Link to={`/calls/${task.call_id}`}>View call</Link></>}
                    </div>
                  </div>
                  <Button variant="ghost" onClick={() => void complete(task)}>Mark done</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
