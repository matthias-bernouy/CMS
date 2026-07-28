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
    test("uploads a candidate envelope and reports its verified publication progress", async () => {
        const calls = installRepositoryFetch();
        const console = await mountRepositoryConsole();
        const form = required<HTMLFormElement>(console, "[data-candidate-form]");
        const file = new File(['{"schema":"cms.integration.candidate.v1"}'], "commerce-candidate.json", {
            type: "application/json",
        });
        Object.defineProperty(required<HTMLInputElement>(form, '[name="candidate"]'), "files", {
            configurable: true,
            value: [file],
        });

        submit(form);
        await waitFor(() => console.textContent?.includes("commerce@1.2.0 is published") === true);

        const publication = calls.find((call) => call.url.pathname.endsWith("/candidates"));
        expect(publication?.url.pathname).toBe("/cms/api/repository/candidates");
        expect(publication?.init?.body).toBe(file);
        expect(publication?.init?.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
        expect(console.textContent).toContain("Candidate candidate-1 accepted");
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
            currentReport: { revisionId: "revision-1", reportDigest: "e".repeat(64) },
            currentDecision: { revisionId: "decision-1", digest: "d".repeat(64) },
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
        report.value = "decision-1";
        submit(form);
        await waitFor(() => console.textContent?.includes("Type the exact version 1.1.0") === true);
        expect(promotionCalls(calls)).toHaveLength(0);

        version.value = "1.1.0";
        report.value = "revision-1";
        submit(form);
        await waitFor(
            () => console.textContent?.includes("Type the exact current release decision ID decision-1") === true,
        );
        expect(promotionCalls(calls)).toHaveLength(0);

        version.value = "1.1.0";
        report.value = "decision-1";
        submit(form);
        await waitFor(() => console.textContent?.includes("Promoted commerce@1.1.0 to stable") === true);
        const body = JSON.parse(String(promotionCalls(calls)[0]?.init?.body));
        expect(body).toEqual({
            kind: "commerce",
            version: "1.1.0",
            currentReportRevisionId: "decision-1",
            confirmation: { version: "1.1.0", reportRevisionId: "decision-1" },
        });
        expect(JSON.stringify(body)).not.toMatch(/actor|email|authorization|token/iu);
    });

    test("previews and confirms an atomic block with exact decision CAS", async () => {
        const calls = installRepositoryFetch();
        const console = await mountRepositoryConsole();
        await selectCurrentVersion(console);
        expect(console.textContent).toContain("stable 1.0.0 → 1.0.0");
        expect(console.textContent).toContain("latest 1.1.0 → 1.0.0");
        const form = required<HTMLFormElement>(console, "[data-block-form]");
        required<HTMLInputElement>(form, '[name="blockVersion"]').value = "1.1.0";
        required<HTMLInputElement>(form, '[name="blockDecisionDigest"]').value = "d".repeat(64);
        required<HTMLTextAreaElement>(form, '[name="reason"]').value = "Production incident";

        submit(form);
        await waitFor(() => console.textContent?.includes("Blocked commerce@1.1.0") === true);
        const call = calls.find((entry) => entry.url.pathname.endsWith("/version-blocks"));
        expect(JSON.parse(String(call?.init?.body))).toEqual({
            kind: "commerce",
            version: "1.1.0",
            currentDecision: { revisionId: "decision-1", digest: "d".repeat(64) },
            reason: "Production incident",
            confirmation: {
                action: "block",
                kind: "commerce",
                version: "1.1.0",
                decisionRevisionId: "decision-1",
                decisionDigest: "d".repeat(64),
            },
        });
    });
});

function promotionCalls(calls: readonly RepositoryFetchCall[]): readonly RepositoryFetchCall[] {
    return calls.filter((call) => call.url.pathname.endsWith("/stable-promotions"));
}
