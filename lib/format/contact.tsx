import { Mail, MessageCircle, Phone } from "lucide-react";

/**
 * Contact deep-links: tap-to-call / WhatsApp / email affordances for a
 * phone-first PWA. Links only — no message-sending infrastructure.
 *
 * Saudi numbers are normalized to international form for the href while the
 * stored string is shown verbatim:
 *   05XXXXXXXX        -> +9665XXXXXXXX
 *   9665XXXXXXXX      -> +9665XXXXXXXX
 *   +9665XXXXXXXX     -> unchanged
 *   5XXXXXXXX (9 dig) -> +9665XXXXXXXX
 * Anything that doesn't look like a Saudi mobile is passed through digit-only.
 */
export function normalizeSaudiPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const hadPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (digits.startsWith("966")) return `+${digits}`;
  if (digits.startsWith("0")) return `+966${digits.slice(1)}`;
  if (digits.length === 9 && digits.startsWith("5")) return `+966${digits}`;
  return hadPlus ? `+${digits}` : digits;
}

/** Digits-only form WhatsApp expects in a wa.me path (no '+'). */
function waNumber(raw: string): string | null {
  const norm = normalizeSaudiPhone(raw);
  return norm ? norm.replace(/[^\d]/g, "") : null;
}

const ICON_LINK =
  "inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** Phone value + call/WhatsApp icon links. `print:hidden` on the icons only. */
export function PhoneLinks({ phone }: { phone: string | null | undefined }) {
  if (!phone) return <span className="text-sm font-medium">—</span>;
  const tel = normalizeSaudiPhone(phone);
  const wa = waNumber(phone);
  return (
    <span className="inline-flex items-center gap-1.5">
      <bdi className="text-sm font-medium" dir="ltr">
        {phone}
      </bdi>
      {tel ? (
        <span className="inline-flex items-center gap-0.5 print:hidden">
          <a href={`tel:${tel}`} className={ICON_LINK} aria-label={`اتصال بـ ${phone}`} title="اتصال">
            <Phone className="size-4" />
          </a>
          {wa ? (
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noopener noreferrer"
              className={ICON_LINK}
              aria-label={`واتساب ${phone}`}
              title="واتساب"
            >
              <MessageCircle className="size-4" />
            </a>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

/** Email value + mailto link. */
export function EmailLink({ email }: { email: string | null | undefined }) {
  if (!email) return <span className="text-sm font-medium">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <bdi className="text-sm font-medium" dir="ltr">
        {email}
      </bdi>
      <a
        href={`mailto:${email}`}
        className={`${ICON_LINK} print:hidden`}
        aria-label={`مراسلة ${email}`}
        title="بريد"
      >
        <Mail className="size-4" />
      </a>
    </span>
  );
}
