import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VENDOR_CATEGORIES, type VendorFormValue } from "@/lib/vendor";

interface Props {
  idPrefix: string;
  value: VendorFormValue;
  onChange: (v: VendorFormValue) => void;
}

/** Fields shared by the Add and Edit vendor sheets. */
export function VendorFormFields({ idPrefix, value, onChange }: Props) {
  const set = (k: keyof VendorFormValue) => (e: { target: { value: string } }) =>
    onChange({ ...value, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>
          Vendor Name <span className="text-destructive">*</span>
        </Label>
        <Input id={`${idPrefix}-name`} value={value.name} onChange={set("name")} placeholder="e.g. Studio ABC Photography" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-category`}>Category</Label>
        <Select
          value={value.category || "__none__"}
          onValueChange={(v) => onChange({ ...value, category: v === "__none__" ? "" : v })}
        >
          <SelectTrigger id={`${idPrefix}-category`}>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">-- None --</SelectItem>
            {VENDOR_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-contact`}>Contact Person</Label>
        <Input id={`${idPrefix}-contact`} value={value.contact} onChange={set("contact")} placeholder="e.g. Nguyen Van A" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-phone`}>Phone</Label>
        <Input id={`${idPrefix}-phone`} type="tel" value={value.phone} onChange={set("phone")} placeholder="e.g. 0912 345 678" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-email`}>Email</Label>
        <Input id={`${idPrefix}-email`} type="email" value={value.email} onChange={set("email")} placeholder="e.g. info@studio.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-website`}>Website</Label>
        <Input id={`${idPrefix}-website`} value={value.website} onChange={set("website")} placeholder="e.g. https://studio.com" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
        <Textarea id={`${idPrefix}-notes`} value={value.notes} onChange={set("notes")} placeholder="Additional notes about this vendor..." rows={3} />
      </div>
    </div>
  );
}
