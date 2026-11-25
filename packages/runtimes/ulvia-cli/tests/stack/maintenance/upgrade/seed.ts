import { database, until } from "./database";
import { expect } from "bun:test";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { repositoryApi } from "../../../../../../../tests/integration/instance/repository/client";
import { selectForms, formsCandidate } from "../../../../../../../tests/integration/instance/forms/selection";
import { signInForSetup, selectEmptySite } from "../../edgeSmoke/setup";
import type { UpgradeFixture } from "./fixture";
export async function seedHistorical(f: UpgradeFixture) {
    const administrator = JSON.parse(
        await readFile(join(f.paths.services, "credentials/control-administrator.json"), "utf8"),
    );
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await signInForSetup(page, { origin: f.origin, administrator });
        await page.getByRole("button", { name: "A Repository address", exact: false }).click();
        await page
            .getByLabel("Repository address", { exact: true })
            .fill(`http://repository.localhost:${new URL(f.origin).port}`);
        await page.getByRole("button", { name: "Use this Repository", exact: false }).click();
        await selectEmptySite(page);
    } finally {
        await browser.close();
    }
    const api = repositoryApi(f.origin),
        actor = await api.session(administrator.email, administrator.password);
    expect((await formsCandidate(f.origin, actor.cookie)).version).toBe("1.1.0");
    await selectForms(f.origin, actor.cookie);
    const call = async (path: string, input: unknown, method = "POST") => {
        const response = await api.request("ulvia/cms.forms", path, method, input, actor);
        expect(response.status, await response.clone().text()).toBe(200);
        return response.json();
    };
    const notification = {
        enabled: false,
        recipients: [{ email: "archive@example.test" }],
        subjectTemplate: "Contact",
        textTemplate: "{{submission.id}}",
        includeAnswers: true,
    };
    const draft = {
        title: "Historical contact",
        locale: "en",
        accessMode: "public",
        retentionDays: 7,
        fields: [{ id: "message", kind: "text", label: "Message", required: true }],
        notification,
        messages: { success: "Received", closed: "Closed" },
    };
    const formId = crypto.randomUUID(),
        attemptId = crypto.randomUUID();
    await call("/forms/create", { formId, draft });
    await call("/forms/publish", { formId, expectedRevision: 1 });
    await call("/forms/availability", { formId, expectedRevision: 2, availability: "open" }, "PUT");
    const submission = {
        formId,
        formVersion: 1,
        attemptId,
        answers: [{ fieldId: "message", kind: "text", text: "Historical retained answer" }],
    };
    const receipt = await call("/forms/submit", submission);
    let before = await call("/submissions/get", { receiptId: attemptId }, "QUERY");
    // Enough independently API-created drafts to prove a partially committed migration before SIGKILL.
    for (let batch = 0; batch < 25; batch++) {
        await Promise.all(
            Array.from({ length: 4 }, () => call("/forms/create", { formId: crypto.randomUUID(), draft })),
        );
    }
    const observed = await database(f);
    try {
        await until(
            async () =>
                (
                    await observed.db
                        .collection<{ _id: string; record: { event: { state: string } } }>("form_submissions")
                        .findOne({ _id: attemptId })
                )?.record.event?.state === "accepted",
        );
    } finally {
        await observed.client.close();
    }
    before = await call("/submissions/get", { receiptId: attemptId }, "QUERY");
    const file = join(f.paths.cmsFiles, "upgrade-retained-file");
    await writeFile(file, "historical file payload");
    const keys = await readFile(join(f.paths.services, "runtime.json"), "utf8");
    return {
        administrator,
        api,
        actor,
        formId,
        submission,
        receipt,
        before,
        notification,
        file,
        keys,
        call,
        async legacy() {
            await f.assertImage("old");
            expect((await formsCandidate(f.origin, actor.cookie)).version).toBe("1.1.0");
            expect((await call("/forms/get", { formId }, "QUERY")).draft.notification).toEqual(notification);
            expect(await call("/submissions/get", { receiptId: attemptId }, "QUERY")).toEqual(before);
            expect(await call("/forms/submit", submission)).toEqual(receipt);
            expect(await readFile(file, "utf8")).toBe("historical file payload");
            expect(await readFile(join(f.paths.services, "runtime.json"), "utf8")).toBe(keys);
        },
        async current() {
            await f.assertImage("new");
            expect((await formsCandidate(f.origin, actor.cookie)).version).toBe("2.0.0");
            expect((await call("/forms/v2/get", { formId }, "QUERY")).draft).not.toHaveProperty("notification");
            const next = await call("/submissions/v2/get", { receiptId: attemptId }, "QUERY");
            expect(next).toMatchObject({
                formId: before.formId,
                formVersion: before.formVersion,
                receivedAt: before.receivedAt,
                expiresAt: before.expiresAt,
                status: before.status,
            });
            expect(next.answers).toEqual(before.answers);
            expect(next.receiptId).toBe(before.receiptId);
            expect(await readFile(file, "utf8")).toBe("historical file payload");
            expect(await readFile(join(f.paths.services, "runtime.json"), "utf8")).toBe(keys);
        },
    };
}
export type HistoricalData = Awaited<ReturnType<typeof seedHistorical>>;
