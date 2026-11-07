import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export interface ReportData {
  step?: string; code?: string; county?: string; countyPage?: number; countyChoices?: string[];
  productId?: string; productName?: string; category?: string; reason?: string;
  description?: string; sellerLocation?: string;
}
export interface State extends ReportData {
  farmerId?: string; version?: string; draftId?: string; draftRevision?: number;
}
export interface Draft {
  id: string; revision: number; state: ReportData; status: string; report_id: string | null; expired: boolean;
}

// Deliberate allowlist: credentials, callback text and authentication state never enter a draft.
function reportData(state: State): ReportData {
  const {step,code,county,countyPage,countyChoices,productId,productName,category,reason,description,sellerLocation}=state;
  return {step,code,county,countyPage,countyChoices,productId,productName,category,reason,description,sellerLocation};
}

export async function findDraft(client: PoolClient, farmerId: string): Promise<Draft | undefined> {
  // Serializes the first insert too, when there is no row to lock yet.
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text,0))', [`ussd-report:${farmerId}`]);
  return (await client.query<Draft>(`SELECT *,expires_at<=CURRENT_TIMESTAMP AS expired
    FROM ussd_report_drafts WHERE farmer_id=$1 FOR UPDATE`, [farmerId])).rows[0];
}

export async function startDraft(client: PoolClient, state: State, step = 'report_code') {
  state.step=step; state.draftId=randomUUID(); state.draftRevision=1;
  await client.query(`INSERT INTO ussd_report_drafts(farmer_id,id,state) VALUES ($1,$2,$3)
    ON CONFLICT(farmer_id) DO UPDATE SET id=EXCLUDED.id,revision=1,state=EXCLUDED.state,
    status='active',report_id=NULL,updated_at=CURRENT_TIMESTAMP,expires_at=CURRENT_TIMESTAMP+interval '24 hours'`,
    [state.farmerId,state.draftId,reportData(state)]);
}

export async function saveDraft(client: PoolClient, state: State) {
  const saved=await client.query<{revision:number}>(`UPDATE ussd_report_drafts SET state=$4,revision=revision+1,
    updated_at=CURRENT_TIMESTAMP,expires_at=CURRENT_TIMESTAMP+interval '24 hours'
    WHERE farmer_id=$1 AND id=$2 AND revision=$3 AND status='active' RETURNING revision`,
    [state.farmerId,state.draftId,state.draftRevision,reportData(state)]);
  if (!saved.rows[0]) throw new Error('Report draft changed during the request.');
  state.draftRevision=saved.rows[0].revision;
}

export async function finishDraft(client: PoolClient, state: State, reportId?: string) {
  const saved=await client.query(`UPDATE ussd_report_drafts SET status=$4,report_id=$5,state='{}',revision=revision+1,
    updated_at=CURRENT_TIMESTAMP,expires_at=CURRENT_TIMESTAMP+interval '24 hours'
    WHERE farmer_id=$1 AND id=$2 AND revision=$3 AND status='active'`,
    [state.farmerId,state.draftId,state.draftRevision,reportId?'submitted':'discarded',reportId ?? null]);
  if (saved.rowCount!==1) throw new Error('Report draft changed during the request.');
  delete state.draftId; delete state.draftRevision;
}
