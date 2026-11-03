"use client";

import type { ReactElement } from "react";
import { ContextMenu } from "radix-ui";

export default function QuotationContextMenu({
  children,
  actions,
  disabled = false,
}: {
  children: ReactElement;
  actions: { label: string; onSelect: () => void; disabled?: boolean }[];
  disabled?: boolean;
}) {
  if (!actions.length) return children;
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        asChild
        disabled={disabled}
        onKeyDown={(event) => {
          if (
            !disabled &&
            (event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10"))
          ) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            event.currentTarget.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                cancelable: true,
                clientX: rect.left + 12,
                clientY: rect.top + 12,
              }),
            );
          }
        }}
      >
        {children}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Quotation actions"
          collisionPadding={8}
          className="z-[100] min-w-44 rounded-lg border border-stone-200 bg-white p-1 text-sm text-stone-900 shadow-lg"
        >
          {actions.map((action) => (
            <ContextMenu.Item
              key={action.label}
              disabled={action.disabled}
              onSelect={action.onSelect}
              className="cursor-default rounded px-3 py-2 text-red-700 outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-stone-100"
            >
              {action.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
