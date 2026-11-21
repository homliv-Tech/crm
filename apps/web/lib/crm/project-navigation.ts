import type { MouseEvent } from "react";
import { z } from "zod";

export function projectIdFromQuery(value: unknown): string | null {
  const result = z.uuid().safeParse(value);
  return result.success ? result.data.toLowerCase() : null;
}

export function projectHref(id: string) {
  return `/?project=${encodeURIComponent(id)}`;
}

export function activateProjectLink(
  event: MouseEvent<HTMLAnchorElement>,
  id: string,
  openProject: (id: string) => void,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    (event.currentTarget.target && event.currentTarget.target !== "_self") ||
    event.currentTarget.hasAttribute("download")
  )
    return;
  event.preventDefault();
  openProject(id);
}
