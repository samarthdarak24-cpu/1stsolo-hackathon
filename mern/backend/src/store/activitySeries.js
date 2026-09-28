/**
 * Shared activity-series bucketing for the "Report volume" chart.
 *
 * Both store drivers import this so the Mongo-backed and in-memory renders can
 * never drift apart.
 *
 * The label format is chosen by how many days one bucket actually spans, not by
 * how many buckets there are. Keying it off the bucket count was a real bug: the
 * 30-day view produces 5 buckets of 6 days each, and because 5 <= 7 the code
 * labelled every bar with a weekday name — so a bar reading "Sun 8" actually
 * meant "the 6 days ending today", not Sunday. Anyone reading the chart was
 * being shown a wrong label for a real number.
 */
const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
const DAY_MS = 24 * 60 * 60 * 1000;

// One bar per day up to a week; weekly bars up to a month; monthly beyond that.
const bucketCountFor = (days) => (
  days <= 7 ? days : days <= 30 ? Math.ceil(days / 7) : Math.ceil(days / 30)
);

const labelFor = (bucketMs, anchor) => {
  const daysPerBucket = bucketMs / DAY_MS;
  if (daysPerBucket <= 1.5) return anchor.toLocaleDateString('en-US', { weekday: 'short' });
  if (daysPerBucket <= 15) return anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return anchor.toLocaleDateString('en-US', { month: 'short' });
};

/**
 * @param {Array<string|number|Date>} dates report timestamps
 * @param {'7d'|'30d'|'90d'|'1y'} period
 * @returns {Array<{label: string, value: number}>} oldest bucket first
 */
function activitySeries(dates, period = '30d') {
  const days = PERIOD_DAYS[period] || 30;
  const bucketCount = bucketCountFor(days);
  const bucketMs = (days * DAY_MS) / bucketCount;
  const now = Date.now();
  const out = [];

  for (let i = bucketCount - 1; i >= 0; i -= 1) {
    const start = now - (i + 1) * bucketMs;
    const end = now - i * bucketMs;
    const value = dates.filter((d) => {
      const t = new Date(d || 0).getTime();
      return t >= start && t < end;
    }).length;
    // A one-day window is named for the day it closes on, so the last bar reads
    // as "today". Wider buckets are named for the day they open on.
    const anchor = bucketMs <= 1.5 * DAY_MS ? new Date(end) : new Date(start);
    out.push({ label: labelFor(bucketMs, anchor), value });
  }
  return out;
}

module.exports = { activitySeries, PERIOD_DAYS };