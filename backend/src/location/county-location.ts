import boundaries from './data/kenya-counties.json';
import countyNames from './data/counties.json';

export { countyNames };
export interface DeviceLocation { latitude: number; longitude: number; accuracy: number; timestamp: number }
export type LocationStatus = 'unavailable' | 'stale' | 'inaccurate' | 'outside_kenya' | 'boundary_uncertain' | 'resolved';
export interface LocationAssessment { county: string | null; status: LocationStatus }
type Ring = number[][];
type Polygon = Ring[];
type Geometry = { type: string; coordinates: Polygon | Polygon[] };

function insideRing(lon: number, lat: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToRing(lon: number, lat: number, ring: Ring): number {
  const scaleX = 111320 * Math.cos(lat * Math.PI / 180); const scaleY = 110574;
  let minimum = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lon) * scaleX; const ay = (ring[j][1] - lat) * scaleY;
    const bx = (ring[i][0] - lon) * scaleX; const by = (ring[i][1] - lat) * scaleY;
    const dx = bx - ax; const dy = by - ay;
    const length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    minimum = Math.min(minimum, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return minimum;
}

export function assessLocation(location: DeviceLocation | null, now = Date.now()): LocationAssessment {
  if (!location) return { county: null, status: 'unavailable' };
  if (now - location.timestamp > 120000 || location.timestamp - now > 30000) return { county: null, status: 'stale' };
  if (location.accuracy > 5000) return { county: null, status: 'inaccurate' };
  const matches: string[] = []; let distance = Infinity;
  for (const feature of boundaries) {
    const geometry = feature.geometry as Geometry;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates as Polygon] : geometry.coordinates as Polygon[];
    for (const polygon of polygons) {
      if (insideRing(location.longitude, location.latitude, polygon[0]) && !polygon.slice(1).some((ring) => insideRing(location.longitude, location.latitude, ring))) matches.push(feature.name);
      for (const ring of polygon) distance = Math.min(distance, distanceToRing(location.longitude, location.latitude, ring));
    }
  }
  // Avoid false matches when the reported accuracy circle overlaps a border.
  // The extra 250 m allows for the simplified source geometry's uncertainty.
  if (distance <= location.accuracy + 250 || new Set(matches).size > 1) return { county: null, status: 'boundary_uncertain' };
  if (matches.length === 0) return { county: null, status: 'outside_kenya' };
  return { county: matches[0], status: 'resolved' };
}
