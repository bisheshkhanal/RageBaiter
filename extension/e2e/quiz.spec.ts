import { test, expect } from "@playwright/test";

test.describe("Quiz Flow E2E", () => {
  test("completes full quiz flow deterministically", async ({ page }) => {
    await page.goto("chrome-extension://test/sidepanel.html");

    await expect(page.getByTestId("quiz-start-button")).toBeVisible();

    await page.getByTestId("quiz-start-button").click();

    for (let i = 0; i < 18; i++) {
      await expect(page.getByTestId("quiz-question-text")).toBeVisible();

      await page.getByTestId("quiz-option-0.5").click();

      if (i < 17) {
        await page.getByTestId("quiz-next-button").click();
      } else {
        await page.getByTestId("quiz-complete-button").click();
      }
    }

    await expect(page.getByTestId("result-social-value")).toBeVisible();
    await expect(page.getByTestId("result-economic-value")).toBeVisible();
    await expect(page.getByTestId("result-populist-value")).toBeVisible();
  });

  test("uses skip to manual entry", async ({ page }) => {
    await page.goto("chrome-extension://test/sidepanel.html");

    await page.getByTestId("quiz-skip-intro-button").click();

    await expect(page.getByTestId("manual-social-input")).toBeVisible();

    await page.getByTestId("preset-center").click();

    await page.getByTestId("manual-submit-button").click();

    await expect(page.getByTestId("result-social-value")).toHaveText("0.00");
    await expect(page.getByTestId("result-economic-value")).toHaveText("0.00");
    await expect(page.getByTestId("result-populist-value")).toHaveText("0.00");
  });

  test("validates manual entry bounds", async ({ page }) => {
    await page.goto("chrome-extension://test/sidepanel.html");

    await page.getByTestId("quiz-skip-intro-button").click();

    await page.getByTestId("manual-social-input").fill("2");
    await page.getByTestId("manual-economic-input").fill("0");
    await page.getByTestId("manual-populist-input").fill("0");

    await page.getByTestId("manual-submit-button").click();

    await expect(page.getByTestId("manual-entry-errors")).toBeVisible();
  });

  test("allows retaking quiz from results", async ({ page }) => {
    await page.goto("chrome-extension://test/sidepanel.html");

    await page.getByTestId("quiz-skip-intro-button").click();
    await page.getByTestId("preset-progressive").click();
    await page.getByTestId("manual-submit-button").click();

    await expect(page.getByTestId("results-retake-button")).toBeVisible();

    await page.getByTestId("results-retake-button").click();

    await expect(page.getByTestId("quiz-question-text")).toBeVisible();
  });

  test("navigates previous and next through quiz", async ({ page }) => {
    await page.goto("chrome-extension://test/sidepanel.html");

    await page.getByTestId("quiz-start-button").click();

    await page.getByTestId("quiz-option-1").click();
    await page.getByTestId("quiz-next-button").click();

    await page.getByTestId("quiz-option--0.5").click();

    await page.getByTestId("quiz-prev-button").click();

    await expect(page.getByTestId("quiz-progress-text")).toHaveTextContent("Question 1 of 18");

    await page.getByTestId("quiz-next-button").click();
    await expect(page.getByTestId("quiz-progress-text")).toHaveTextContent("Question 2 of 18");
  });
});
