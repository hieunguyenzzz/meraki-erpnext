import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useMyEmployee } from "@/hooks/useMyEmployee";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { isProfileIncomplete } from "@/lib/profile";
import { StatePanel } from "@/components/StatePanel";
import { CompletionBanner } from "./my-profile/CompletionBanner";
import { DisplayPreferencesCard } from "./my-profile/DisplayPreferencesCard";
import { WorkInfoCard } from "./my-profile/WorkInfoCard";
import { SectionCard } from "./my-profile/SectionCard";
import { AddressFields, BankFields, EmergencyFields, PersonalFields } from "./my-profile/ProfileSections";
import {
  INITIAL_FORM,
  REQUIRED_FIELDS,
  SECTIONS,
  buildSavePayload,
  formFromEmployee,
  isFormDirty,
  sectionMissing,
  type FormData,
  type SectionId,
} from "./my-profile/profileForm";

const SECTION_BODY = {
  personal: PersonalFields,
  address: AddressFields,
  emergency: EmergencyFields,
  bank: BankFields,
} satisfies Record<SectionId, typeof PersonalFields>;

function ProfileSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function MyProfilePage() {
  const { employee, employeeId, isLoading, refetch } = useMyEmployee();

  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (employee) setForm(formFromEmployee(employee));
  }, [employee]);

  const setField = useCallback((field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  const allRequiredFilled = REQUIRED_FIELDS.every((f) => form[f]?.trim());
  const doneSections = SECTIONS.filter((s) => sectionMissing(form, s.id) === 0).length;

  const savedComplete = useMemo(
    () => !!employee && !isProfileIncomplete(employee) && !isFormDirty(form, employee),
    [employee, form],
  );

  const handleSave = async () => {
    if (!employeeId || !allRequiredFilled || savingRef.current) return;
    savingRef.current = true;
    setAttempted(true);
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch("/inquiry-api/me/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSavePayload(form)),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Failed to save profile (${res.status})`);
      }
      setSaveSuccess(true);
      refetch();
    } catch (err) {
      console.error("my_profile_save_failed", err);
      setSaveError(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  };

  if (isLoading) return <ProfileSkeleton />;

  if (!employee) {
    return (
      <StatePanel
        kind="error"
        title="No employee record"
        text="No employee record found for your account. Please contact your administrator."
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold leading-tight md:font-display md:text-4xl md:leading-10">
          Welcome, {employee.employee_name}
        </h1>
        <Badge variant={employee.status === "Active" ? "default" : "secondary"}>{employee.status}</Badge>
      </header>

      <CompletionBanner doneSections={doneSections} totalSections={SECTIONS.length} saved={savedComplete} />

      {saveSuccess && (
        <div role="status" className="rounded-card bg-success-soft px-4 py-3 text-sm text-success-soft-foreground">
          Profile saved successfully.
        </div>
      )}

      <div className="grid items-start gap-4 md:grid-cols-2">
        <WorkInfoCard employee={employee} />
        <DisplayPreferencesCard />
        {SECTIONS.map((s, i) => {
          const Body = SECTION_BODY[s.id];
          return (
            <SectionCard key={s.id} step={i + 1} title={s.title} missing={sectionMissing(form, s.id)}>
              <Body form={form} setField={setField} showErrors={attempted} />
            </SectionCard>
          );
        })}
      </div>

      <div className="sticky bottom-[-20px] z-10 -mx-4 border-t bg-background/95 px-4 pb-3 pt-3 backdrop-blur md:static md:mx-0 md:flex md:items-center md:justify-end md:border-0 md:bg-transparent md:p-0 md:pb-8">
        {saveError && (
          <div role="alert" className="mb-2 rounded-card bg-danger-soft px-4 py-2 text-sm text-destructive md:mb-0 md:mr-4 md:self-center md:bg-transparent md:p-0">
            {saveError}
          </div>
        )}
        <Button className="h-14 w-full rounded-full text-base md:h-10 md:w-auto md:rounded-md md:text-sm" onClick={handleSave} disabled={!allRequiredFilled || isSaving}>
          {isSaving ? "Saving..." : "Save Profile"}
        </Button>
      </div>
    </div>
  );
}
