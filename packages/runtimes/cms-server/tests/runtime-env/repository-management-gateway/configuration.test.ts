import { describe, expect, test } from "bun:test";
import { HttpRepositoryManagementGateway } from "../../../src/repositoryManagement/gateway";
import { TEST_ACTOR } from "./fixtures";

describe("HTTP repository management gateway configuration", () => {
    test("rejects unsafe configuration without echoing configured values", () => {
        const base = {
            baseUrl: "https://repository.internal/private",
            token: "do-not-echo-token",
            administratorSubjectIdentifier: TEST_ACTOR,
            timeoutMs: 1_000,
        };
        for (const config of [
            { ...base, baseUrl: "https://user:secret@repository.internal/private" },
            { ...base, baseUrl: "https://repository.internal/private?token=secret" },
            { ...base, token: "contains whitespace" },
            { ...base, administratorSubjectIdentifier: " " },
            { ...base, timeoutMs: 0 },
        ]) {
            let message = "";
            try {
                new HttpRepositoryManagementGateway(config);
            } catch (error) {
                message = error instanceof Error ? error.message : String(error);
            }
            expect(message).not.toBe("");
            expect(message).not.toContain("do-not-echo-token");
            expect(message).not.toContain(config.baseUrl);
        }
    });
});
