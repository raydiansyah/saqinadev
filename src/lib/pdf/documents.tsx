import { Text, View } from "@react-pdf/renderer";
import { Body, Frame, type PdfIssuer, s } from "./components";

/** Everything a file needs, already translated and formatted: the components only lay it out. */
export interface Labels {
  poweredBy: string;
  page: string;
}

export interface InvoiceFile {
  labels: Labels & {
    title: string;
    from: string;
    billedTo: string;
    project: string;
    issued: string;
    due: string;
    description: string;
    quantity: string;
    unitPrice: string;
    amount: string;
    total: string;
    paid: string;
    balance: string;
    notes: string;
    taxNumber: string;
  };
  issuer: PdfIssuer;
  number: string;
  title: string;
  project: string;
  client: { name: string; company: string | null; address: string | null } | null;
  issueDate: string;
  dueDate: string;
  items: { description: string; quantity: number; unit: string; amount: string }[];
  total: string;
  paid: string;
  balance: string;
  notes: string;
}

export function InvoicePdf(f: InvoiceFile) {
  const l = f.labels;
  return (
    <Frame
      issuer={f.issuer}
      reference={f.number}
      poweredBy={l.poweredBy}
      pageLabel={l.page}
      title={`${l.title} ${f.number}`}
    >
      <Text style={s.title}>{l.title}</Text>
      <Text style={s.sub}>{f.title}</Text>
      <View style={s.grid}>
        <View style={s.cell}>
          <Text style={s.label}>{l.from}</Text>
          <Text style={s.strong}>{f.issuer.name}</Text>
          {f.issuer.taxNumber ? <Text>{l.taxNumber}</Text> : null}
          {f.issuer.address ? <Text>{f.issuer.address}</Text> : null}
        </View>
        <View style={s.cell}>
          <Text style={s.label}>{l.billedTo}</Text>
          {f.client ? (
            <>
              <Text style={s.strong}>{f.client.name}</Text>
              {f.client.company ? <Text>{f.client.company}</Text> : null}
              {f.client.address ? <Text>{f.client.address}</Text> : null}
            </>
          ) : (
            <Text>-</Text>
          )}
        </View>
        <View style={s.cell}>
          <Text style={s.label}>{l.project}</Text>
          <Text>{f.project}</Text>
          <Text style={[s.label, { marginTop: 6 }]}>{l.issued}</Text>
          <Text>{f.issueDate}</Text>
          <Text style={[s.label, { marginTop: 6 }]}>{l.due}</Text>
          <Text>{f.dueDate}</Text>
        </View>
      </View>

      <View style={s.tableHead}>
        <Text style={{ flexGrow: 1, flexBasis: 0 }}>{l.description}</Text>
        <Text style={[{ width: 40 }, s.right]}>{l.quantity}</Text>
        <Text style={[{ width: 90 }, s.right]}>{l.unitPrice}</Text>
        <Text style={[{ width: 90 }, s.right]}>{l.amount}</Text>
      </View>
      {f.items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: invoice lines have no public id
        <View key={i} style={s.row} wrap={false}>
          <Text style={{ flexGrow: 1, flexBasis: 0 }}>{item.description}</Text>
          <Text style={[{ width: 40 }, s.right]}>{item.quantity}</Text>
          <Text style={[{ width: 90 }, s.right]}>{item.unit}</Text>
          <Text style={[{ width: 90 }, s.right]}>{item.amount}</Text>
        </View>
      ))}

      <View style={s.totals} wrap={false}>
        <View style={s.totalRow}>
          <Text>{l.total}</Text>
          <Text style={s.strong}>{f.total}</Text>
        </View>
        <View style={s.totalRow}>
          <Text>{l.paid}</Text>
          <Text>{f.paid}</Text>
        </View>
        <View
          style={[
            s.totalRow,
            { borderTopWidth: 1, borderTopColor: "#1f1b18", marginTop: 2, paddingTop: 4 },
          ]}
        >
          <Text style={s.strong}>{l.balance}</Text>
          <Text style={s.strong}>{f.balance}</Text>
        </View>
      </View>

      {f.notes ? (
        <View style={{ marginTop: 16 }}>
          <Text style={s.label}>{l.notes}</Text>
          <Text>{f.notes}</Text>
        </View>
      ) : null}
    </Frame>
  );
}

export interface ReceiptFile {
  labels: Labels & {
    title: string;
    receivedFrom: string;
    amount: string;
    inWords: string;
    forPayment: string;
    paidOn: string;
    method: string;
    reference: string;
    issuedOn: string;
    issuedBy: string;
    voided: string;
  };
  issuer: PdfIssuer;
  number: string;
  voided: boolean;
  client: { name: string; company: string | null; address: string | null } | null;
  amount: string;
  words: string;
  invoice: string;
  project: string;
  paidAt: string;
  method: string;
  reference: string;
  issuedAt: string;
}

export function ReceiptPdf(f: ReceiptFile) {
  const l = f.labels;
  return (
    <Frame
      issuer={f.issuer}
      reference={f.number}
      poweredBy={l.poweredBy}
      pageLabel={l.page}
      title={`${l.title} ${f.number}`}
    >
      <Text style={s.title}>{l.title}</Text>
      {f.voided ? (
        <Text style={[s.strong, { color: "#b42318", marginBottom: 6 }]}>{l.voided}</Text>
      ) : null}
      <View style={{ marginTop: 10, marginBottom: 14 }}>
        <Text style={s.label}>{l.receivedFrom}</Text>
        {f.client ? (
          <>
            <Text style={s.strong}>{f.client.name}</Text>
            {f.client.company ? <Text>{f.client.company}</Text> : null}
            {f.client.address ? <Text>{f.client.address}</Text> : null}
          </>
        ) : (
          <Text>-</Text>
        )}
      </View>
      <View style={{ marginBottom: 14 }}>
        <Text style={s.label}>{l.amount}</Text>
        <Text style={{ fontFamily: "Courier", fontSize: 18 }}>{f.amount}</Text>
        <Text style={{ marginTop: 4 }}>
          <Text style={s.strong}>{l.inWords}: </Text>
          {f.words}
        </Text>
      </View>
      <View style={{ marginBottom: 14 }}>
        <Text style={s.label}>{l.forPayment}</Text>
        <Text>{f.invoice}</Text>
        <Text style={{ color: "#6b645e" }}>{f.project}</Text>
      </View>
      <View style={s.grid}>
        <View style={s.cell}>
          <Text style={s.label}>{l.paidOn}</Text>
          <Text>{f.paidAt}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.label}>{l.method}</Text>
          <Text>{f.method}</Text>
        </View>
        <View style={s.cell}>
          <Text style={s.label}>{l.reference}</Text>
          <Text style={s.mono}>{f.reference || "-"}</Text>
        </View>
      </View>
      <View style={{ marginTop: 24, flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: "#6b645e" }}>{l.issuedOn}</Text>
        <View style={{ textAlign: "right" }}>
          <Text style={s.label}>{l.issuedBy}</Text>
          <Text style={[s.strong, { marginTop: 28 }]}>{f.issuer.name}</Text>
        </View>
      </View>
    </Frame>
  );
}

export interface ContractFile {
  labels: Labels & {
    signatures: string;
    unsigned: string;
    party: { team: string; client: string };
  };
  issuer: PdfIssuer;
  title: string;
  reference: string | null;
  content: string;
  /** Already formatted: "Budi Santoso, 12 October 2026". */
  signatures: { party: "team" | "client"; line: string }[];
}

export function ContractPdf(f: ContractFile) {
  const l = f.labels;
  const parties = ["team", "client"] as const;
  return (
    <Frame
      issuer={f.issuer}
      reference={f.reference}
      poweredBy={l.poweredBy}
      pageLabel={l.page}
      title={f.title}
    >
      <Body source={f.content} />
      <View wrap={false} style={{ marginTop: 18 }}>
        <Text style={s.h3}>{l.signatures}</Text>
        {parties.map((party) => {
          const signed = f.signatures.find((x) => x.party === party);
          return (
            <View key={party} style={s.sign}>
              <Text style={s.label}>{l.party[party]}</Text>
              <Text style={signed ? s.strong : { color: "#6b645e" }}>
                {signed ? signed.line : l.unsigned}
              </Text>
            </View>
          );
        })}
      </View>
    </Frame>
  );
}
