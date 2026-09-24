export function divisionLabel(value) {
  const label = String(value || '').trim();
  return label || 'No division assigned';
}
