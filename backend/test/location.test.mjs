import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { assessLocation, countyNames } = require('../dist/location/county-location.js');
const { generateProductCode } = require('../dist/products/code-generator.js');
const boundaries = require('../src/location/data/kenya-counties.json');
const point = (latitude, longitude, changes = {}) => ({ latitude, longitude, accuracy: 30, timestamp: Date.now(), ...changes });

test('all 47 county names have locally bundled boundaries', () => {
  assert.equal(countyNames.length, 47); assert.equal(new Set(countyNames).size, 47);
  assert.deepEqual(boundaries.map((feature) => feature.name).sort(), countyNames);
});
test('town coordinates resolve to the correct county without external services', () => {
  for (const [latitude, longitude, name] of [[-0.3031,36.0800,'Nakuru'],[-1.286389,36.817223,'Nairobi'],[-4.04,39.70,'Mombasa'],[-0.1022,34.7617,'Kisumu']]) {
    assert.deepEqual(assessLocation(point(latitude,longitude)), { county: name, status: 'resolved' });
  }
});
test('missing, stale, future and inaccurate measurements do not resolve a county', () => {
  assert.equal(assessLocation(null).status,'unavailable');
  assert.equal(assessLocation(point(-0.3031,36.08,{timestamp:Date.now()-121000})).status,'stale');
  assert.equal(assessLocation(point(-0.3031,36.08,{timestamp:Date.now()+31000})).status,'stale');
  assert.equal(assessLocation(point(-0.3031,36.08,{accuracy:10000})).status,'inaccurate');
  assert.equal(assessLocation(point(51.5,-0.12)).status,'outside_kenya');
  assert.equal(assessLocation(point(-4.0435,39.6682)).status,'boundary_uncertain');
});
test('a county border within the measurement uncertainty is held for review', () => {
  const geometry = boundaries.find((feature)=>feature.name==='Nakuru').geometry;
  const ring = geometry.type==='Polygon' ? geometry.coordinates[0] : geometry.coordinates[0][0];
  const [longitude,latitude] = ring[0];
  assert.deepEqual(assessLocation(point(latitude,longitude)), { county: null, status: 'boundary_uncertain' });
});
test('package codes are random, fixed-format and fit the existing database field', () => {
  const codes = Array.from({length:1000},()=>generateProductCode());
  assert.equal(new Set(codes).size,codes.length);
  for (const code of codes) { assert.match(code,/^AGV-(?:[0-9A-Z]{4}-){4}[0-9A-Z]{4}$/); assert.ok(code.length<=80); assert.doesNotMatch(code,/[ILOU]/); }
});
