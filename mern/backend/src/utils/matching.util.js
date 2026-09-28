const { getDriver } = require('../store');
const crypto = require('crypto');

const DAY = 24 * 60 * 60 * 1000;
const MATCH_WINDOW = 14 * DAY;

const getRelevantDate = (report) => {
  if (!report) return null;
  return report.lostAt || report.foundAt || report.createdAt || null;
};

const normalizeText = (value) => (value || '').toString().trim().toLowerCase();

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'my', 'i', 'it', 'is', 'was', 'this', 'that', 'have',
  'has', 'had', 'be', 'been', 'are', 'its', 'found', 'lost', 'item'
]);

function stem(word) {
  if (word.length < 4) return word;
  if (word.endsWith('ing')) return word.slice(0, -3);
  if (word.endsWith('tion')) return word.slice(0, -4);
  if (word.endsWith('ed')) return word.slice(0, -2);
  if (word.endsWith('es')) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

function textSimilarity(a, b) {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);

  if (tokensA.length === 0 && tokensB.length === 0) return 0;

  const freqA = {};
  const freqB = {};
  tokensA.forEach(w => freqA[w] = (freqA[w] || 0) + 1);
  tokensB.forEach(w => freqB[w] = (freqB[w] || 0) + 1);

  let matchScore = 0;
  const totalA = tokensA.length;
  const totalB = tokensB.length;

  for (const word of Object.keys(freqA)) {
    if (freqB[word]) {
      const rarity = 1 + (1 / (freqA[word] + freqB[word]));
      matchScore += Math.min(freqA[word], freqB[word]) * rarity;
    }
  }

  const normalized = matchScore / Math.max(totalA, totalB);
  return Math.min(normalized, 1);
}

const WEIGHTS = {
  category: 30,
  location: 20,
  date: 15,
  text: 20,
  attributes: 15,
  serial: 100
};

function scoreMatch(lost, found) {
  let score = 0;
  const reasons = [];

  const lostProfile = lost.itemProfile || {};
  const foundProfile = found.itemProfile || {};

  const lostSerial = normalizeText(lostProfile.serialNumber);
  const foundSerial = normalizeText(foundProfile.serialNumber);
  if (lostSerial && foundSerial && lostSerial === foundSerial) {
    return { score: 1000, reasons: ['Serial number is an exact match'] };
  }

  if (lost.category && found.category && lost.category.toLowerCase() === found.category.toLowerCase()) {
    score += WEIGHTS.category;
    reasons.push('Same category');
  }

  if (lost.location && found.location && lost.location.toLowerCase() === found.location.toLowerCase()) {
    score += WEIGHTS.location;
    reasons.push('Same location');
  }

  const lostDate = getRelevantDate(lost);
  const foundDate = getRelevantDate(found);
  const diffDays = (lostDate && foundDate)
    ? Math.abs(new Date(lostDate) - new Date(foundDate)) / DAY
    : Number.POSITIVE_INFINITY;
  if (diffDays <= 1) {
    score += WEIGHTS.date;
    reasons.push('Dates are within 1 day of each other');
  } else if (diffDays <= 3) {
    score += WEIGHTS.date / 2;
    reasons.push('Dates are within 3 days of each other');
  } else if (diffDays <= 7) {
    score += WEIGHTS.date / 4;
    reasons.push('Dates are within 1 week of each other');
  } else if (diffDays <= 14) {
    score += WEIGHTS.date / 8;
    reasons.push('Dates are within 2 weeks of each other');
  }

  const textScore = textSimilarity(
    `${lost.description || ''} ${lostProfile.distinctiveMark || ''}`,
    `${found.description || ''} ${foundProfile.distinctiveMark || ''}`
  );
  score += textScore * WEIGHTS.text;
  if (textScore > 0.5) {
    reasons.push('Title and description are very similar');
  } else if (textScore > 0.2) {
    reasons.push('Title and description share some keywords');
  }

  const lostColor = normalizeText(lostProfile.color);
  const foundColor = normalizeText(foundProfile.color);
  if (lostColor && lostColor === foundColor) {
    score += 5;
    reasons.push(`Color matches (${foundColor})`);
  }

  const lostBrand = normalizeText(lostProfile.brand);
  const foundBrand = normalizeText(foundProfile.brand);
  if (lostBrand && lostBrand === foundBrand) {
    score += 10;
    reasons.push(`Brand matches (${foundBrand})`);
  }

  return { score, reasons };
}

async function findMatches(report, store) {
  const oppositeType = report.type === 'LOST' ? 'FOUND' : 'LOST';
  const reportDate = getRelevantDate(report);

  let candidates = await store.listReports(report.organizationId, { type: oppositeType });

  if (reportDate) {
    const reportDateTime = new Date(reportDate).getTime();
    candidates = candidates.filter(c => {
      const cDate = getRelevantDate(c);
      if (!cDate) return true;
      const cTime = new Date(cDate).getTime();
      return Math.abs(cTime - reportDateTime) <= MATCH_WINDOW;
    });
  }

  const scored = candidates.map(candidate => {
    const { score, reasons } = scoreMatch(report, candidate);
    return { report: candidate, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  const topMatches = scored.slice(0, 5);

  if (topMatches.length > 0) {
    for (const matchObj of topMatches) {
      const matchedReport = matchObj.report;
      const lostReportId = report.type === 'LOST' ? report.id : matchedReport.id;
      const foundReportId = report.type === 'FOUND' ? report.id : matchedReport.id;

      const existingMatch = (await store.listMatches(report.organizationId, { reportId: lostReportId }))
        .find(m => m.lostReportId === lostReportId && m.foundReportId === foundReportId);

      if (!existingMatch) {
        await store.createMatch({
          organizationId: report.organizationId,
          lostReportId,
          foundReportId,
          visualScore: Math.min(matchObj.score + 10, 100),
          semanticScore: Math.round(textSimilarity(report.description || '', matchedReport.description || '') * 100),
          attributeScore: matchObj.score,
          locationScore: report.location === matchedReport.location ? 100 : 50,
          timeScore: reportDate && getRelevantDate(matchedReport) ? Math.max(0, 100 - Math.abs(new Date(reportDate) - new Date(getRelevantDate(matchedReport))) / DAY) : 50,
          contextScore: 75,
          finalScore: Math.min(matchObj.score, 100),
          evidence: matchObj.reasons.map(r => ({ type: r, score: 85, details: r })),
          status: matchObj.score >= 90 ? 'PENDING_VERIFICATION' : 'MANUAL_REVIEW'
        });
      }

      await store.createNotification({
        organizationId: report.organizationId,
        userId: matchedReport.userId,
        type: 'NEW_MATCH',
        title: `Potential match found for your ${matchedReport.type.toLowerCase()} item`,
        message: `We found a potential match for your ${matchedReport.category}: ${matchObj.reasons.join(', ')}`,
        referenceId: matchedReport.id
      });
    }
  }

  return topMatches;
}

async function triggerMatching(reportId) {
  try {
    const store = getDriver();
    const report = await store.findReportById(reportId);
    if (!report) return;

    console.log(`[Matching] Running matching for report ${reportId}`);
    const matches = await findMatches(report, store);
    console.log(`[Matching] Found ${matches.length} potential matches for report ${reportId}`);
  } catch (err) {
    console.error(`[Matching] Error processing report ${reportId}:`, err);
  }
}

module.exports = {
  findMatches,
  scoreMatch,
  textSimilarity,
  triggerMatching
};
