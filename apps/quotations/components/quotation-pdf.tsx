import { Fragment } from "react";
import {
  Document,
  Page,
  Text,
  View,
  Image as PdfImage,
  Font,
  StyleSheet,
} from "@react-pdf/renderer";
import {
  accents,
  amountInWords,
  calculate,
  formatDate,
  groupedItems,
  money,
  summaryRows,
  type LineItem,
  type Quotation,
} from "../lib/quotation";

let registered = false;
export function registerQuotationFonts(root = "/fonts") {
  if (registered) return;
  Font.register({
    family: "QuotationSans",
    fonts: [
      { src: `${root}/NotoSans-Regular.ttf`, fontWeight: 400 },
      { src: `${root}/NotoSans-Bold.ttf`, fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

const s = StyleSheet.create({
  page: {
    fontFamily: "QuotationSans",
    fontSize: 9,
    color: "#292524",
    paddingTop: 28,
    paddingHorizontal: 28,
    paddingBottom: 54,
    backgroundColor: "#ffffff",
  },
  accent: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  header: { flexDirection: "row", justifyContent: "space-between", gap: 24 },
  firm: { width: "55%" },
  logo: {
    width: 120,
    height: 42,
    objectFit: "contain",
    objectPosition: "left",
    marginBottom: 12,
  },
  firmName: { fontSize: 14, fontWeight: 700, marginBottom: 5 },
  muted: { color: "#57534e", fontSize: 9, lineHeight: 1.55 },
  metadata: { width: "40%", textAlign: "right" },
  title: { fontSize: 16, fontWeight: 700, lineHeight: 1.25 },
  dates: { marginTop: 12, fontSize: 9, color: "#57534e", lineHeight: 1.9 },
  client: {
    borderTopWidth: 0.7,
    borderBottomWidth: 0.7,
    borderColor: "#e7e5e4",
    paddingVertical: 15,
    marginVertical: 21,
  },
  eyebrow: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1.1,
    color: "#78716c",
    marginBottom: 5,
  },
  bold: { fontWeight: 700 },
  project: {
    backgroundColor: "#fafaf9",
    borderRadius: 6,
    padding: 12,
    marginBottom: 18,
  },
  projectLine: { marginTop: 6 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  room: {
    fontSize: 11,
    fontWeight: 700,
    marginBottom: 6,
    borderBottomWidth: 0.7,
    borderColor: "#e7e5e4",
    paddingBottom: 6,
  },
  columns: {
    flexDirection: "row",
    borderBottomWidth: 0.7,
    borderColor: "#e7e5e4",
    paddingBottom: 8,
    marginBottom: 3,
  },
  colName: { width: "40%", paddingRight: 8 },
  colQty: { width: "14%", textAlign: "right" },
  colMoney: { width: "23%", textAlign: "right", paddingLeft: 8 },
  tableLabel: { fontSize: 7.5, color: "#78716c" },
  priceRow: {
    flexDirection: "row",
    paddingTop: 9,
    paddingBottom: 8,
    borderTopWidth: 0.5,
    borderColor: "#f5f5f4",
  },
  tiny: { fontSize: 7.5, color: "#78716c" },
  specTitle: { fontWeight: 700, marginTop: 10, marginBottom: 3 },
  bullet: { flexDirection: "row", paddingLeft: 3, marginBottom: 2 },
  bulletDot: { width: 10, color: "#57534e" },
  bulletText: { flex: 1, color: "#57534e" },
  changes: {
    backgroundColor: "#ecfdf5",
    borderLeftWidth: 2,
    borderLeftColor: "#047857",
    borderRadius: 4,
    padding: 9,
    marginTop: 10,
  },
  summary: { width: "65%", alignSelf: "flex-end", marginTop: 18 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 14,
    marginBottom: 7,
  },
  summaryLabel: { flex: 1, color: "#57534e" },
  total: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    padding: 12,
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 12,
    marginTop: 2,
  },
  words: { fontSize: 9, fontWeight: 700, textAlign: "right", marginTop: 7 },
  endSection: {
    borderTopWidth: 0.7,
    borderColor: "#e7e5e4",
    marginTop: 24,
    paddingTop: 16,
  },
  noteTitle: { fontWeight: 700, marginBottom: 3 },
  footer: {
    position: "absolute",
    bottom: 17,
    left: 28,
    right: 28,
    borderTopWidth: 0.5,
    borderColor: "#e7e5e4",
    paddingTop: 6,
    color: "#78716c",
    fontSize: 7,
  },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
});

function ItemSpecs({ item }: { item: LineItem }) {
  return (
    <View style={{ marginBottom: 15 }}>
      {item.description && (
        <Text style={s.muted} orphans={2} widows={2}>
          {item.description}
        </Text>
      )}
      {item.specifications
        .filter((spec) => spec.heading || spec.body)
        .map((spec) => (
          <View key={spec.id}>
            {spec.heading && (
              <Text style={s.specTitle} minPresenceAhead={28}>
                {spec.heading}
              </Text>
            )}
            {spec.body
              .split("\n")
              .filter((line) => line.trim())
              .map((line, i) => (
                <View key={i} style={s.bullet}>
                  <Text style={s.bulletDot}>•</Text>
                  <Text style={s.bulletText} orphans={2} widows={2}>
                    {line.replace(/^\s*[-•]\s*/, "")}
                  </Text>
                </View>
              ))}
          </View>
        ))}
      {item.changes && (
        <View style={s.changes}>
          <Text
            style={[s.bold, { color: "#065f46", marginBottom: 3 }]}
            minPresenceAhead={24}
          >
            Agreed changes / clarifications
          </Text>
          <Text orphans={2} widows={2}>
            {item.changes}
          </Text>
        </View>
      )}
    </View>
  );
}

function Scope({
  quote,
  items = quote.items,
}: {
  quote: Quotation;
  items?: LineItem[];
}) {
  const totals = calculate({
    ...quote,
    items,
    revision: null,
    discount: "0",
    shipping: "0",
  });
  return (
    <>
      {groupedItems(items).map((group) => (
        <Fragment key={group.room}>
          {group.room && (
            <Text style={s.room} minPresenceAhead={65}>
              {group.room}
            </Text>
          )}
          <View style={s.columns} wrap={false} minPresenceAhead={40}>
            <Text style={[s.colName, s.tableLabel]}>ITEM / PACKAGE</Text>
            <Text style={[s.colQty, s.tableLabel]}>QTY / UNIT</Text>
            <Text style={[s.colMoney, s.tableLabel]}>RATE</Text>
            <Text style={[s.colMoney, s.tableLabel]}>AMOUNT</Text>
          </View>
          {group.items.map(({ item, index, number }) => (
            <Fragment key={item.id}>
              <View
                style={s.priceRow}
                wrap={false}
                minPresenceAhead={
                  item.description || item.specifications.length ? 30 : 0
                }
              >
                <View style={s.colName}>
                  <Text style={s.tiny}>{item.section}</Text>
                  <Text style={[s.bold, { marginTop: 2 }]}>
                    {number}. {item.name || "Work item"}
                  </Text>
                  {item.sku && <Text style={s.tiny}>Ref: {item.sku}</Text>}
                  {Number(item.tax) > 0 && (
                    <Text style={s.tiny}>Tax: {item.tax}%</Text>
                  )}
                </View>
                <View style={s.colQty}>
                  <Text>{item.quantity || "0"}</Text>
                  <Text style={s.tiny}>{item.unit}</Text>
                </View>
                <Text style={s.colMoney}>
                  {money(item.rate || "0", quote.currency)}
                </Text>
                <Text style={s.colMoney}>
                  {money(totals.rows[index].amount, quote.currency)}
                </Text>
              </View>
              <ItemSpecs item={item} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </>
  );
}

export default function QuotationPdf({ quote }: { quote: Quotation }) {
  const accent = accents[quote.accent];
  const totals = calculate(quote);
  const words = amountInWords(totals.total, quote.currency);
  return (
    <Document
      title={`${quote.number} — ${quote.title || "Quotation"}`}
      author={quote.from.name || "Quotient"}
      language="en"
    >
      <Page size="A4" style={s.page} wrap>
        <View style={[s.accent, { backgroundColor: accent }]} fixed />
        <View style={s.header} wrap={false}>
          <View style={s.firm}>
            {quote.logo && <PdfImage src={quote.logo} style={s.logo} />}
            <Text style={[s.firmName, { color: accent }]}>
              {quote.from.name || "Your architecture firm"}
            </Text>
            {[
              quote.from.address,
              quote.from.email,
              quote.from.phone,
              quote.from.taxId && `Tax ID: ${quote.from.taxId}`,
            ]
              .filter(Boolean)
              .map((line, i) => (
                <Text key={i} style={s.muted}>
                  {line}
                </Text>
              ))}
          </View>
          <View style={s.metadata}>
            <Text style={[s.title, { color: accent }]}>
              {quote.revision ? "REVISED QUOTATION" : "QUOTATION"}
            </Text>
            <Text style={[s.muted, { marginTop: 3 }]}>
              {quote.number || "Quotation number"}
            </Text>
            <Text style={s.dates}>
              Issued: {formatDate(quote.issued)}
              {"\n"}Valid until: {formatDate(quote.validUntil)}
            </Text>
          </View>
        </View>
        <View style={s.client} wrap={false}>
          <Text style={s.eyebrow}>
            PREPARED FOR ·{" "}
            {quote.clientType === "Individual"
              ? "INDIVIDUAL / HOMEOWNER"
              : "COMPANY"}
          </Text>
          <Text style={[s.bold, { fontSize: 10, marginBottom: 3 }]}>
            {quote.to.name || "Client name"}
          </Text>
          {[
            quote.to.address,
            quote.to.email,
            quote.to.phone,
            quote.to.taxId && `Tax ID: ${quote.to.taxId}`,
          ]
            .filter(Boolean)
            .map((line, i) => (
              <Text key={i} style={s.muted}>
                {line}
              </Text>
            ))}
        </View>
        {quote.title && (
          <Text
            style={[s.bold, { fontSize: 11, marginBottom: 15 }]}
            minPresenceAhead={35}
          >
            {quote.title}
          </Text>
        )}
        <View style={s.project}>
          <Text style={s.bold} minPresenceAhead={20}>
            {quote.projectType} project
          </Text>
          {quote.siteAddress && (
            <Text style={s.projectLine}>
              <Text style={s.bold}>Site: </Text>
              {quote.siteAddress}
            </Text>
          )}
          {quote.timeline && (
            <Text style={s.projectLine}>
              <Text style={s.bold}>Schedule: </Text>
              {quote.timeline}
            </Text>
          )}
          {quote.scope && (
            <View style={s.projectLine}>
              <Text style={s.bold} minPresenceAhead={25}>
                Scope of work
              </Text>
              <Text style={s.muted} orphans={2} widows={2}>
                {quote.scope}
              </Text>
            </View>
          )}
        </View>
        {quote.revision && (
          <View>
            <Text style={s.sectionTitle} minPresenceAhead={65}>
              Original scope · {quote.revision.sourceNumber}
            </Text>
            <Text style={[s.muted, { marginBottom: 12 }]}>
              Reference specifications and pre-adjustment item rates. The
              previous final total is carried forward once in the summary.
            </Text>
            <Scope quote={quote} items={quote.revision.originalItems} />
            <Text style={s.sectionTitle} minPresenceAhead={65}>
              Additional work · Revision {quote.revision.sequence}
            </Text>
          </View>
        )}
        <Scope quote={quote} />
        <View style={s.summary} wrap={false}>
          {summaryRows(quote).map(([label, value]) => (
            <View key={label} style={s.summaryRow}>
              <Text style={s.summaryLabel}>{label}</Text>
              <Text>{value}</Text>
            </View>
          ))}
          <View
            style={[s.total, { backgroundColor: `${accent}0d`, color: accent }]}
          >
            <Text>
              {quote.revision ? "Revised total" : "Total"}{" "}
              <Text style={{ fontSize: 8, fontWeight: 400 }}>
                {quote.currency}
              </Text>
            </Text>
            <Text>{money(totals.total, quote.currency)}</Text>
          </View>
          {words && <Text style={[s.words, { color: accent }]}>{words}</Text>}
        </View>
        {quote.variationRates.length > 0 && (
          <View style={s.endSection}>
            <Text style={s.noteTitle} minPresenceAhead={45}>
              Rates for additional / changed work
            </Text>
            <Text style={[s.muted, { marginBottom: 10 }]}>
              Reference rates only; these are not included in this quotation
              total.
            </Text>
            {quote.variationRates.map((rate) => (
              <View key={rate.id} style={{ marginBottom: 10 }}>
                <Text style={s.bold} minPresenceAhead={25}>
                  {rate.name || "Additional work"} ·{" "}
                  {money(rate.rate || "0", quote.currency)} / {rate.unit}
                </Text>
                {rate.notes && <Text style={s.muted}>{rate.notes}</Text>}
              </View>
            ))}
          </View>
        )}
        {[
          ["Exclusions & client responsibilities", quote.exclusions],
          ["Payment milestones", quote.paymentTerms],
          ["Notes", quote.notes],
          ["Terms & conditions", quote.terms],
        ]
          .filter(([, value]) => value)
          .map(([label, value], i) => (
            <View
              key={label}
              style={i === 0 ? s.endSection : { marginTop: 15 }}
            >
              <Text style={s.noteTitle} minPresenceAhead={28}>
                {label}
              </Text>
              <Text style={s.muted} orphans={2} widows={2}>
                {value}
              </Text>
            </View>
          ))}
        <View style={s.footer} fixed>
          <View style={s.footerRow}>
            <Text style={{ maxWidth: "80%", maxLines: 1 }}>
              {quote.number} · {formatDate(quote.issued)} · {quote.to.name}
            </Text>
            <Text
              render={({ pageNumber, totalPages }) =>
                `${pageNumber} / ${totalPages}`
              }
            />
          </View>
          <Text style={{ marginTop: 2 }}>
            This is a quotation, not a tax invoice.
          </Text>
        </View>
      </Page>
    </Document>
  );
}
