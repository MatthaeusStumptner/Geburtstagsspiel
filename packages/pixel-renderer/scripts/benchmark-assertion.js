function describeInvalidMeasurement(row, reason) {
  return Object.freeze({
    reason,
    requestedBackend: typeof row?.requestedBackend === 'string' ? row.requestedBackend : null,
    profile: typeof row?.profile === 'string' ? row.profile : null,
    scene: typeof row?.scene === 'string' ? row.scene : null,
  });
}

function getInvalidMeasurement(row) {
  if (!Number.isFinite(row?.renderP95Ms)) return describeInvalidMeasurement(row, 'invalid-render-p95-ms');
  if (!Number.isFinite(row?.budget?.budget?.renderP95Ms)) return describeInvalidMeasurement(row, 'invalid-render-p95-budget-ms');
  return null;
}

function hasExceededRenderBudget(row) {
  return row.renderP95Ms > row.budget.budget.renderP95Ms;
}

export function selectBenchmarkAssertions(results) {
  const rows = Array.isArray(results) ? results : [];
  const assertedRows = rows.filter((row) => row?.requestedBackend === 'auto');
  const invalidEntries = assertedRows
    .map((row) => ({ row, invalidMeasurement: getInvalidMeasurement(row) }))
    .filter(({ invalidMeasurement }) => invalidMeasurement !== null);
  const invalidRows = invalidEntries.map(({ row }) => row);
  const invalidMeasurements = invalidEntries.map(({ invalidMeasurement }) => invalidMeasurement);
  const experienceDiagnostics = assertedRows.filter((row) => row?.budget?.passed === false);
  const renderWorkFailures = assertedRows.filter((row) => !invalidRows.includes(row) && hasExceededRenderBudget(row));
  const warnings = experienceDiagnostics.filter((row) => !invalidRows.includes(row) && !renderWorkFailures.includes(row));
  const nonAutoDiagnostics = rows.filter((row) => row?.requestedBackend !== 'auto' && row?.budget?.passed === false);
  return Object.freeze({
    passed: renderWorkFailures.length === 0 && invalidMeasurements.length === 0,
    assertedRows: Object.freeze(assertedRows),
    invalidMeasurements: Object.freeze(invalidMeasurements),
    renderWorkFailures: Object.freeze(renderWorkFailures),
    experienceDiagnostics: Object.freeze(experienceDiagnostics),
    warnings: Object.freeze(warnings),
    nonAutoDiagnostics: Object.freeze(nonAutoDiagnostics),
  });
}
