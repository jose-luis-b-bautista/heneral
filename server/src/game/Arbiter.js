'use strict';

/**
 * The Arbiter: authoritative battle adjudication.
 *
 * Combat outcomes never reveal the surviving piece's rank to the opponents —
 * sanitization happens at the broadcast layer (see sockets/index.js).
 */
const { PIECES, otherSide } = require('./constants');

/**
 * Adjudicates a challenge between an attacking piece and a defending piece.
 * @param {{id: string, side: string, rank: number}} attacker
 * @param {{id: string, side: string, rank: number}} defender
 * @returns {{outcome: 'ATTACKER_WINS'|'DEFENDER_WINS'|'MUTUAL_ELIMINATION',
 *            eliminatedIds: string[], flagCaptured?: boolean}}
 */
function resolveChallenge(attacker, defender) {
  // 1. Flag Rules: any opposing piece captures the flag.
  if (defender.rank === -1) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id], flagCaptured: true };
  }
  if (attacker.rank === -1) {
    return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id], flagCaptured: true };
  }

  // 2. Spy vs Officers (rank 2 through 15): the spy eliminates the officer.
  if (attacker.rank === 0 && defender.rank >= 2) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id] };
  }
  if (defender.rank === 0 && attacker.rank >= 2) {
    return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id] };
  }

  // 3. Spy vs Private: the private eliminates the spy.
  if (attacker.rank === 1 && defender.rank === 0) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id] };
  }
  if (attacker.rank === 0 && defender.rank === 1) {
    return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id] };
  }

  // 4. Equal rank: mutual elimination.
  if (attacker.rank === defender.rank) {
    return { outcome: 'MUTUAL_ELIMINATION', eliminatedIds: [attacker.id, defender.id] };
  }

  // 5. Standard rank comparison.
  if (attacker.rank > defender.rank) {
    return { outcome: 'ATTACKER_WINS', eliminatedIds: [defender.id] };
  }
  return { outcome: 'DEFENDER_WINS', eliminatedIds: [attacker.id] };
}

/**
 * Creates the 21-piece loadout for one side, with stable unique ids.
 * @param {'white'|'black'} side
 * @returns {Array<{id: string, side: string, key: string, name: string, rank: number}>}
 */
function createSidePieces(side) {
  const pieces = [];
  let n = 0;
  for (const p of PIECES) {
    for (let i = 0; i < p.count; i += 1) {
      pieces.push({
        id: `${side}-${p.key}-${n}`,
        side,
        key: p.key,
        name: p.name,
        rank: p.rank,
      });
      n += 1;
    }
  }
  return pieces;
}

module.exports = { resolveChallenge, createSidePieces };
