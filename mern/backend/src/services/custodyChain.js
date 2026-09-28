/**
 * Custody hash chain.
 *
 * The ledger is append-only by convention, but a database administrator can
 * still rewrite a row, and "we promise nobody edited it" is not evidence. Each
 * record therefore carries a SHA-256 digest over its own content plus the
 * previous record's digest, so changing any field breaks that row's hash and
 * every later row's link to it.
 *
 * This is deliberately a plain hash chain and not a distributed ledger: the
 * threat being answered is "someone quietly corrected the record", and what has
 * to be provable is that a rewrite happened - not that a network agreed on it.
 *
 * The chain is PER REPORT: two items sitting on the same shelf have unrelated
 * histories, so a global chain would force every intake to depend on unrelated
 * activity.
 */
const crypto = require('crypto');

/**
 * Fields covered by the digest. Order is part of the hash, so it must not be
 * reordered without invalidating existing chains.
 */
const HASHED_FIELDS = [
  'organizationId',
  'reportId',
  'matchId',
  'returnId',
  'event',
  'fromCustodian',
  'toCustodian',
  'location',
  'note',
  'evidence',
  'actorUserId',
  'actorName',
  'occurredAt'
];

/** Stable, order-independent serialisation of the hashed fields. */
function canonical(record) {
  const payload = {};
  for (const field of HASHED_FIELDS) {
    const value = record[field];
    if (field === 'occurredAt') {
      // Dates arrive as Date, ISO string or null depending on the caller; one
      // representation has to win or re-hashing the same row would differ.
      payload[field] = value ? new Date(value).toISOString() : null;
    } else if (field === 'evidence') {
      payload[field] = [...(value || [])].map(String);
    } else {
      payload[field] = value === undefined || value === null ? '' : String(value);
    }
  }
  return JSON.stringify(payload);
}

/** sha256(previous digest | this record's canonical content). */
function hashRecord(record, prevHash = '') {
  return crypto
    .createHash('sha256')
    .update(`${prevHash || ''}|${canonical(record)}`)
    .digest('hex');
}

/** Fields a new row needs before it can be hashed. */
function sealRecord(record, prevHash = '') {
  const prev = prevHash || '';
  return { ...record, prevHash: prev, hash: hashRecord(record, prev) };
}

/**
 * Walks a chain oldest-first and reports the first row that does not verify.
 *
 * Rows written before hashing existed carry no digest. They are counted as
 * `legacy` and skipped rather than reported as tampering: accusing a pre-existing
 * record would make the whole check untrustworthy the first time it ran.
 */
function verifyChain(records = []) {
  let prevHash = '';
  let legacy = 0;
  let checked = 0;

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];

    if (!record || !record.hash) {
      legacy += 1;
      // An unsigned row breaks the link, so the next signed row must chain from
      // nothing rather than from a digest that was never written.
      prevHash = '';
      continue;
    }

    const expected = hashRecord(record, record.prevHash || '');
    const contentOk = expected === record.hash;
    const linkOk = (record.prevHash || '') === prevHash;

    if (!contentOk || !linkOk) {
      return {
        valid: false,
        checked,
        legacy,
        total: records.length,
        brokenAt: {
          id: record.id,
          event: record.event,
          occurredAt: record.occurredAt,
          index: i
        },
        // Distinguishing the two tells an operator what actually happened:
        // an edited row, or a row removed/inserted/reordered.
        reason: contentOk ? 'link-broken' : 'content-modified',
        detail: contentOk
          ? 'This row\u2019s own digest is intact, but it no longer follows the previous row - a record was added, removed or reordered.'
          : 'This row\u2019s content no longer matches its digest - the record was edited after it was written.'
      };
    }

    prevHash = record.hash;
    checked += 1;
  }

  return { valid: true, checked, legacy, total: records.length, head: prevHash };
}

module.exports = { HASHED_FIELDS, canonical, hashRecord, sealRecord, verifyChain };
