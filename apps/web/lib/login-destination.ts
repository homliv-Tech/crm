// Only fixed local destinations and a validated connection challenge are accepted.
export function loginDestination(value: unknown) {
  if (typeof value !== "string") return "/";
  if (["/quotations", "/quotations/connect"].includes(value)) return value;
  if (/^\/quotations\/connect\?challenge=[A-Za-z0-9_-]{43}$/.test(value))
    return value;
  return "/";
}
