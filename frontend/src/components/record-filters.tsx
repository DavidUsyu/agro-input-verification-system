import type { ReactNode } from 'react';

export function RecordFilters({children,collapsible,label,active}:{children:ReactNode;collapsible:boolean;label:string;active:boolean}) {
  return collapsible ? <details className="farmer-filters"><summary>{label}{active && <span className="filter-applied">Filters applied</span>}</summary>{children}</details> : <>{children}</>;
}
