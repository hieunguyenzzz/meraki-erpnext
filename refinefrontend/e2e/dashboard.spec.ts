import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Welcome,")).toBeVisible({
    timeout: 15_000,
  });
});

test("renders welcome heading and 2 stat cards", async ({ page }) => {
  const main = page.getByRole("main");
  await expect(main.getByText("Active Leads")).toBeVisible({ timeout: 15_000 });
  await expect(main.getByText("Active Employees")).toBeVisible();
});

test("stat values load (not skeleton)", async ({ page }) => {
  await expect(page.getByText("Active Leads")).toBeVisible({ timeout: 15_000 });
  // The skeleton placeholder should disappear once data loads
  const values = page.locator('[class*="text-2xl"]');
  await expect(values.first()).toBeVisible({ timeout: 15_000 });
});

test("upcoming interviews card hidden for user with no interviews", async ({ page }) => {
  // Administrator has no interviews assigned, so card should not appear
  // Wait for data to load first (stat values visible means API calls finished)
  const values = page.locator('[class*="text-2xl"]');
  await expect(values.first()).toBeVisible({ timeout: 15_000 });

  // Give the interviews data time to resolve (interviewer details fetch)
  await page.waitForTimeout(3_000);

  await expect(page.getByText("My Upcoming Interviews")).not.toBeVisible();
});

test("upcoming interviews card has View all link to interviews page", async ({ page }) => {
  // Create a temporary interview assigned to Administrator to test the card
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().slice(0, 10);

  // Need a job applicant — find one
  const applicantRes = await page.request.get(
    "/api/resource/Job Applicant?limit_page_length=1&fields=[\"name\"]",
  );
  const applicantData = await applicantRes.json();
  if (applicantData.data.length === 0) {
    test.skip(true, "No job applicants exist");
    return;
  }
  const applicantId = applicantData.data[0].name;

  // Ensure an Interview Round exists
  const roundRes = await page.request.get(
    "/api/resource/Interview Round?limit_page_length=1&fields=[\"name\"]",
  );
  const roundData = await roundRes.json();
  const roundName = roundData.data[0]?.name ?? "General Interview";

  // Create interview assigned to Administrator
  const createRes = await page.request.post("/api/resource/Interview", {
    data: {
      interview_round: roundName,
      job_applicant: applicantId,
      scheduled_on: dateStr,
      from_time: "14:00:00",
      to_time: "15:00:00",
      status: "Pending",
      interview_details: [{ interviewer: "Administrator" }],
    },
  });
  const created = await createRes.json();
  const interviewName = created.data.name;

  try {
    // Reload dashboard
    await page.goto("/");
    await expect(page.getByText("Welcome,")).toBeVisible({ timeout: 15_000 });

    // Card should now appear
    await expect(page.getByText("My Upcoming Interviews")).toBeVisible({ timeout: 15_000 });
    const viewAllLink = page.getByRole("link", { name: "View all" });
    await expect(viewAllLink).toBeVisible();
    await expect(viewAllLink).toHaveAttribute("href", /\/hr\/recruiting\/interviews/);
  } finally {
    // Cleanup
    await page.request.delete(`/api/resource/Interview/${interviewName}`);
  }
});
