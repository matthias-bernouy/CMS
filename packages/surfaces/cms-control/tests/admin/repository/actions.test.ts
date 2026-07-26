import { afterEach, describe, expect, test } from "bun:test";
import {
    defaultRepositoryResponse,
    installRepositoryFetch,
    mountRepositoryConsole,
    required,
    resetRepositoryDom,
    selectCurrentVersion,
    submit,
    waitFor,
    type RepositoryFetchCall,
} from "./fixtures";

afterEach(resetRepositoryDom);

describe("repository administration actions", () => {
    test("uploads package JSON and shows its compatibility validation result", async () => {
        const calls = installRepositoryFetch();
        const console = await mountRepositoryConsole();
        const form = required<HTMLFormElement>(console, "[data-upload-form]");
        const file = new File(['{"schema":"cms.integration.package.v1"}'], "commerce.json", {
            type: "application/json",
        });
        Object.defineProperty(required<HTMLInputElement>(form, '[name="package"]'), "files", {
            configurable: true,
            value: [file],
        });

        submit(form);
        await waitFor(() => console.textContent?.includes("Published commerce@1.2.0") === true);

        const publication = calls.find((call) => call.method === "POST");
        expect(publication?.url.pathname).toBe("/cms/api/repository/publications");
        expect(publication?.init?.body).toBe(file);
        expect(publication?.init?.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
        expect(console.textContent).toContain("Compatibility: compatible; report admission-2");
    });

    test("sends a reason and evidence IDs for reevaluation without browser-controlled identity", async () => {
        const calls = installRepositoryFetch();
        const console = await mountRepositoryConsole();
        await selectCurrentVersion(console);
        const form = required<HTMLFormElement>(console, "[data-reevaluation-form]");
        required<HTMLTextAreaElement>(form, '[name="reason"]').value = "Evaluator 2 rollout";
        required<HTMLTextAreaElement>(form, '[name="evidenceIds"]').value = "ci-1, ci-2\nci-1";

        submit(form);
        await waitFor(() => console.textContent?.includes("Created compatibility revision revision-2") === true);

        const call = calls.find((entry) => entry.url.pathname.endsWith("/reevaluations"));
        const body = JSON.parse(String(call?.init?.body));
        expect(body).toEqual({
            kind: "commerce",
            version: "1.1.0",
            currentReportRevisionId: "revision-1",
            reason: "Evaluator 2 rollout",
            evidenceIds: ["ci-1", "ci-2"],
        });
        expect(JSON.stringify(body)).not.toMatch(/actor|email|authorization|token/iu);
    });

    test("requires both exact stable-promotion confirmations", async () => {
        const calls = installRepositoryFetch((call) => defaultRepositoryResponse(call));
        const console = await mountRepositoryConsole();
        await selectCurrentVersion(console);
        const form = required<HTMLFormElement>(console, "[data-promotion-form]");
        const version = required<HTMLInputElement>(form, '[name="confirmationVersion"]');
        const report = required<HTMLInputElement>(form, '[name="confirmationReportRevisionId"]');

        version.value = "1.0.0";
        report.value = "revision-1";
        submit(form);
        await waitFor(() => console.textContent?.includes("Type the exact version 1.1.0") === true);
        expect(promotionCalls(calls)).toHaveLength(0);

        version.value = "1.1.0";
        report.value = "admission-1";
        submit(form);
        await waitFor(
            () => console.textContent?.includes("Type the exact current report revision ID revision-1") === true,
        );
        expect(promotionCalls(calls)).toHaveLength(0);

        version.value = "1.1.0";
        report.value = "revision-1";
        submit(form);
        await waitFor(() => console.textContent?.includes("Promoted commerce@1.1.0 to stable") === true);
        const body = JSON.parse(String(promotionCalls(calls)[0]?.init?.body));
        expect(body).toEqual({
            kind: "commerce",
            version: "1.1.0",
            currentReportRevisionId: "revision-1",
            confirmation: { version: "1.1.0", reportRevisionId: "revision-1" },
        });
        expect(JSON.stringify(body)).not.toMatch(/actor|email|authorization|token/iu);
    });
});

function promotionCalls(calls: readonly RepositoryFetchCall[]): readonly RepositoryFetchCall[] {
    return calls.filter((call) => call.url.pathname.endsWith("/stable-promotions"));
}
