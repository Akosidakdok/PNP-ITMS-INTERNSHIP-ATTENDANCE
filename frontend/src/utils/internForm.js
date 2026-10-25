// API records include joined display data and account metadata. Keep only the
// fields declared by the form so those extra values never enter save requests.
export function createInternFormValues(record, defaults) {
  return Object.fromEntries(
    Object.entries(defaults).map(([field, fallback]) => [field, record[field] ?? fallback])
  );
}
