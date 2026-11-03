import { useRef } from "react";
import { accents, type Quotation } from "../../lib/quotation";
import Button from "../button";
import { Section, QuotationTextField } from "./fields";
import type { EditorProps } from "./types";

type Props = EditorProps & {
  update: (patch: Partial<Quotation>, id?: string) => void;
  setMessage: (message: string) => void;
};

export default function TermsBrandingStep({
  quote,
  update,
  errors,
  setMessage,
}: Props) {
  const logoInput = useRef<HTMLInputElement>(null);
  async function uploadLogo(file?: File) {
    if (!file) return;
    const quoteId = quote.id;
    if (
      !["image/png", "image/jpeg"].includes(file.type) ||
      file.size > 500000
    ) {
      setMessage("Choose a PNG or JPEG logo smaller than 500 KB.");
      return;
    }
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = reject;
        image.src = data;
      });
      update({ logo: data }, quoteId);
    } catch {
      setMessage(
        "This image could not be opened. Choose another PNG or JPEG logo.",
      );
    }
  }
  return (
    <>
      <Section title="Scope, exclusions & payment">
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="scope"
          label="Scope of work"
          placeholder="Areas covered, drawings referenced, materials and labour included, site supervision…"
          multiline
        />
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="exclusions"
          label="Exclusions & client responsibilities"
          placeholder="e.g. Approval fees, structural alterations, client-supplied fixtures, access and utilities…"
          multiline
        />
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="paymentTerms"
          label="Payment milestones"
          placeholder="Enter agreed milestones, amounts or percentages, and when each payment is due."
          multiline
        />
        <p className="text-xs text-stone-500">
          Define the scope and payment schedule for this project. No advance
          percentage or delivery commitment is assumed.
        </p>
      </Section>
      <Section title="Branding & additional details">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="text-xs font-medium text-stone-600">
              Business logo
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => logoInput.current?.click()}
            >
              {quote.logo ? "Replace logo" : "+ Upload your logo"}
            </Button>
            <input
              ref={logoInput}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              aria-label="Upload business logo"
              onChange={(e) => {
                void uploadLogo(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <span className="block text-xs text-stone-500">
              PNG or JPEG, up to 500 KB.
            </span>
            {quote.logo && (
              <Button variant="ghost" onClick={() => update({ logo: "" })}>
                Remove logo
              </Button>
            )}
          </div>
          <fieldset>
            <legend className="mb-3 text-xs font-medium text-stone-600">
              Document color
            </legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(accents).map(([name, color]) => (
                <label
                  key={name}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-stone-200 px-2 text-xs capitalize"
                >
                  <input
                    type="radio"
                    name="accent"
                    value={name}
                    checked={quote.accent === name}
                    onChange={() =>
                      update({
                        accent: name as Quotation["accent"],
                      })
                    }
                    className="h-4 w-4 accent-emerald-800"
                  />
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full"
                    style={{ background: color }}
                  />
                  {name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="notes"
          label="Notes"
          placeholder="A personal note for your client…"
          multiline
        />
        <QuotationTextField
          quote={quote}
          update={update}
          errors={errors}
          fieldKey="terms"
          label="Terms & conditions"
          placeholder="Quotation validity, variation approvals, warranties, and any other agreed conditions…"
          multiline
        />
      </Section>
    </>
  );
}
