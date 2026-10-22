'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveChallenge, createSidePieces } = require('../src/game/Arbiter');
const { PIECES } = require('../src/game/constants');

const P = (rank, id) => ({ id: id || `p${rank}`, side: 'white', rank });

test('flag: any opposing piece captures the flag', () => {
  for (const rank of [0, 1, 2, 5, 7, 15]) {
    const r = resolveChallenge(P(rank, 'atk'), P(-1, 'flag'));
    assert.equal(r.outcome, 'ATTACKER_WINS');
    assert.deepEqual(r.eliminatedIds, ['flag']);
    assert.equal(r.flagCaptured, true);
  }
});

test('flag: the flag cannot attack — it is captured instead', () => {
  const r = resolveChallenge(P(-1, 'flag'), P(1, 'priv'));
  assert.equal(r.outcome, 'DEFENDER_WINS');
  assert.deepEqual(r.eliminatedIds, ['flag']);
  assert.equal(r.flagCaptured, true);
});

test('spy beats every officer (ranks 2..15)', () => {
  for (const rank of [2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
    const r = resolveChallenge(P(0, 'spy'), P(rank, `o${rank}`));
    assert.equal(r.outcome, 'ATTACKER_WINS', `spy should beat rank ${rank}`);
    assert.deepEqual(r.eliminatedIds, [`o${rank}`]);
  }
});

test('private beats spy, in both directions', () => {
  const a = resolveChallenge(P(1, 'priv'), P(0, 'spy'));
  assert.equal(a.outcome, 'ATTACKER_WINS');
  assert.deepEqual(a.eliminatedIds, ['spy']);
  const d = resolveChallenge(P(0, 'spy'), P(1, 'priv'));
  assert.equal(d.outcome, 'DEFENDER_WINS');
  assert.deepEqual(d.eliminatedIds, ['spy']);
});

test('spy vs spy and private vs private: mutual elimination', () => {
  assert.equal(resolveChallenge(P(0, 'a'), P(0, 'b')).outcome, 'MUTUAL_ELIMINATION');
  assert.equal(resolveChallenge(P(1, 'a'), P(1, 'b')).outcome, 'MUTUAL_ELIMINATION');
});

test('equal officer ranks eliminate each other', () => {
  for (const rank of [2, 7, 10, 15]) {
    const r = resolveChallenge(P(rank, 'a'), P(rank, 'b'));
    assert.equal(r.outcome, 'MUTUAL_ELIMINATION');
    assert.deepEqual(r.eliminatedIds.sort(), ['a', 'b']);
  }
});

test('higher rank wins on either side', () => {
  assert.equal(resolveChallenge(P(10, 'a'), P(7, 'b')).outcome, 'ATTACKER_WINS');
  assert.equal(resolveChallenge(P(7, 'a'), P(10, 'b')).outcome, 'DEFENDER_WINS');
});

test('createSidePieces builds the full 21-piece loadout per side', () => {
  for (const side of ['white', 'black']) {
    const pieces = createSidePieces(side);
    assert.equal(pieces.length, 21);
    assert.equal(new Set(pieces.map((p) => p.id)).size, 21);
    const byRank = {};
    for (const p of pieces) byRank[p.rank] = (byRank[p.rank] || 0) + 1;
    for (const def of PIECES) {
      assert.equal(byRank[def.rank], def.count, `rank ${def.rank} (${def.key})`);
    }
    for (const p of pieces) assert.equal(p.side, side);
  }
});
