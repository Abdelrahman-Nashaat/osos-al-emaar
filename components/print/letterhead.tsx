import type { OfficeSettings } from "@/lib/office/settings";

/**
 * Print-only letterhead shared by the invoice and quotation documents.
 * Reads «إعدادات المكتب» so the office controls its own identity. Rendered
 * inside a `hidden print:block` document container.
 */
export function PrintLetterhead({ office }: { office: OfficeSettings }) {
  const contact = [office.phone, office.email, office.website].filter(Boolean).join(" · ");
  const place = [office.address, office.city].filter(Boolean).join("، ");
  return (
    <header className="border-b-2 border-black pb-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xl font-bold">{office.office_name}</p>
          {office.office_name_en ? (
            <p className="text-sm text-neutral-600" dir="ltr">
              {office.office_name_en}
            </p>
          ) : null}
        </div>
        <div className="text-end text-xs leading-5 text-neutral-700">
          {office.cr_number ? <p>س.ت: <span dir="ltr">{office.cr_number}</span></p> : null}
          {office.vat_number ? (
            <p>الرقم الضريبي: <span dir="ltr">{office.vat_number}</span></p>
          ) : null}
          {place ? <p>{place}</p> : null}
          {contact ? <p dir="ltr">{contact}</p> : null}
        </div>
      </div>
    </header>
  );
}
