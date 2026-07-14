/** Serializes a report as pretty JSON — the machine-readable artifact Claude reasons over. */
export function renderJson(report) {
  return JSON.stringify(report, null, 2);
}
