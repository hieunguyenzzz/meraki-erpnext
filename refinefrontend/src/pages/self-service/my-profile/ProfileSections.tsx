import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "./Field";
import type { FormData, SetField } from "./profileForm";

interface Props {
  form: FormData;
  setField: SetField;
  showErrors: boolean;
}

export function PersonalFields({ form, setField, showErrors }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field id="first_name" label="First Name *" form={form} setField={setField} showErrors={showErrors} />
        <Field id="last_name" label="Last Name" form={form} setField={setField} showErrors={showErrors} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <Label htmlFor="gender">Gender</Label>
          <Select value={form.gender} onValueChange={(v) => setField("gender", v)}>
            <SelectTrigger id="gender">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Male">Male</SelectItem>
              <SelectItem value="Female">Female</SelectItem>
              <SelectItem value="Other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Field id="date_of_birth" label="Date of Birth" type="date" form={form} setField={setField} showErrors={showErrors} />
        <Field id="cell_number" label="Phone *" inputMode="tel" form={form} setField={setField} showErrors={showErrors} required />
        <Field id="personal_email" label="Personal Email *" type="email" inputMode="email" form={form} setField={setField} showErrors={showErrors} required />
      </div>
    </div>
  );
}

export function AddressFields({ form, setField, showErrors }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field id="addr_street" label="Số nhà / Đường *" placeholder="VD: 12 Nguyễn Huệ" form={form} setField={setField} showErrors={showErrors} required />
      <Field id="addr_ward" label="Phường / Xã *" placeholder="VD: Phường Bến Nghé" form={form} setField={setField} showErrors={showErrors} required />
      <Field id="addr_district" label="Quận / Huyện *" placeholder="VD: Quận 1" form={form} setField={setField} showErrors={showErrors} required />
      <Field id="addr_province" label="Tỉnh / Thành phố *" placeholder="VD: TP. Hồ Chí Minh" form={form} setField={setField} showErrors={showErrors} required />
    </div>
  );
}

export function EmergencyFields({ form, setField, showErrors }: Props) {
  return (
    <div className="grid gap-4">
      <Field id="person_to_be_contacted" label="Contact Name *" form={form} setField={setField} showErrors={showErrors} required />
      <Field id="relation" label="Relationship" form={form} setField={setField} showErrors={showErrors} />
      <Field id="emergency_phone_number" label="Emergency Phone *" inputMode="tel" form={form} setField={setField} showErrors={showErrors} required />
    </div>
  );
}

export function BankFields({ form, setField, showErrors }: Props) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <Field id="bank_name" label="Bank Name *" form={form} setField={setField} showErrors={showErrors} required />
        <Field id="bank_ac_no" label="Account Number *" inputMode="numeric" form={form} setField={setField} showErrors={showErrors} required />
      </div>
      <p className="text-xs text-muted-foreground">HR uses these details for your payroll.</p>
    </div>
  );
}
