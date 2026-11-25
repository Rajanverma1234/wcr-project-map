// Tests for the manual pin import helpers (latlng parsing, swap detection, sector check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boundsProblem, isConfirmed, looksSwapped, parseLatLng, rowCoords, sectorVerdict } from '../scripts/lib/pinimport.ts';
import { parseCsv } from '../scripts/lib/csv.ts';
import type { Edges } from '../scripts/lib/pinmatch.ts';

test('parseLatLng reads what Google Maps copies on right-click', () => {
  assert.deepEqual(parseLatLng('28.41234567890123, 77.04561234567891'), { lat: 28.41234567890123, lng: 77.04561234567891 });
  assert.deepEqual(parseLatLng('28.4123,77.0456'), { lat: 28.4123, lng: 77.0456 });
  assert.deepEqual(parseLatLng(' (28.4123, 77.0456) '), { lat: 28.4123, lng: 77.0456 });
  assert.deepEqual(parseLatLng('28.4123° 77.0456°'), { lat: 28.4123, lng: 77.0456 });
  assert.equal(parseLatLng('28°24\'44.3"N 77°02\'44.2"E'), null); // DMS is not accepted
  assert.equal(parseLatLng('Sector 65'), null);
  assert.equal(parseLatLng('28.4123'), null);
});

test('rowCoords: lat+lng columns, latlng column, blanks and conflicts', () => {
  assert.deepEqual(rowCoords({ lat: '', lng: '', latlng: '' }), { kind: 'blank' });
  assert.deepEqual(rowCoords({ lat: '28.4', lng: '77.05' }), { kind: 'ok', point: { lat: 28.4, lng: 77.05 }, from: 'lat,lng' });
  assert.deepEqual(rowCoords({ latlng: '28.4, 77.05' }), { kind: 'ok', point: { lat: 28.4, lng: 77.05 }, from: 'latlng' });
  assert.equal(rowCoords({ lat: '28.4', lng: '' }).kind, 'error');
  assert.equal(rowCoords({ lat: '28.4', lng: '77.05', latlng: '28.4, 77.05' }).kind, 'error');
  assert.equal(rowCoords({ latlng: 'near the mall' }).kind, 'error');
  assert.equal(rowCoords({ lat: 'abc', lng: '77' }).kind, 'error');
});

test('swapped lat/lng is detected and rejected, never fixed', () => {
  assert.equal(looksSwapped({ lat: 77.0456, lng: 28.4123 }), true);
  assert.equal(looksSwapped({ lat: 28.4123, lng: 77.0456 }), false);
  assert.match(boundsProblem({ lat: 77.0456, lng: 28.4123 })!, /swapped/);
  assert.equal(boundsProblem({ lat: 28.4123, lng: 77.0456 }), null);
  assert.match(boundsProblem({ lat: 28.7, lng: 77.1 })!, /outside/); // Delhi
  assert.match(boundsProblem({ lat: 19.07, lng: 72.87 })!, /outside/); // Mumbai
  assert.equal(boundsProblem({ lat: 28.36, lng: 76.93 }), null); // Manesar is allowed
});

test('sector check: inside / outside polygon, radius fallback, no sector', () => {
  const P = (lat: number, lng: number) => ({ lat, lng });
  const square: Edges = [
    [P(28.4, 77.05), P(28.41, 77.05)],
    [P(28.41, 77.05), P(28.41, 77.06)],
    [P(28.41, 77.06), P(28.4, 77.06)],
    [P(28.4, 77.06), P(28.4, 77.05)],
  ];
  const poly = { kind: 'polygon' as const, edges: [square], centre: P(28.405, 77.055), label: 'test' };
  assert.equal(sectorVerdict(P(28.405, 77.055), poly), 'inside');
  assert.equal(sectorVerdict(P(28.42, 77.055), poly), 'outside');
  const radius = { kind: 'radius' as const, centre: P(28.405, 77.055), radiusKm: 1.5, label: 'r' };
  assert.equal(sectorVerdict(P(28.414, 77.055), radius), 'inside'); // ~1.0 km
  assert.equal(sectorVerdict(P(28.42, 77.055), radius), 'outside'); // ~1.7 km
  assert.equal(sectorVerdict(P(28.405, 77.055), null), 'no-sector');
});

test('confirm column and CSV parsing (quotes, BOM, CRLF)', () => {
  assert.equal(isConfirmed({ confirm: 'yes' }), true);
  assert.equal(isConfirmed({ confirm: 'YES ' }), true);
  assert.equal(isConfirmed({ confirm: '' }), false);
  const rows = parseCsv('﻿slug,name,latlng,confirm\r\nmy-slug,"Name, with comma","28.41, 77.05",yes\r\n');
  assert.deepEqual(rows, [{ slug: 'my-slug', name: 'Name, with comma', latlng: '28.41, 77.05', confirm: 'yes' }]);
});
