import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/hr/recruiting/interviews");
  await expect(page.getByRole("heading", { name: "Interview Scheduling" })).toBeVisible({
    timeout: 15_000,
  });
});

test("renders page heading and navigation links", async ({ page }) => {
  await expect(page.getByText("Pipeline")).toBeVisible();
  await expect(page.getByText("CV Inbox")).toBeVisible();
});

test("date selector and schedule table visible", async ({ page }) => {
  await expect(page.locator('input[type="date"]').first()).toBeVisible();
  await expect(page.getByText("Schedule", { exact: true })).toBeVisible();
});

test("schedule form has candidate, date, time, and interviewer fields", async ({ page }) => {
  await expect(page.getByText("Schedule New Interview")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("Candidate")).toBeVisible();
  await expect(page.locator("#interview-date")).toBeVisible();
  await expect(page.getByLabel("Start Time")).toBeVisible();
  await expect(page.getByLabel("End Time")).toBeVisible();
  await expect(page.getByLabel("Interviewer")).toBeVisible();
});

test("schedule button is disabled when form is empty", async ({ page }) => {
  const btn = page.getByRole("button", { name: "Schedule Interview" });
  await expect(btn).toBeVisible();
  await expect(btn).toBeDisabled();
});

test("existing interviews appear in the day table", async ({ page }) => {
  // There are 2 pending interviews on 2026-02-03
  // Navigate to that date
  const dateInput = page.locator('input[type="date"]').first();
  await dateInput.fill("2026-02-03");

  // Wait for table rows to appear
  const table = page.locator("table");
  await expect(table).toBeVisible({ timeout: 15_000 });

  // Should show Pending badges
  await expect(table.getByText("Pending").first()).toBeVisible({ timeout: 15_000 });
});

test("scheduling an interview shows success and creates Communication", async ({ page }) => {
  // Fill the form
  const candidateSelect = page.getByLabel("Candidate");
  await expect(candidateSelect).toBeVisible({ timeout: 15_000 });

  // Wait for data to load — the form should be fully rendered
  await expect(page.getByLabel("Interviewer")).toBeVisible({ timeout: 15_000 });
  // Allow time for candidate list to populate from API
  await page.waitForTimeout(3_000);

  const candidateOptions = await candidateSelect.locator("option").all();
  if (candidateOptions.length <= 1) {
    test.skip(true, "No available candidates in Interview stage");
    return;
  }
  // Select the first real candidate
  const firstCandidateValue = await candidateOptions[1].getAttribute("value");
  await candidateSelect.selectOption(firstCandidateValue!);

  // Set date to tomorrow to avoid conflicts
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);
  await page.locator("#interview-date").fill(dateStr);

  // Pick a time slot unlikely to conflict
  await page.getByLabel("Start Time").selectOption("15:00");

  // Select interviewer
  const interviewerSelect = page.getByLabel("Interviewer");
  await expect(interviewerSelect.locator("option")).not.toHaveCount(1, { timeout: 15_000 });
  const interviewerOptions = await interviewerSelect.locator("option").all();
  const firstInterviewerValue = await interviewerOptions[1].getAttribute("value");
  await interviewerSelect.selectOption(firstInterviewerValue!);

  // Submit
  const btn = page.getByRole("button", { name: "Schedule Interview" });
  await expect(btn).toBeEnabled();
  await btn.click();

  // Wait for success message
  await expect(page.getByText("Interview scheduled successfully")).toBeVisible({
    timeout: 15_000,
  });

  // Verify Communication doc was created (email notification)
  const commResponse = await page.request.get(
    "/api/resource/Communication?filters=" +
      encodeURIComponent(
        JSON.stringify([
          ["reference_doctype", "=", "Interview"],
          ["communication_type", "=", "Notification"],
        ]),
      ) +
      "&order_by=creation desc&limit_page_length=1",
  );
  const commData = await commResponse.json();
  expect(commData.data.length).toBeGreaterThanOrEqual(1);
  const comm = commData.data[0];
  expect(comm.communication_medium).toBe("Email");

  // Cleanup: delete the interview we just created
  const ivResponse = await page.request.get(
    "/api/resource/Interview?filters=" +
      encodeURIComponent(
        JSON.stringify([["scheduled_on", "=", dateStr], ["status", "=", "Pending"]]),
      ) +
      "&order_by=creation desc&limit_page_length=1",
  );
  const ivData = await ivResponse.json();
  if (ivData.data.length > 0) {
    await page.request.delete(`/api/resource/Interview/${ivData.data[0].name}`);
  }
  // Cleanup the Communication
  if (commData.data.length > 0) {
    await page.request.delete(`/api/resource/Communication/${commData.data[0].name}`);
  }
});
