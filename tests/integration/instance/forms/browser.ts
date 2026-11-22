import { expect } from "bun:test";
import { answers } from "../../../../packages/features/forms/tests/fixtures";
import { buildCollection, installCollection } from "./collection";
import { blocId } from "./markup";
import type { connectBrowser } from "../oauth";
import type { mcpContainers } from "../containers";

export async function submitInBrowser(
    f: Awaited<ReturnType<typeof mcpContainers>>,
    connection: Awaited<ReturnType<typeof connectBrowser>>,
    formId: string,
) {
    const collection = await buildCollection();
    try {
        await installCollection(collection, f.repository, f.cmsUrl, f.administrator);
        const page = await connection.call("ulvia/cms.content", "pages.create", {
            path: "/forms-journey",
            title: "Forms journey",
            content: `<div cms-bloc="${blocId}"></div>`,
        });
        await connection.call("ulvia/cms.content", "pages.publish", {
            id: page.id,
            expectedRevision: page.revision,
            visible: true,
        });
        const browser = connection.browser;
        const context = await browser.newContext();
        try {
            const tab = await context.newPage();
            const attemptId = crypto.randomUUID();
            await tab.goto(
                `${f.cmsUrl}/forms-journey?ulvia-dtest--forms-kit--form-id=${formId}&ulvia-dtest--forms-kit--attempt-id=${attemptId}`,
            );
            await tab.getByRole("button", { name: "Send", exact: true }).waitFor();
            for (const [index, answer] of answers.entries()) {
                const control = tab.locator(
                    `[name="answers[${index}][${"optionIds" in answer ? "optionIds][]" : "boolean" in answer ? "boolean]" : "number" in answer ? "number]" : "text]"}"]`,
                );
                if ("optionIds" in answer) {
                    await control.selectOption([...answer.optionIds]);
                } else if ("boolean" in answer) {
                    await control.setChecked(answer.boolean);
                } else {
                    await control.fill(String("number" in answer ? answer.number : answer.text));
                }
            }
            const result = tab.waitForResponse(
                (response) => response.url().includes("forms.submit") || response.url().endsWith("/forms/submit"),
            );
            await tab.getByRole("button", { name: "Send", exact: true }).click();
            const response = await result;
            expect(response.status(), await response.text()).toBe(200);
            await tab.getByRole("status").filter({ hasText: "Sent" }).waitFor();
            return attemptId;
        } finally {
            await context.close();
        }
    } finally {
        await collection.close();
    }
}
