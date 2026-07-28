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
} from "./fixtures";

afterEach(resetRepositoryDom);

describe("repository administration error states", () => {
    for (const fixture of [
        {
            status: 409,
            body: { code: "candidate_exists", existingDigest: "a".repeat(64) },
            text: "already exists",
        },
        { status: 413, body: { code: "candidate_request_too_large" }, text: "larger than the allowed" },
        {
            status: 422,
            body: { code: "admission_rejected" },
            text: "Release admission rejected",
        },
        { status: 429, body: { code: "rate_limited" }, text: "Retry after 17 seconds", retryAfter: "17" },
        { status: 503, body: { code: "repository_management_unavailable" }, text: "temporarily unavailable" },
    ] as const) {
        test(`renders an explicit ${fixture.status} candidate error`, async () => {
            installRepositoryFetch((call) => {
                if (call.url.pathname.endsWith("/candidates")) {
                    return Response.json(fixture.body, {
                        status: fixture.status,
                        headers: fixture.retryAfter ? { "retry-after": fixture.retryAfter } : undefined,
                    });
                }
                return defaultRepositoryResponse(call);
            });
            const console = await mountRepositoryConsole();
            const form = required<HTMLFormElement>(console, "[data-candidate-form]");
            const file = new File(["{}"], "candidate.json", { type: "application/json" });
            Object.defineProperty(required<HTMLInputElement>(form, '[name="candidate"]'), "files", {
                configurable: true,
                value: [file],
            });
            submit(form);
            await waitFor(() => console.textContent?.includes(fixture.text) === true);
            expect(required(console, "[data-candidate-feedback]").getAttribute("role")).toBe("alert");
        });
    }

    test("identifies stale report conflicts and requires a fresh exact confirmation", async () => {
        installRepositoryFetch((call) => {
            if (call.url.pathname.endsWith("/stable-promotions")) {
                return Response.json(
                    {
                        code: "integration_registry_stable_promotion_stale_report",
                        currentReportRevisionId: "decision-2",
                    },
                    { status: 409 },
                );
            }
            return defaultRepositoryResponse(call);
        });
        const console = await mountRepositoryConsole();
        await selectCurrentVersion(console);
        const form = required<HTMLFormElement>(console, "[data-promotion-form]");
        required<HTMLInputElement>(form, '[name="confirmationVersion"]').value = "1.1.0";
        required<HTMLInputElement>(form, '[name="confirmationReportRevisionId"]').value = "decision-1";
        submit(form);
        await waitFor(() => console.textContent?.includes("report is stale") === true);
        expect(console.textContent).toContain("decision-2");
        expect(console.textContent).toContain("confirm it again");
    });
});
