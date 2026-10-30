'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { countyNames } from '@/lib/counties';
import type { DashboardData, DashboardFilters } from '@/lib/dashboard-types';
import { reportStatuses } from '@/lib/report-types';
import { verificationTime } from '@/lib/verification-types';
import { ActivityChart, CountyChart, OutcomeChart, chartDate } from './dashboard-charts';
import { ResultBadge } from './verification-result';

const emptyFilters:DashboardFilters = {from:'',to:'',county:''};
const count = (value:number)=>value.toLocaleString('en-KE');
function countyLabel(county:string|null) { return county ?? 'Location unavailable or legacy'; }

export function AdminDashboard() {
  const router=useRouter();
  const [draft,setDraft]=useState<DashboardFilters>(emptyFilters);
  const [filters,setFilters]=useState<DashboardFilters>(emptyFilters);
  const [data,setData]=useState<DashboardData|null>(null);
  const [busy,setBusy]=useState(true); const [error,setError]=useState('');
  const [revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();
    async function load() {
      try {
        const params=new URLSearchParams(Object.entries(filters).filter(([,value])=>value!==''));
        const response=await fetch(`/api/dashboard?${params}`,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])});
        if(response.status===401){router.replace('/login');router.refresh();return;}
        const result=await response.json();
        if(!response.ok)throw new Error(typeof result.message==='string' ? result.message : 'Unable to load the dashboard.');
        if(controller.signal.aborted)return;
        setData(result);setDraft({...result.filters,county:result.filters.county ?? ''});setError('');
      }catch(error){if(!controller.signal.aborted){setData(null);setError(error instanceof Error && error.name!=='TimeoutError' ? error.message : 'The dashboard is taking too long to respond. Please try again.');}}
      finally{if(!controller.signal.aborted)setBusy(false);}
    }
    void load();return ()=>controller.abort();
  },[filters,revision,router]);
  function apply(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setData(null);setFilters({...draft});}
  function refresh(){setBusy(true);setData(null);setRevision(value=>value+1);}
  function reset(){setBusy(true);setData(null);setDraft(emptyFilters);setFilters({...emptyFilters});}
  function selectCounty(county:string){if(!data)return;const next={from:data.filters.from,to:data.filters.to,county};setDraft(next);setBusy(true);setData(null);setFilters(next);}
  function preset(days:number){if(!data)return;const start=new Date(`${data.today}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-days+1);const next={from:start.toISOString().slice(0,10),to:data.today,county:draft.county};setDraft(next);setBusy(true);setData(null);setFilters(next);}
  const activeCounty=data?.filters.county ? data.filters.county==='unavailable' ? 'Location unavailable / legacy' : data.filters.county : 'All counties';
  return <>
    <section className="account-card dashboard-controls" aria-labelledby="dashboard-filters"><div className="section-toolbar"><div><p className="eyebrow">Activity overview</p><h2 id="dashboard-filters">Explore system activity</h2></div><button className="button button-secondary" disabled={busy} onClick={refresh}>Refresh dashboard</button></div>
      <form aria-label="Dashboard filters" onSubmit={apply}><fieldset className="dashboard-filter-grid" disabled={busy}>
        <label className="field">From date<input type="date" name="from" min="1000-01-01" max="9999-12-31" required value={draft.from} onChange={event=>setDraft({...draft,from:event.target.value})} /></label>
        <label className="field">To date<input type="date" name="to" min="1000-01-01" max="9999-12-31" required value={draft.to} onChange={event=>setDraft({...draft,to:event.target.value})} /></label>
        <label className="field">County<select name="county" value={draft.county} onChange={event=>setDraft({...draft,county:event.target.value})}><option value="">All counties</option>{countyNames.map(county=><option key={county} value={county}>{county}</option>)}<option value="unavailable">Location unavailable / legacy</option></select></label>
        <button className="button">Apply filters</button>
      </fieldset></form>
      <div className="action-row dashboard-presets"><button className="text-button" disabled={busy || !data} onClick={()=>preset(7)}>Last 7 days</button><button className="text-button" disabled={busy || !data} onClick={()=>preset(30)}>Last 30 days</button><button className="text-button" disabled={busy} onClick={reset}>Reset filters</button></div>
      <p className="field-hint">Dates use East Africa Time. Select up to 366 days. Verification counties come from device-reported checks; report counties are supplied by farmers.</p>
    </section>
    {busy && <section className="account-card" role="status">Loading dashboard…</section>}
    {error && !busy && <section className="account-card" role="alert"><h2>Dashboard unavailable</h2><p>{error}</p><button className="button" onClick={refresh}>Try again</button></section>}
    {!busy && data && <div className="dashboard-content">
      <div className="dashboard-period"><p><strong>{chartDate(data.filters.from)} {data.filters.from.slice(0,4)} – {chartDate(data.filters.to)} {data.filters.to.slice(0,4)}</strong> · {activeCounty}</p><p className="field-hint">Updated {verificationTime(data.generatedAt)} EAT. Refresh to load new activity.</p></div>
      <dl className="dashboard-stats" aria-label="Dashboard summary">
        {[
          ['Products in catalogue',data.inventory.products,'All time · all counties','products'],
          ['Package codes',data.inventory.packageCodes,'All time · all counties','codes'],
          ['Verifications',data.summary.verifications,'Selected dates and county','verifications'],
          ['Checks today',data.summary.todayVerifications,`Today (${data.today}) · selected county`,'today'],
          ['Checks requiring review',data.summary.reviewRequired,'Selected dates and county','review'],
          ['Unresolved reports',data.summary.unresolvedReports,'Submitted in selected dates/county','reports'],
        ].map(([label,value,note,key])=><div key={key}><dt>{label}</dt><dd data-metric={key}>{count(Number(value))}</dd><p>{note}</p></div>)}
      </dl>
      {data.summary.verifications===0 && Object.values(data.reportCounts).every(value=>value===0) && <p className="empty-state" role="status">No verification or report activity in this period and county. Adjust the filters to explore other records.</p>}
      <div className="dashboard-grid">
        <section className="account-card"><h2>Activity over time</h2><p className="field-hint">Daily checks and newly submitted reports for the selected period.</p><ActivityChart daily={data.daily} /></section>
        <section className="account-card"><h2>Verification outcomes</h2><p className="field-hint">{count(data.summary.verifications)} saved checks in this view.</p><OutcomeChart counts={data.outcomes} /></section>
      </div>
      <div className="dashboard-grid">
        <section className="account-card"><div className="section-toolbar"><h2>Product reports</h2><Link href="/admin/reports">Review reports</Link></div><p className="field-hint">Current review status of reports submitted in the selected period and county.</p><ul className="report-status-totals">{Object.entries(reportStatuses).map(([status,label])=><li key={status}><Link href={`/admin/reports?status=${status}`}>{label}</Link><strong>{count(data.reportCounts[status as keyof typeof reportStatuses])}</strong></li>)}</ul>
          <h3>Frequently reported products</h3><p className="field-hint">Reports record concerns; their number does not establish that a product is counterfeit.</p>
          {data.topReported.length===0 ? <p className="empty-state">No products reported in this view.</p> : <ol className="dashboard-ranked">{data.topReported.map((product,index)=><li key={`${product.productId}:${index}`}><div><Link href={`/admin/reports?q=${encodeURIComponent(product.name)}`}>{product.name}</Link><span className="cell-note">{product.productId ? 'Catalogue product' : 'Unlisted product · grouped by entered name'}</span></div><div><strong>{count(product.total)} report{product.total===1 ? '' : 's'}</strong><span className="cell-note">{count(product.unresolved)} unresolved</span></div></li>)}</ol>}
        </section>
        <section className="account-card"><h2>Report locations</h2><p className="field-hint">County of concern entered by the farmer. These are separate from device-recorded verification locations.</p>{data.reportCounties.length===0 ? <p className="empty-state">No report locations in this view.</p> : <CountyChart rows={data.reportCounties} kind="reports" onSelectCounty={selectCounty} />}</section>
      </div>
      <section className="account-card"><h2>Verification activity by county</h2><p className="field-hint">Device-reported verification counties, not package distribution assignments. Checks without a resolved current county, including older profile-based records, appear under “Location unavailable or legacy”.</p>
        {data.verificationCounties.length===0 ? <p className="empty-state">No verification locations in this view.</p> : <><CountyChart rows={data.verificationCounties} kind="verifications" onSelectCounty={selectCounty} /><details className="chart-data county-data"><summary>View county outcome counts</summary><div className="table-scroll" role="region" aria-label="Verification totals by county" tabIndex={0}><table className="records-table dashboard-counties"><thead><tr><th scope="col">County</th><th scope="col">Total</th><th scope="col">Matched</th><th scope="col">Expired</th><th scope="col">Flagged</th><th scope="col">Requires review</th><th scope="col">Other</th></tr></thead><tbody>{data.verificationCounties.map(row=><tr key={row.county ?? 'none'}><th scope="row">{countyLabel(row.county)}</th><td>{count(row.total)}</td><td>{count(row.outcomes.verified)}</td><td>{count(row.outcomes.expired)}</td><td>{count(row.outcomes.suspicious)}</td><td>{count(row.outcomes.review_required)}</td><td>{count(row.outcomes.inactive+row.outcomes.unregistered+row.outcomes.invalid+row.outcomes.reported)}</td></tr>)}</tbody></table></div></details><p className="field-hint">Other includes inactive, unknown, invalid and legacy reported outcomes.</p></>}
      </section>
      <div className="dashboard-grid">
        <section className="account-card"><div className="section-toolbar"><h2>Recent verifications</h2><Link href="/admin/verifications">View all records</Link></div>{data.recentVerifications.length===0 ? <p className="empty-state">No recent checks in this view.</p> : <ul className="dashboard-recent">{data.recentVerifications.map(record=><li key={record.id}><div><strong>{record.productName ?? 'Product not identified'}</strong><span className="cell-note">#{record.id} · {verificationTime(record.verifiedAt)} EAT</span><span className="cell-note">{countyLabel(record.county)}</span><Link href={`/admin/verifications?q=${encodeURIComponent(record.enteredCode)}`}>View checks for {record.enteredCode || '(empty code)'}</Link></div><ResultBadge result={record.result} /></li>)}</ul>}</section>
        <section className="account-card"><div className="section-toolbar"><h2>Recent reports</h2><Link href="/admin/reports">View all reports</Link></div>{data.recentReports.length===0 ? <p className="empty-state">No recent reports in this view.</p> : <ul className="dashboard-recent">{data.recentReports.map(report=><li key={report.id}><div><strong>{report.productName}</strong><span className="cell-note">#{report.id} · {verificationTime(report.createdAt)} EAT</span><Link href={`/admin/reports?q=${encodeURIComponent(report.productName)}`}>View reports for this product</Link></div><span className={`status-badge report-${report.status}`}>{reportStatuses[report.status]}</span></li>)}</ul>}</section>
      </div>
    </div>}
  </>;
}
