/**
 * ZATCA (هيئة الزكاة والضريبة والجمارك) Phase-1 e-invoice QR payload.
 *
 * Per the FATOORA QR specification, a simplified tax invoice carries a QR code
 * whose content is Base64( TLV ) with the five Phase-1 tags:
 *   1 seller name · 2 seller VAT registration number · 3 invoice timestamp
 *   (ISO 8601) · 4 invoice total WITH VAT · 5 VAT amount.
 * Each field is [tag byte][length byte][UTF-8 value bytes]; lengths are BYTE
 * lengths (Arabic names are multi-byte!). Only rendered when the office has a
 * VAT number configured in «إعدادات المكتب» — no VAT registration, no QR.
 * Pure module; unit-tested with a byte-level round-trip.
 */

export type ZatcaInvoiceQr = {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601 timestamp of invoice generation. */
  timestamp: string;
  /** Invoice total including VAT. */
  total: number;
  /** VAT amount. */
  vatAmount: number;
};

function tlv(tag: number, value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  if (bytes.length > 255) throw new Error(`tlv_value_too_long: tag ${tag}`);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = tag;
  out[1] = bytes.length;
  out.set(bytes, 2);
  return out;
}

function money2(n: number): string {
  return n.toFixed(2);
}

/** Base64 TLV payload — the literal string content of the QR code. */
export function buildZatcaTlvBase64(input: ZatcaInvoiceQr): string {
  const parts = [
    tlv(1, input.sellerName),
    tlv(2, input.vatNumber),
    tlv(3, input.timestamp),
    tlv(4, money2(input.total)),
    tlv(5, money2(input.vatAmount)),
  ];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    buf.set(p, offset);
    offset += p.length;
  }
  return Buffer.from(buf).toString("base64");
}

/** Test helper: parse a Base64 TLV payload back into tag → value. */
export function parseZatcaTlvBase64(b64: string): Map<number, string> {
  const buf = Buffer.from(b64, "base64");
  const out = new Map<number, string>();
  let i = 0;
  const decoder = new TextDecoder();
  while (i + 2 <= buf.length) {
    const tag = buf[i];
    const len = buf[i + 1];
    out.set(tag, decoder.decode(buf.subarray(i + 2, i + 2 + len)));
    i += 2 + len;
  }
  return out;
}
