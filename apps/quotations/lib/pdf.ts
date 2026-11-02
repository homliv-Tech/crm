import { pdf } from "@react-pdf/renderer";
import QuotationPdf, {
  registerQuotationFonts,
} from "../components/quotation-pdf";
import { exportErrors, type Quotation } from "./quotation";

const cache = new Map<string, Promise<Blob>>();
let renderQueue: Promise<unknown> = Promise.resolve();

export function getQuotationPdf(quote: Quotation): Promise<Blob> {
  const key = JSON.stringify(quote);
  const cached = cache.get(key);
  if (cached) return cached;
  const snapshot = structuredClone(quote);
  const rendering = renderQueue
    .catch(() => undefined)
    .then(async () => {
      registerQuotationFonts();
      return pdf(QuotationPdf({ quote: snapshot })).toBlob();
    });
  renderQueue = rendering;
  cache.set(key, rendering);
  while (cache.size > 2) cache.delete(cache.keys().next().value!);
  rendering.catch(() => {
    if (cache.get(key) === rendering) cache.delete(key);
  });
  return rendering;
}

export async function downloadPdf(quote: Quotation, prepared?: Blob) {
  const errors = exportErrors(quote);
  if (errors.length) throw new Error(errors.join(" "));
  const blob = prepared ?? (await getQuotationPdf(quote));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${quote.number.replace(/[^a-zA-Z0-9_-]/g, "_") || "quotation"}.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function openPdfForPrint(quote: Quotation, prepared?: Blob) {
  const errors = exportErrors(quote);
  if (errors.length) throw new Error(errors.join(" "));
  const tab = window.open("about:blank", "_blank");
  if (!tab)
    throw new Error(
      "Allow pop-ups to open the PDF for printing, or download the PDF and print it from your PDF viewer.",
    );
  tab.opener = null;
  tab.document.title = "Preparing quotation PDF";
  tab.document.body.textContent = "Preparing your quotation…";
  try {
    const url = URL.createObjectURL(prepared ?? (await getQuotationPdf(quote)));
    if (tab.closed) {
      URL.revokeObjectURL(url);
      return;
    }
    tab.location.replace(url);
    setTimeout(() => URL.revokeObjectURL(url), 300000);
  } catch (error) {
    tab.close();
    throw error;
  }
}
