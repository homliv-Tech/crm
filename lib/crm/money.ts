/** Split a USD total into opportunities without losing or inventing cents. */
export function splitOpportunityValues(value: number, count: number): string[] {
  const cents = Math.round(value * 100);
  return Array.from({ length: count }, (_, index) =>
    (
      (Math.floor(cents / count) + (index < cents % count ? 1 : 0)) /
      100
    ).toFixed(2),
  );
}
