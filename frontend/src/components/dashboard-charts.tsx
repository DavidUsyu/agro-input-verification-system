'use client';

import { useId, useState } from 'react';
import type { DailyActivity } from '@/lib/dashboard-types';
import type { VerificationOutcome } from '@/lib/verification-types';
import { resultLabels } from '@/lib/verification-types';

const dateFormatter = new Intl.DateTimeFormat('en-KE',{day:'numeric',month:'short',timeZone:'UTC'});
export function chartDate(date:string) { return dateFormatter.format(new Date(`${date}T00:00:00Z`)); }
export function ActivityChart({ daily }: { daily:DailyActivity[] }) {
  const id = useId();
  const maximum = Math.max(1,...daily.flatMap(day=>[day.verifications,day.reports]));
  const x = (index:number)=>daily.length===1 ? 375 : 50+index/(daily.length-1)*650;
  const y = (count:number)=>195-count/maximum*155;
  const ticks = [...new Set([0,Math.ceil(maximum/2),maximum])];
  const dates = [...new Set([0,Math.floor((daily.length-1)/2),daily.length-1])];
  return <>
    <div className="chart-legend"><span><i className="chart-key checks-key" aria-hidden="true" />Verifications</span><span><i className="chart-key reports-key" aria-hidden="true" />Reports submitted</span></div>
    <svg className="activity-chart" viewBox="0 0 740 240" role="img" aria-labelledby={`${id}-title ${id}-description`}>
      <title id={`${id}-title`}>Daily verifications and product reports</title><desc id={`${id}-description`}>Counts for each date in East Africa Time. Exact daily counts are available in the table below.</desc>
      {ticks.map(tick=><g key={tick}><line x1={50} x2={700} y1={y(tick)} y2={y(tick)} className="chart-grid-line" /><text x={40} y={y(tick)+4} textAnchor="end">{tick}</text></g>)}
      {(['verifications','reports'] as const).map(series=><g key={series} className={`trend-${series}`}>
        <polyline points={daily.map((day,index)=>`${x(index)},${y(day[series])}`).join(' ')} fill="none" strokeWidth={3} />
        {daily.map((day,index)=><circle key={day.date} cx={x(index)} cy={y(day[series])} r={3}><title>{day.date}: {day[series]} {series==='reports' ? 'reports submitted' : 'verifications'}</title></circle>)}
      </g>)}
      {dates.map(index=><text key={index} x={x(index)} y={225} textAnchor={index===0 && daily.length>1 ? 'start' : index===daily.length-1 && daily.length>1 ? 'end' : 'middle'}>{chartDate(daily[index].date)}</text>)}
    </svg>
    <details className="chart-data"><summary>View daily counts</summary><div className="table-scroll"><table className="records-table"><caption className="sr-only">Daily activity in East Africa Time</caption><thead><tr><th scope="col">Date</th><th scope="col">Verifications</th><th scope="col">Reports submitted</th></tr></thead><tbody>{daily.map(day=><tr key={day.date}><th scope="row">{day.date}</th><td>{day.verifications}</td><td>{day.reports}</td></tr>)}</tbody></table></div></details>
  </>;
}

export function OutcomeChart({ counts }: { counts:Record<VerificationOutcome,number> }) {
  const maximum = Math.max(1,...Object.values(counts));
  return <ul className="outcome-bars">{(Object.entries(counts) as [VerificationOutcome,number][]).map(([result,count])=><li key={result}>
    <div className="bar-heading"><span>{result==='reported' ? 'Reported (legacy result)' : resultLabels[result]}</span><strong>{count.toLocaleString('en-KE')}</strong></div>
    <div className="bar-track" aria-hidden="true"><span className={`outcome-bar bar-${result}`} style={{width:`${count/maximum*100}%`}} /></div>
  </li>)}</ul>;
}

const countySeries = [
  {key:'verified',label:'Matched'}, {key:'review_required',label:'Requires review'},
  {key:'suspicious',label:'Flagged'}, {key:'expired',label:'Expired'}, {key:'other',label:'Other'},
] as const;
type CountyRow = {county:string|null;total:number;outcomes?:Record<VerificationOutcome,number>};

export function CountyChart({ rows, kind, onSelectCounty }: { rows:CountyRow[]; kind:'verifications'|'reports'; onSelectCounty:(county:string)=>void }) {
  const [showAll,setShowAll]=useState(false);
  const maximum=Math.max(1,...rows.map(row=>row.total));
  const visible=showAll ? rows : rows.slice(0,10);
  const unit=kind==='reports' ? 'reports' : 'checks';
  return <div className="county-chart" role="group" aria-label={kind==='reports' ? 'Report county bar chart' : 'Verification county bar chart'}>
    {kind==='verifications' && <div className="chart-legend county-legend">{countySeries.map(series=><span key={series.key}><i className={`chart-key county-${series.key}`} aria-hidden="true" />{series.label}</span>)}</div>}
    <p className="field-hint">Select a location to filter the dashboard.</p>
    <div className="county-scale" aria-hidden="true"><span>0</span><span>{maximum.toLocaleString('en-KE')} {unit}</span></div>
    <ul className="county-bars">{visible.map(row=>{
      const label=row.county ?? (kind==='reports' ? 'County not provided' : 'Location unavailable or legacy');
      const totals=row.outcomes ? {...row.outcomes,other:row.outcomes.inactive+row.outcomes.unregistered+row.outcomes.invalid+row.outcomes.reported} : null;
      return <li key={row.county ?? 'unavailable'}><button type="button" className="county-bar-button" data-county={row.county ?? 'unavailable'} data-total={row.total} onClick={()=>onSelectCounty(row.county ?? 'unavailable')} aria-label={`${label}: ${row.total} ${unit}. Filter dashboard to this location.`}>
        <span className="county-bar-heading"><span>{label}</span><strong>{row.total.toLocaleString('en-KE')}</strong></span>
        <span className="county-bar-track" aria-hidden="true">
          {totals ? countySeries.map(series=>totals[series.key]>0 && <span key={series.key} className={`county-segment county-${series.key}`} style={{width:`${totals[series.key]/maximum*100}%`}} title={`${series.label}: ${totals[series.key]}`} />)
            : <span className="county-segment county-verified" style={{width:`${row.total/maximum*100}%`}} />}
        </span>
      </button></li>;
    })}</ul>
    {rows.length>10 && <button type="button" className="text-button" onClick={()=>setShowAll(value=>!value)}>{showAll ? 'Show top 10 locations' : `Show all ${rows.length} locations`}</button>}
  </div>;
}
