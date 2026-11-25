// Unit tests for the pin-matching helpers. Names are real project names from the
// scraped data plus real OSM names; the tricky cases are the ones that must NOT match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkName,
  distinctiveTokens,
  insideSector,
  normalise,
  numbersCompatible,
  pointInEdges,
  sectorKey,
  similarity,
  stripDeveloper,
  type Edges,
} from '../scripts/lib/pinmatch.ts';

test('normalise strips punctuation, city words, sector numbers; keeps other numbers', () => {
  assert.equal(normalise('AIPL - JOY CENTRAL GURGAON'), 'aipl joy central');
  assert.equal(normalise('Godrej Alira, Sector 39, Gurugram'), 'godrej alira');
  assert.equal(normalise('Max Estate 360'), 'max estate 360');
  assert.equal(normalise('Smartworld Phase II'), 'smartworld phase 2');
  assert.equal(normalise("Ambience - Creacions"), 'ambience creacions');
});

test('similarity: same name in different order / extra generic words scores 1', () => {
  assert.equal(similarity('Godrej Astra', 'Godrej Astra'), 1);
  assert.equal(similarity('DLF The Crest', 'The Crest'), 1);
  assert.equal(similarity('Elan The Presidential', 'Presidential Towers Elan'), 1);
  assert.ok(similarity('M3M Golf Estate', 'Golf Estate') >= 0.9);
  assert.ok(similarity('Godrej Astra', 'Godrej Aria') < 0.9);
});

test('distinctive tokens exclude developer and generic words', () => {
  assert.deepEqual(distinctiveTokens('M3M Golf Estate', 'M3M'), ['golf']);
  assert.deepEqual(distinctiveTokens('DLF The Crest', 'DLF'), ['crest']);
  assert.deepEqual(distinctiveTokens('Max Estate 360', 'Max Estates'), ['360']);
  assert.deepEqual(distinctiveTokens('Elite', null), ['elite']);
});

test('generic names: a single generic-looking word only matches a name that contains it', () => {
  // "The Crest" must not match "Crestview" or "Crest Avenue Market"... only names with the token "crest".
  assert.equal(checkName('DLF The Crest', 'DLF', 'Crestview Apartments').allDistinctive, false);
  assert.equal(checkName('DLF The Crest', 'DLF', 'The Crest').allDistinctive, true);
  // "Elite" alone is not enough to pass the score when the candidate is a different "Elite …" place
  const elite = checkName('Elite', null, 'Elite Grand Banquet Hall');
  assert.equal(elite.allDistinctive, true); // token present …
  assert.ok(elite.score >= 0.9); // … and a subset scores high, so the SECTOR check must decide (see classification)
});

test('developer-prefixed names: developer word alone never matches', () => {
  const c = checkName('M3M Golf Estate', 'M3M', 'M3M Urbana');
  assert.equal(c.allDistinctive, false);
  assert.ok(c.score < 0.9);
  assert.equal(stripDeveloper('M3M Golf Estate', 'M3M'), 'Golf Estate');
  assert.equal(stripDeveloper('DLF - ULTIMA', 'DLF'), 'ULTIMA');
  assert.equal(stripDeveloper('Golf Estate', 'M3M'), null);
});

test('phase numbers: "Phase 2" must not match "Phase 1"', () => {
  assert.equal(numbersCompatible('Smartworld One DXP Phase 2', 'Smartworld One DXP Phase 1'), false);
  assert.equal(checkName('Smartworld One DXP Phase 2', 'Smartworld', 'Smartworld One DXP Phase 1').score, 0);
  assert.equal(checkName('Smartworld One DXP Phase II', 'Smartworld', 'Smartworld One DXP Phase 2').score, 1);
  assert.equal(numbersCompatible('Max Estate 360', 'Max Estate 361'), false);
  assert.equal(checkName('Max Estate 360', 'Max Estates', 'Max Estate 361').allDistinctive, false);
  // A project with a phase number can match an OSM object without one (site mapped once)…
  assert.equal(numbersCompatible('M3M Golf Estate 2', 'M3M Golf Estate'), true);
  // …but distinctive "2" is then missing, so it can never be an automatic match.
  assert.equal(checkName('M3M Golf Estate 2', 'M3M', 'M3M Golf Estate').allDistinctive, false);
});

test('sector names are parsed, including parts and letters', () => {
  assert.equal(sectorKey('Sector 15'), '15');
  assert.equal(sectorKey('Sector-63A'), '63A');
  assert.equal(sectorKey('Sector 15-II'), '15');
  assert.equal(sectorKey('Sector 15 Part 2'), '15');
  assert.equal(sectorKey('Sector Road'), null);
  assert.equal(sectorKey('Ireo City'), null);
});

test('point in polygon works with unordered edges and holes', () => {
  // 1×1 square split into two unordered segments + a hole in the middle
  const P = (lat: number, lng: number) => ({ lat, lng });
  const sq: Edges = [
    [P(0, 1), P(1, 1)],
    [P(0, 0), P(0, 1)],
    [P(1, 1), P(1, 0)],
    [P(1, 0), P(0, 0)],
  ];
  const hole: Edges = [
    [P(0.4, 0.4), P(0.4, 0.6)],
    [P(0.4, 0.6), P(0.6, 0.6)],
    [P(0.6, 0.6), P(0.6, 0.4)],
    [P(0.6, 0.4), P(0.4, 0.4)],
  ];
  assert.equal(pointInEdges(P(0.2, 0.2), sq), true);
  assert.equal(pointInEdges(P(1.2, 0.2), sq), false);
  assert.equal(pointInEdges(P(0.5, 0.5), [...sq, ...hole]), false);
  assert.equal(pointInEdges(P(0.2, 0.2), [...sq, ...hole]), true);
});

test('radius sector check uses km', () => {
  const centre = { lat: 28.4, lng: 77.05 };
  assert.equal(insideSector({ lat: 28.41, lng: 77.05 }, { kind: 'radius', centre, radiusKm: 1.5, label: 'x' }), true); // ~1.1 km
  assert.equal(insideSector({ lat: 28.42, lng: 77.05 }, { kind: 'radius', centre, radiusKm: 1.5, label: 'x' }), false); // ~2.2 km
});
