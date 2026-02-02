import { useState, useEffect, useCallback } from "react";
import { useUpdate } from "@refinedev/core";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

const REQUIRED_FIELDS = [
  "cell_phone",
  "personal_email",
  "current_address",
  "person_to_be_contacted",
  "emergency_phone_number",
  "bank_name",
  "bank_ac_no",
] as const;

type FormData = {
  first_name: string;
  middle_name: string;
  last_name: string;
  gender: string;
  date_of_birth: string;
  cell_phone: string;
  personal_email: string;
  current_address: string;
  permanent_address: string;
  person_to_be_contacted: string;
  relation: string;
  emergency_phone_number: string;
  bank_name: string;
  bank_ac_no: string;
  iban: string;
};

const INITIAL_FORM: FormData = {
  first_name: "",
  middle_name: "",
  last_name: "",
  gender: "",
  date_of_birth: "",
  cell_phone: "",
  personal_email: "",
  current_address: "",
  permanent_address: "",
  person_to_be_contacted: "",
  relation: "",
  emergency_phone_number: "",
  bank_name: "",
  bank_ac_no: "",
  iban: "",
};

export default function MyProfilePage() {
  const { employee, employeeId, isLoading, refetch } = useMyEmployee();
  const { mutateAsync: updateAsync } = useUpdate();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (employee) {
      setForm({
        first_name: employee.first_name ?? "",
        middle_name: employee.middle_name ?? "",
        last_name: employee.last_name ?? "",
        gender: employee.gender ?? "",
        date_of_birth: employee.date_of_birth ?? "",
        cell_phone: employee.cell_phone ?? "",
        personal_email: employee.personal_email ?? "",
        current_address: employee.current_address ?? "",
        permanent_address: employee.permanent_address ?? "",
        person_to_be_contacted: employee.person_to_be_contacted ?? "",
        relation: employee.relation ?? "",
        emergency_phone_number: employee.emergency_phone_number ?? "",
        bank_name: employee.bank_name ?? "",
        bank_ac_no: employee.bank_ac_no ?? "",
        iban: employee.iban ?? "",
      });
    }
  }, [employee]);

  const setField = useCallback((field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
  }, []);

  const isProfileIncomplete = REQUIRED_FIELDS.some((f) => !form[f]?.trim());

  const allRequiredFilled = REQUIRED_FIELDS.every((f) => form[f]?.trim());

  const handleSave = async () => {
    if (!employeeId || !allRequiredFilled) return;
    setIsSaving(true);
    try {
      await updateAsync({ resource: "Employee", id: employeeId, values: form });
      setSaveSuccess(true);
      refetch();
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-6 w-[60px] rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-[80px]" />
              <Skeleton className="h-5 w-[120px]" />
            </div>
          ))}
        </div>
        <Card>
          <CardHeader><Skeleton className="h-5 w-[160px]" /></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-[80px]" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="max-w-3xl mx-auto py-8">
        <p className="text-destructive">
          No employee record found for your account. Please contact your administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {isProfileIncomplete && (
        <div className="rounded-lg border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3 text-yellow-800 dark:text-yellow-400">
          Please complete your profile to get started. All required fields must be filled.
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30 px-4 py-3 text-green-800 dark:text-green-400">
          Profile saved successfully.
        </div>
      )}

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Welcome, {employee.employee_name}</h1>
        <Badge variant={employee.status === "Active" ? "default" : "secondary"}>
          {employee.status}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
        <div>
          <span className="text-muted-foreground">Employee ID</span>
          <p className="font-medium">{employee.name}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Department</span>
          <p className="font-medium">{employee.department}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Designation</span>
          <p className="font-medium">{employee.designation}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Date of Joining</span>
          <p className="font-medium">{employee.date_of_joining}</p>
        </div>
      </div>

      {/* Personal Info */}
      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="first_name">First Name *</Label>
              <Input
                id="first_name"
                value={form.first_name}
                onChange={(e) => setField("first_name", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="middle_name">Middle Name</Label>
              <Input
                id="middle_name"
                value={form.middle_name}
                onChange={(e) => setField("middle_name", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="last_name">Last Name</Label>
              <Input
                id="last_name"
                value={form.last_name}
                onChange={(e) => setField("last_name", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="gender">Gender</Label>
              <Select value={form.gender} onValueChange={(v) => setField("gender", v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="date_of_birth">Date of Birth</Label>
              <Input
                id="date_of_birth"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setField("date_of_birth", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cell_phone">Phone *</Label>
              <Input
                id="cell_phone"
                value={form.cell_phone}
                onChange={(e) => setField("cell_phone", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="personal_email">Personal Email *</Label>
              <Input
                id="personal_email"
                type="email"
                value={form.personal_email}
                onChange={(e) => setField("personal_email", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Address */}
      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="current_address">Current Address *</Label>
            <Textarea
              id="current_address"
              value={form.current_address}
              onChange={(e) => setField("current_address", e.target.value)}
              rows={3}
            />
          </div>
          <div>
            <Label htmlFor="permanent_address">Permanent Address</Label>
            <Textarea
              id="permanent_address"
              value={form.permanent_address}
              onChange={(e) => setField("permanent_address", e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Emergency Contact */}
      <Card>
        <CardHeader>
          <CardTitle>Emergency Contact</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="person_to_be_contacted">Contact Name *</Label>
              <Input
                id="person_to_be_contacted"
                value={form.person_to_be_contacted}
                onChange={(e) => setField("person_to_be_contacted", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="relation">Relationship</Label>
              <Input
                id="relation"
                value={form.relation}
                onChange={(e) => setField("relation", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="emergency_phone_number">Emergency Phone *</Label>
              <Input
                id="emergency_phone_number"
                value={form.emergency_phone_number}
                onChange={(e) => setField("emergency_phone_number", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bank Details */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="bank_name">Bank Name *</Label>
              <Input
                id="bank_name"
                value={form.bank_name}
                onChange={(e) => setField("bank_name", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="bank_ac_no">Account Number *</Label>
              <Input
                id="bank_ac_no"
                value={form.bank_ac_no}
                onChange={(e) => setField("bank_ac_no", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="iban">IBAN</Label>
              <Input
                id="iban"
                value={form.iban}
                onChange={(e) => setField("iban", e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={!allRequiredFilled || isSaving}>
          {isSaving ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}
