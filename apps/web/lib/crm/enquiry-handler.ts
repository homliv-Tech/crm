import { createHash, timingSafeEqual, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { getDb } from "../db";
import {
  activities,
  companies,
  contacts,
  landingEnquiries,
} from "../db/schema";
import { landingEnquiryInput, type LandingEnquiry } from "./enquiry-input";
import { getApartmentTypeLabel, getBudgetRangeLabel } from "./enquiry-options";

const MAX_BYTES = 16_384;
const hash = (value: string) => createHash("sha256").update(value).digest();

export function createEnquiryHandler(deps: {
  secret: () => string | undefined;
  getDb: typeof getDb;
}) {
  return async function POST(request: Request): Promise<Response> {
    const respond = (body: object, status: number) =>
      Response.json(body, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    const secret = deps.secret();
    if (!secret || secret.length < 32)
      return respond({ error: "Enquiry integration is not configured." }, 503);
    const authorization = request.headers.get("authorization") ?? "";
    if (!timingSafeEqual(hash(authorization), hash(`Bearer ${secret}`)))
      return respond({ error: "Unauthorized." }, 401);
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      return respond({ error: "Use application/json." }, 415);

    let raw: unknown;
    try {
      const reader = request.body?.getReader();
      if (!reader) return respond({ error: "Invalid JSON." }, 400);
      const decoder = new TextDecoder();
      let text = "";
      let bytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > MAX_BYTES) {
            void reader.cancel().catch(() => {});
            return respond({ error: "Request is too large." }, 413);
          }
          text += decoder.decode(value, { stream: true });
        }
        raw = JSON.parse(text + decoder.decode());
      } finally {
        reader.releaseLock();
      }
    } catch {
      return respond({ error: "Invalid JSON." }, 400);
    }
    const parsed = landingEnquiryInput.safeParse(raw);
    if (!parsed.success)
      return respond(
        {
          error: "Invalid enquiry.",
          fields: parsed.error.flatten().fieldErrors,
        },
        400,
      );
    const input = parsed.data;

    try {
      const db = deps.getDb();
      const findExisting = async () =>
        (
          await db
            .select()
            .from(landingEnquiries)
            .where(eq(landingEnquiries.id, input.id))
            .limit(1)
        )[0];
      const replay = (
        saved: NonNullable<Awaited<ReturnType<typeof findExisting>>>,
      ) => {
        const original: LandingEnquiry = {
          id: saved.id,
          name: saved.name,
          email: saved.email,
          phone: saved.phone,
          address: saved.address,
          apartmentType: saved.apartmentType as LandingEnquiry["apartmentType"],
          budget: saved.budget as LandingEnquiry["budget"],
          message: saved.message,
          createdAt: saved.submittedAt.toISOString(),
        };
        if (
          Object.keys(original).some(
            (key) =>
              original[key as keyof LandingEnquiry] !==
              input[key as keyof LandingEnquiry],
          )
        )
          return respond(
            { error: "Enquiry ID already exists with different data." },
            409,
          );
        return respond(
          { id: saved.id, companyId: saved.companyId, duplicate: true },
          200,
        );
      };
      const existing = await findExisting();
      if (existing) return replay(existing);

      const companyId = randomUUID();
      const description = [
        "Source: Website enquiry",
        `Address: ${input.address}`,
        `Apartment type: ${getApartmentTypeLabel(input.apartmentType)}`,
        `Budget: ${getBudgetRangeLabel(input.budget)}`,
        `Submitted: ${input.createdAt}`,
        input.message && `Requirements: ${input.message}`,
      ]
        .filter(Boolean)
        .join("\n");
      const { createdAt, ...fields } = input;
      try {
        // Neon HTTP batch is atomic, including a losing concurrent delivery.
        await db.batch([
          db
            .insert(companies)
            .values({
              id: companyId,
              name: input.name,
              owner: "Unassigned",
              tags: ["Residential", "Enquiry"],
              description,
            }),
          db
            .insert(contacts)
            .values({
              companyId,
              name: input.name,
              email: input.email,
              phone: input.phone,
            }),
          db
            .insert(activities)
            .values({
              companyId,
              type: "Note",
              body: description,
              occurredAt: new Date(createdAt),
            }),
          db
            .insert(landingEnquiries)
            .values({ ...fields, companyId, submittedAt: new Date(createdAt) }),
        ]);
      } catch (error) {
        // A competing transaction may have committed the same enquiry UUID.
        const saved = await findExisting();
        if (saved) return replay(saved);
        throw error;
      }
      return respond({ id: input.id, companyId, duplicate: false }, 201);
    } catch {
      // Do not log submitted personal data, authorization headers, or DB errors.
      console.error("Landing enquiry import failed.");
      return respond({ error: "Could not import enquiry. Retry later." }, 503);
    }
  };
}
