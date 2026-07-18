/**
 * Diffs two finding arrays by identity, matching findings across sides as a multiset.
 * Returns resolved (A-only), introduced (B-only), and unchanged count.
 */

function findingIdentityKey(finding) {
  const { ruleId, evidence = {}, title } = finding;
  const evidenceKeys = ['createdBy', 'name', 'manager', 'packageManager', 'image', 'hint'];
  for (const key of evidenceKeys) {
    if (evidence[key] != null) {
      return `${ruleId}|${evidence[key]}`;
    }
  }
  const normalized = title.replace(/\d+/g, '#');
  return `${ruleId}|${normalized}`;
}

/**
 * Diffs two finding arrays by identity. Matches findings by identity key
 * (ruleId + evidence field or normalized title), treating duplicates as a multiset.
 * @param {Array<Object>} findingsA - Findings from image A
 * @param {Array<Object>} findingsB - Findings from image B
 * @returns {{resolved, introduced, unchangedCount}} Finding deltas
 */
export function diffFindings(findingsA, findingsB) {
  const aByKey = new Map();
  const bByKey = new Map();

  for (const finding of findingsA) {
    const key = findingIdentityKey(finding);
    if (!aByKey.has(key)) aByKey.set(key, []);
    aByKey.get(key).push(finding);
  }

  for (const finding of findingsB) {
    const key = findingIdentityKey(finding);
    if (!bByKey.has(key)) bByKey.set(key, []);
    bByKey.get(key).push(finding);
  }

  const resolved = [];
  const introduced = [];
  let unchangedCount = 0;
  const matchedBKeys = new Set();

  for (const [key, aList] of aByKey) {
    const bList = bByKey.get(key) ?? [];
    const pairCount = Math.min(aList.length, bList.length);
    unchangedCount += pairCount;
    matchedBKeys.add(key);

    for (let i = pairCount; i < aList.length; i++) {
      resolved.push(aList[i]);
    }
    for (let i = pairCount; i < bList.length; i++) {
      introduced.push(bList[i]);
    }
  }

  for (const [key, bList] of bByKey) {
    if (!matchedBKeys.has(key)) {
      introduced.push(...bList);
    }
  }

  return { resolved, introduced, unchangedCount };
}
