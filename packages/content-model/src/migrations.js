export const MIN_CONTENT_SCHEMA_VERSION = 1;
export const CONTENT_SCHEMA_VERSION = 2;

const clone = (value) => JSON.parse(JSON.stringify(value));

function versionIssue(schemaVersion) {
  return `schemaVersion ${String(schemaVersion)} wird nicht unterstützt; erwartet wird eine ganze Zahl von ${MIN_CONTENT_SCHEMA_VERSION} bis ${CONTENT_SCHEMA_VERSION}.`;
}

export function migrateContentDocument(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Das Content-Dokument muss ein Objekt sein.');
  }
  if (!Number.isInteger(input.schemaVersion)
    || input.schemaVersion < MIN_CONTENT_SCHEMA_VERSION
    || input.schemaVersion > CONTENT_SCHEMA_VERSION) {
    throw new TypeError(versionIssue(input.schemaVersion));
  }

  const migrated = clone(input);
  if (migrated.schemaVersion === 1) {
    migrated.schemaVersion = CONTENT_SCHEMA_VERSION;
    if (!Object.hasOwn(migrated, 'references')) migrated.references = [];
  }
  return migrated;
}
