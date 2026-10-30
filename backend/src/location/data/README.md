# Kenya county boundaries

Source: geoBoundaries gbOpen, `KEN-ADM1-32016919`, representing 2020 county boundaries (47 counties).

- Metadata: https://www.geoboundaries.org/api/current/gbOpen/KEN/ADM1/
- Pinned simplified geometry: https://media.githubusercontent.com/media/wmgeolab/geoBoundaries/9469f09/releaseData/gbOpen/KEN/ADM1/geoBoundaries-KEN-ADM1_simplified.geojson
- Original source attribution: RCMRD GeoPortal / Africa GeoPortal.
- Source license reported by geoBoundaries: Public Domain.
- Downloaded 20 October 2026. The source commit is pinned; runtime verification never downloads boundaries or calls an external geocoder.

`kenya-counties.json` retains the downloaded geometry and only the county name. Source names `Tharaka` and `Taita Taveta` are displayed as `Tharaka-Nithi` and `Taita-Taveta`. `counties.json` is the sorted list of the same 47 names, shared with administrator forms and checked against migration 004's reference table.

These are approximate administrative polygons, not authoritative legal boundary determinations. The implementation adds a 250-metre border uncertainty allowance to the browser-reported accuracy radius. Stale (>2 minutes), low-accuracy (>5 km), out-of-country or ambiguous measurements cannot approve a matching record. Border uncertainty is reported privately for administrator review. Device coordinates can be spoofed; this implementation is a distribution signal, not proof of location or authenticity.

Coordinates are used transiently on the backend. Only the derived county, source label, comparison status and historical distribution assignment are retained. No raw coordinates are stored in verification records.
