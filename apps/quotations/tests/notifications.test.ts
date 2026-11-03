import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { toast as sonner } from "sonner";
import { toast } from "@crm/notifications/toast";

afterEach(() => sonner.dismiss());

test("a successful quotation save replaces its persistent error without clearing other quotations", () => {
  const id = "crm-save:quotation-a";
  toast.error("Could not save quotation A", "Try again.", id);
  const otherId = toast.error(
    "Could not save quotation B",
    "Try again.",
    "crm-save:quotation-b",
  );
  toast.error("Could not save quotation A", "Still offline.", id);
  assert.equal(sonner.getToasts().filter((item) => item.id === id).length, 1);

  toast.success("Quotation saved to CRM", "Quotation A", id);
  const active = sonner.getToasts();
  assert.equal(active.length, 2);
  const saved = active.find((item) => item.id === id);
  assert.ok(saved && "type" in saved);
  assert.equal(saved.type, "success");
  assert.equal(saved.title, "Quotation saved to CRM");
  assert.equal(saved.description, "Quotation A");
  assert.equal(saved.duration, 5000);
  const other = active.find((item) => item.id === otherId);
  assert.ok(other && "type" in other);
  assert.equal(other.type, "error");
  assert.equal(other.duration, Infinity);
});
