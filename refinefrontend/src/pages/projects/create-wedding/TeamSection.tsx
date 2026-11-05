import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { displayName } from "@/lib/format";
import { AddRowButton, Field, FormSection } from "./FormSection";
import { MAX_ASSISTANTS, type EmployeeOption, type FormData } from "./types";

interface Props {
  form: FormData;
  onChange: (updates: Partial<FormData>) => void;
  employees: EmployeeOption[];
}

export function TeamSection({ form, onChange, employees }: Props) {
  return (
    <FormSection title="Team">
      <Field label="Lead planner" htmlFor="lead-planner" required>
        <Select value={form.leadPlanner} onValueChange={(leadPlanner) => onChange({ leadPlanner })}>
          <SelectTrigger id="lead-planner">
            <SelectValue placeholder="Select lead planner" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((emp) => (
              <SelectItem key={emp.name} value={emp.name}>
                {displayName(emp)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Support planner" htmlFor="support-planner">
        <Select value={form.supportPlanner} onValueChange={(supportPlanner) => onChange({ supportPlanner })}>
          <SelectTrigger id="support-planner">
            <SelectValue placeholder="Select support planner (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {employees
              .filter((emp) => emp.name !== form.leadPlanner)
              .map((emp) => (
                <SelectItem key={emp.name} value={emp.name}>
                  {displayName(emp)}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>

      {form.assistants.map((asst, i) => (
        <Field key={i} label={`Assistant ${i + 1}`}>
          <div className="flex items-center gap-2">
            <Select
              value={asst}
              onValueChange={(v) => {
                const updated = [...form.assistants];
                updated[i] = v;
                onChange({ assistants: updated });
              }}
            >
              <SelectTrigger aria-label={`Assistant ${i + 1}`}>
                <SelectValue placeholder="Select assistant" />
              </SelectTrigger>
              <SelectContent>
                {employees
                  .filter(
                    (emp) =>
                      emp.name !== form.leadPlanner &&
                      emp.name !== form.supportPlanner &&
                      !form.assistants.some((a, j) => j !== i && a === emp.name)
                  )
                  .map((emp) => (
                    <SelectItem key={emp.name} value={emp.name}>
                      {displayName(emp)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label={`Remove assistant ${i + 1}`}
              onClick={() => onChange({ assistants: form.assistants.filter((_, j) => j !== i) })}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </Field>
      ))}
      {form.assistants.length < MAX_ASSISTANTS && (
        <AddRowButton label="Add assistant" onClick={() => onChange({ assistants: [...form.assistants, ""] })} />
      )}
    </FormSection>
  );
}
