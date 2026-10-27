import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { get } from '../lib/api';
import { useData } from '../lib/useData';
import type { Call, CallSummary } from '../lib/types';
import { LANGUAGE_NAMES, LEAD_LABELS, formatDateTime, formatDuration, titleCase } from '../lib/format';
import { Badge, Card, Empty, Loading, Notice, PageHeader, Table } from '../components/ui';

const STATUSES = ['', 'completed', 'handoff', 'in_progress', 'dialing', 'no_answer', 'busy', 'failed', 'canceled'];

// Labels that make clear what actually happened. A "Simulated" call never reached a telephone.
function ModeBadge({ call }: { call: Pick<Call, 'mode'> }) {
  return call.mode === 'mock' ? <Badge tone="sim">Simulated</Badge> : <Badge tone="warn">Telephone</Badge>;
}

export function CallsPage() {
  const [status, setStatus] = useState('');
  const { data, error, loading } = useData(() => get<Call[]>('/calls'), []);
  const rows = (data ?? []).filter((call) => !status || call.status === status);

  return (
    <>
      <PageHeader title="Call history" subtitle="Every call, its real provider status, and what the agent recorded." />
      <Card title="Calls" actions={
        <select aria-label="Filter by call status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 200 }}>
          {STATUSES.map((s) => <option key={s} value={s}>{s ? titleCase(s) : 'All statuses'}</option>)}
        </select>
      }>
        {loading && !data ? <Loading /> : error ? <Notice tone="error">{error}</Notice> : !rows.length ? (
          <Empty>No calls yet. Run a simulated call from the Voice agent page.</Empty>
        ) : (
          <Table headers={['Started', 'Direction', 'Type', 'Language', 'Status', 'Outcome', 'Duration', '']}>
            {rows.map((call) => (
              <tr key={call.id}>
                <td>{formatDateTime(call.created_at)}</td>
                <td>{titleCase(call.direction)}</td>
                <td><ModeBadge call={call} /></td>
                <td>{call.language ? LANGUAGE_NAMES[call.language] : '—'}</td>
                <td><Badge tone={call.status === 'completed' ? 'good' : call.status === 'handoff' ? 'warn' : call.status === 'failed' ? 'bad' : 'neutral'}>{titleCase(call.status)}</Badge></td>
                <td>{call.outcome ? LEAD_LABELS[call.outcome] : '—'}</td>
                <td>{formatDuration(call.duration_seconds)}</td>
                <td><Link to={`/calls/${call.id}`}>Open</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}

export function CallDetailPage() {
  const { id } = useParams();
  const { data, error, loading } = useData(() => get<{ call: Call; summary: CallSummary | null }>(`/calls/${id}`), [id]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <Notice tone="error">{error ?? 'Call not found'}</Notice>;
  const { call, summary } = data;
  return (
    <>
      <PageHeader
        title="Call detail"
        subtitle={`${formatDateTime(call.created_at)} · ${call.to_number ?? 'unknown number'}`}
        actions={<Link to="/calls">← All calls</Link>}
      />
      <div className="row" style={{ marginBottom: 16 }}>
        <ModeBadge call={call} />
        <Badge tone="neutral">Provider: {call.provider}</Badge>
        <Badge tone="purple">Status: {titleCase(call.status)}</Badge>
        {call.recording_permitted ? <Badge tone="good">Recording permitted</Badge> : <Badge tone="neutral">Not recorded</Badge>}
      </div>
      {call.mode === 'mock' && <Notice tone="info">This is a simulated conversation. No telephone call was placed.</Notice>}
      {call.error_message && <Notice tone="error">{call.error_message}</Notice>}
      <div className="grid grid-2">
        <Card title="Summary">
          {summary ? (
            <>
              <p style={{ lineHeight: 1.55 }}>{summary.summary}</p>
              <div className="field-label" style={{ marginTop: 12 }}>Recommended next action</div>
              <p>{summary.recommended_action}</p>
              <Badge tone="purple">Lead: {LEAD_LABELS[summary.lead_status]}</Badge>
            </>
          ) : <Empty>No summary yet. The summary appears when the conversation ends.</Empty>}
        </Card>
        <Card title="Transcript">
          {call.transcript.length === 0 ? <Empty>No transcript recorded.</Empty> : (
            <div className="transcript">
              {call.transcript.map((line, index) => (
                <div key={index} className={`bubble bubble-${line.speaker}`}>
                  <div className="bubble-meta">{line.speaker === 'agent' ? 'Bulkskart AI assistant' : 'Supplier'} · {formatDateTime(line.at)}</div>
                  {line.text}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
