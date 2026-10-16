import type { RecordStatus } from '@/lib/product-types';

export function StatusField({ status = 'active', all = false }: { status?: RecordStatus | ''; all?: boolean }) {
  return <label className="field">Status<select name="status" defaultValue={status} required={!all}>
    {all && <option value="">All statuses</option>}
    <option value="active">Active</option><option value="inactive">Inactive</option><option value="suspicious">Suspicious</option>
  </select></label>;
}

export function StatusBadge({ status }: { status: RecordStatus }) {
  return <span className={`status-badge status-${status}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}

export function Pagination({ page, total, pageSize, busy, onPage }: { page: number; total: number; pageSize: number; busy: boolean; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="pagination"><span>{total} record{total === 1 ? '' : 's'} · Page {page} of {pages}</span><div className="action-row">
    <button className="button button-secondary" disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>Previous</button>
    <button className="button button-secondary" disabled={busy || page >= pages} onClick={() => onPage(page + 1)}>Next</button>
  </div></div>;
}
