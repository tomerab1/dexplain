/**
 * Diffs two image models by layer, matching layers across sides by createdBy text
 * as a multiset (duplicates pair in order). Returns size deltas and lists of added/removed.
 */

/**
 * Matches layers from A and B by createdBy, treating duplicates as a multiset.
 * Returns {changed, added, removed} where changed contains byte deltas.
 */
function matchLayersByCreatedBy(layersA, layersB) {
  // Build multisets: maps from createdBy to list of (index, layer) pairs
  const aByCreatedBy = new Map();
  const bByCreatedBy = new Map();

  for (let i = 0; i < layersA.length; i++) {
    const key = layersA[i].createdBy;
    if (!aByCreatedBy.has(key)) aByCreatedBy.set(key, []);
    aByCreatedBy.get(key).push({ index: i, layer: layersA[i] });
  }

  for (let i = 0; i < layersB.length; i++) {
    const key = layersB[i].createdBy;
    if (!bByCreatedBy.has(key)) bByCreatedBy.set(key, []);
    bByCreatedBy.get(key).push({ index: i, layer: layersB[i] });
  }

  const changed = [];
  const added = [];
  const removed = [];
  const matchedAIndices = new Set();
  const matchedBIndices = new Set();

  // Match pairs in order of appearance for each createdBy
  for (const [createdBy, aList] of aByCreatedBy) {
    const bList = bByCreatedBy.get(createdBy) ?? [];
    for (let i = 0; i < Math.min(aList.length, bList.length); i++) {
      const aItem = aList[i];
      const bItem = bList[i];
      const deltaBytes = bItem.layer.bytes - aItem.layer.bytes;
      if (deltaBytes !== 0) {
        changed.push({
          createdBy,
          bytesA: aItem.layer.bytes,
          bytesB: bItem.layer.bytes,
          deltaBytes,
        });
      }
      matchedAIndices.add(aItem.index);
      matchedBIndices.add(bItem.index);
    }
    // Remaining A items are removed, remaining B items are added
    for (let i = Math.min(aList.length, bList.length); i < aList.length; i++) {
      removed.push({ createdBy, bytes: aList[i].layer.bytes });
      matchedAIndices.add(aList[i].index);
    }
    for (let i = Math.min(aList.length, bList.length); i < bList.length; i++) {
      added.push({ createdBy, bytes: bList[i].layer.bytes });
      matchedBIndices.add(bList[i].index);
    }
  }

  // Unmatched B layers (no matching createdBy in A)
  for (const [createdBy, bList] of bByCreatedBy) {
    if (!aByCreatedBy.has(createdBy)) {
      for (const bItem of bList) {
        added.push({ createdBy, bytes: bItem.layer.bytes });
      }
    }
  }

  return { changed, added, removed };
}

/**
 * Computes layer deltas between two images.
 * @param {Object} imageA - Image model with {ref, totalBytes, layers:[...]}
 * @param {Object} imageB - Image model with {ref, totalBytes, layers:[...]}
 * @returns {{totalDeltaBytes, added, removed, changed}} Layer deltas
 */
export function diffLayers(imageA, imageB) {
  const { changed, added, removed } = matchLayersByCreatedBy(imageA.layers, imageB.layers);
  return {
    totalDeltaBytes: imageB.totalBytes - imageA.totalBytes,
    added,
    removed,
    changed,
  };
}
