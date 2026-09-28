/**
 * Reindex report embeddings.
 *
 * Run with:
 *   node scripts/reindex.js                 # only reports missing a vector
 *   node scripts/reindex.js --force         # re-embed every report
 *   node scripts/reindex.js --org <orgId>   # one organization
 *
 * Why this exists: a report's `embedding` (SigLIP2, from its photo) and
 * `textEmbedding` (BGE-M3, from its text) are what let the matcher compute real
 * cosine similarities instead of falling back to attribute proxies. A report
 * created while the inference service was down, or before the models were warm,
 * keeps empty vectors forever - it still appears in lists and looks fine, but it
 * can only ever match weakly. This walks the stored reports and fills the gap.
 *
 * The Node API does not push vectors into the Python vector store: the AI worker
 * sends candidate vectors inline on every `/match` call, so the durable copy that
 * matters is on the report documents. Regenerating them here is therefore enough
 * to make matching see a full candidate set again.
 *
 * Idempotent: without --force, a report that already has both vectors is skipped.
 */
require('dotenv').config();

const { initStore, getDriver } = require('../src/store');
const reportService = require('../src/services/reportService');

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const ORG = args.includes('--org') ? args[args.indexOf('--org') + 1] : null;

/** A report needs work when it is missing either vector (or when forced). */
function needsWork(report) {
  if (FORCE) return true;
  const hasVisual = Array.isArray(report.embedding) && report.embedding.length > 0;
  const hasSemantic = Array.isArray(report.textEmbedding) && report.textEmbedding.length > 0;
  return !hasVisual || !hasSemantic;
}

async function main() {
  await initStore();
  const store = getDriver();

  const orgs = ORG ? [{ id: ORG }] : await store.listOrgs();
  const summary = { scanned: 0, updated: 0, skipped: 0, failed: 0, byOrg: {} };

  for (const org of orgs) {
    const orgId = org.id || org._id;
    let offset = 0;
    const limit = 100;
    let orgUpdated = 0;

    // Page through the organization rather than loading everything at once: an
    // org can hold thousands of reports and each one triggers two model calls.
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { reports, total } = await store.listReports(orgId, { limit, offset });
      if (!reports.length) break;

      for (const report of reports) {
        summary.scanned += 1;
        if (!needsWork(report)) {
          summary.skipped += 1;
          continue;
        }
        try {
          // Fail fast when the inference service is down: without this check a
          // full org of reports "succeeds" as 27 skips because every embed call
          // failed and generateEmbeddings returned null for each one.
          // eslint-disable-next-line global-require
          const aiClient = require('../src/services/aiClient');
          const health = await aiClient.health({ force: true });
          if (health?.status === 'unreachable') {
            throw new Error(
              `inference service unreachable at AI_SERVICE_URL - start it before reindexing`
            );
          }
          // eslint-disable-next-line no-await-in-loop
          const updated = await reportService.generateEmbeddings(report);
          if (updated) {
            summary.updated += 1;
            orgUpdated += 1;
            const visual = (updated.embedding || []).length;
            const semantic = (updated.textEmbedding || []).length;
            console.log(
              `  ${updated.reference || updated.id}: visual=${visual} semantic=${semantic}`
            );
          } else {
            // Both embed calls failed inside generateEmbeddings (it swallows
            // per-signal errors). That is a failure, not "nothing to embed":
            // counting it as a skip would hide a broken service.
            summary.failed += 1;
            console.warn(`  ${report.reference || report.id}: both embed calls failed - see ai-service logs`);
          }
        } catch (err) {
          summary.failed += 1;
          console.warn(`  ${report.reference || report.id}: failed - ${err.message}`);
        }
      }

      offset += reports.length;
      if (offset >= total) break;
    }

    summary.byOrg[orgId] = orgUpdated;
    console.log(`[reindex] ${org.name || orgId}: ${orgUpdated} report(s) re-embedded`);
  }

  console.log('\n[reindex] done');
  console.log(`  scanned : ${summary.scanned}`);
  console.log(`  updated : ${summary.updated}`);
  console.log(`  skipped : ${summary.skipped}`);
  console.log(`  failed  : ${summary.failed}`);
  console.log(`  mode    : ${FORCE ? 'force (all reports)' : 'missing vectors only'}`);

  // A failure here is usually the inference service being down, which the
  // operator needs to know about rather than read as "everything was fine".
  return summary.failed > 0 ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('reindex failed:', err.message);
    process.exit(1);
  });
