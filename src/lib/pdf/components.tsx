import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { type Block, type Inline, parseMarkdown } from "./markdown";

/**
 * The building blocks of the PDF files. Standard PDF fonts only (Helvetica), so there is nothing
 * to download and the output is the same everywhere; characters outside Latin-1 may not draw.
 * Text always goes in as text: nothing here parses HTML.
 */

export interface PdfIssuer {
  name: string;
  taxNumber: string | null;
  address: string | null;
  /** Brand name and logo while white label is open; null means the Saqina look. */
  brand: { name: string | null; logo: { data: Buffer; format: "png" | "jpg" } | null } | null;
}

const INK = "#1f1b18";
const MUTED = "#6b645e";
const LINE = "#d9d3cc";

export const s = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
    fontSize: 10,
    color: INK,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 12,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  logo: { height: 34, maxWidth: 140, objectFit: "contain" },
  brandName: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  issuerBlock: { marginTop: 6, color: MUTED, fontSize: 9 },
  headRight: { textAlign: "right", color: MUTED, fontSize: 9 },
  ref: { fontFamily: "Courier", color: INK, fontSize: 10 },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { color: MUTED, marginBottom: 14 },
  label: { color: MUTED, fontSize: 8, marginBottom: 2, textTransform: "uppercase" },
  strong: { fontFamily: "Helvetica-Bold" },
  grid: { flexDirection: "row", gap: 24, marginBottom: 14 },
  cell: { flexGrow: 1, flexBasis: 0 },
  mono: { fontFamily: "Courier" },
  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 4,
    color: MUTED,
    fontSize: 8,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: LINE,
  },
  right: { textAlign: "right" },
  totals: { marginTop: 10, marginLeft: "auto", width: 200 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  footer: {
    position: "absolute",
    left: 44,
    right: 44,
    bottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    color: MUTED,
    fontSize: 8,
  },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4 },
  h3: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 8, marginBottom: 3 },
  p: { marginBottom: 6 },
  li: { flexDirection: "row", marginBottom: 2 },
  liMark: { width: 16 },
  quote: {
    marginBottom: 6,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: LINE,
    color: MUTED,
  },
  rule: { borderBottomWidth: 1, borderBottomColor: LINE, marginVertical: 8 },
  sign: { marginTop: 14, borderWidth: 1, borderColor: LINE, padding: 8, marginBottom: 6 },
});

const spans = (inlines: Inline[]) =>
  inlines.map((i, n) => (
    <Text
      // biome-ignore lint/suspicious/noArrayIndexKey: inline runs have no id
      key={n}
      style={{
        fontFamily: i.bold ? "Helvetica-Bold" : i.italic ? "Helvetica-Oblique" : "Helvetica",
      }}
    >
      {i.text}
    </Text>
  ));

/** The head of every file: the agency's mark and issuer lines, or Saqina's, and the reference. */
function Head({
  issuer,
  reference,
  poweredBy,
}: {
  issuer: PdfIssuer;
  reference: string | null;
  poweredBy: string;
}) {
  const branded = issuer.brand !== null;
  return (
    <View style={s.head}>
      <View>
        {issuer.brand?.logo ? <Image src={issuer.brand.logo} style={s.logo} /> : null}
        <Text style={s.brandName}>{branded ? (issuer.brand?.name ?? "") : "saqina.dev"}</Text>
        {branded ? (
          <View style={s.issuerBlock}>
            <Text style={s.strong}>{issuer.name}</Text>
            {issuer.taxNumber ? <Text>{issuer.taxNumber}</Text> : null}
            {issuer.address ? <Text>{issuer.address}</Text> : null}
          </View>
        ) : null}
      </View>
      <View style={s.headRight}>
        {reference ? <Text style={s.ref}>{reference}</Text> : null}
        {branded ? <Text>{poweredBy}</Text> : null}
      </View>
    </View>
  );
}

/** One A4 file: head, content, page numbers. */
export function Frame({
  issuer,
  reference,
  poweredBy,
  pageLabel,
  title,
  children,
}: {
  issuer: PdfIssuer;
  reference: string | null;
  poweredBy: string;
  /** "Page" in the file's language. */
  pageLabel: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Document title={title} author={issuer.name} creator="Saqina Dev" producer="Saqina Dev">
      <Page size="A4" style={s.page}>
        <Head issuer={issuer} reference={reference} poweredBy={poweredBy} />
        {children}
        <View style={s.footer} fixed>
          <Text>{issuer.brand ? poweredBy : "Saqina Dev"}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `${pageLabel} ${pageNumber}/${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}

/** A contract's text: the Markdown the two parties signed, laid out as blocks. */
export function Body({ source }: { source: string }) {
  const blocks: Block[] = parseMarkdown(source);
  return (
    <View>
      {blocks.map((b, n) => {
        const key = `block-${n}`;
        if (b.type === "heading")
          return (
            <Text key={key} style={b.level === 1 ? s.h1 : b.level === 2 ? s.h2 : s.h3}>
              {spans(b.inlines)}
            </Text>
          );
        if (b.type === "paragraph")
          return (
            <Text key={key} style={s.p}>
              {spans(b.inlines)}
            </Text>
          );
        if (b.type === "quote")
          return (
            <Text key={key} style={s.quote}>
              {spans(b.inlines)}
            </Text>
          );
        if (b.type === "rule") return <View key={key} style={s.rule} />;
        if (b.type === "list")
          return (
            <View key={key} style={s.p}>
              {b.items.map((item, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: list items have no id
                <View key={i} style={s.li} wrap={false}>
                  <Text style={s.liMark}>{b.ordered ? `${i + 1}.` : "-"}</Text>
                  <Text style={{ flex: 1 }}>{spans(item)}</Text>
                </View>
              ))}
            </View>
          );
        return (
          <View key={key} style={s.p}>
            {b.rows.map((row, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: table rows have no id
              <View key={r} style={s.row} wrap={false}>
                {row.map((cell, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: table cells have no id
                  <Text key={c} style={[s.cell, r === 0 ? s.strong : {}]}>
                    {cell}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}
