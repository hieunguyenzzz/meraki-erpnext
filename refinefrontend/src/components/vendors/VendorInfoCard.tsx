import type { ReactNode } from "react";
import { Globe, Mail, Phone, User } from "lucide-react";
import { telHref } from "@/lib/phone";
import { websiteHref } from "@/lib/vendor";

interface Props {
  contact?: string;
  phone?: string;
  email?: string;
  website?: string;
  weddingsCount: number;
}

const linkCls = "inline-flex min-h-[44px] min-w-0 items-center break-all text-primary hover:underline md:min-h-0";

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground" aria-hidden title={label}>{icon}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

export function VendorInfoCard({ contact, phone, email, website, weddingsCount }: Props) {
  const tel = telHref(phone);
  const has = contact || phone || email || website;
  return (
    <div className="space-y-2 rounded-2xl border bg-card p-5">
      <p className="mb-3 text-[17px] font-semibold">Contact</p>
      {!has && <p className="text-sm text-muted-foreground">No contact information recorded yet.</p>}
      {contact && <Row icon={<User className="h-4 w-4" />} label="Contact person">{contact}</Row>}
      {phone && (
        <Row icon={<Phone className="h-4 w-4" />} label="Phone">
          {tel ? <a href={tel} className={linkCls}>{phone}</a> : phone}
        </Row>
      )}
      {email && (
        <Row icon={<Mail className="h-4 w-4" />} label="Email">
          <a href={`mailto:${email}`} className={linkCls}>{email}</a>
        </Row>
      )}
      {website && (
        <Row icon={<Globe className="h-4 w-4" />} label="Website">
          <a href={websiteHref(website)} target="_blank" rel="noopener noreferrer" className={linkCls}>{website}</a>
        </Row>
      )}
      <div className="border-t pt-3 text-sm text-muted-foreground">
        <span className="font-semibold tabular-nums text-foreground">{weddingsCount}</span>{" "}
        {weddingsCount === 1 ? "wedding" : "weddings"}
      </div>
    </div>
  );
}
