import { describe, expect, test } from "bun:test";
import { IntegrationRepositoryUnavailableError } from "@bernouy/cms-integrations";
import { RepositoryCms, type RepositoryCompatibilityReader } from "@bernouy/cms-repository";
import { admission, mounted, mutableCompatibilityReader } from "./fixtures";
import { json, TestRunner } from "../testRunner";

const ROOT = "/api/integrations/compatibility";
const VALID = `${ROOT}?kind=demo&version=1.0.0`;

describe("public integration compatibility failures", () => {
    test("validates exact identity and pagination before calling the reader", async () => {
        let calls = 0;
        const reader: RepositoryCompatibilityReader = {
            list: async () => {
                calls += 1;
                return null;
            },
        };
        const runner = mounted(reader);
        for (const path of [
            ROOT,
            `${ROOT}?kind=demo`,
            `${ROOT}?kind=../demo&version=1.0.0`,
            `${ROOT}?kind=demo&version=latest`,
            `${VALID}&limit=0`,
            `${VALID}&limit=101`,
            `${VALID}&version=1.0.0`,
            `${VALID}&after=${"x".repeat(257)}`,
        ]) {
            const response = await runner.handle(path);
            expect(response.status).toBe(400);
            expect(response.headers.get("cache-control")).toBe("no-store");
            expect(response.headers.get("access-control-allow-origin")).toBe("*");
            expect(await json(response)).toHaveProperty("error");
        }
        expect(calls).toBe(0);
        expect(await json(await runner.handle(`${ROOT}?kind=demo&version=latest`))).toMatchObject({
            code: "invalid_version",
        });
        expect(await json(await runner.handle(`${VALID}&limit=101`))).toMatchObject({
            code: "invalid_compatibility_limit",
        });
    });

    test("returns structured not-found and cursor errors", async () => {
        const history = mutableCompatibilityReader();
        const runner = mounted(history.reader);
        const missing = await runner.handle(`${ROOT}?kind=missing&version=1.0.0`);
        const cursor = await runner.handle(`${VALID}&after=missing-revision`);

        expect(missing.status).toBe(404);
        expect(missing.headers.get("cache-control")).toBe("no-store");
        expect(missing.headers.get("access-control-allow-origin")).toBe("*");
        expect(await json(missing)).toEqual({ error: "integration compatibility report not found" });
        expect(cursor.status).toBe(400);
        expect(await json(cursor)).toEqual({
            error: "Compatibility history cursor does not exist",
            code: "invalid_compatibility_cursor",
        });
    });

    test("maps typed unavailability and invalid reader data to public 503 and 502 responses", async () => {
        const unavailable = mounted({
            list: async () => {
                throw new IntegrationRepositoryUnavailableError();
            },
        });
        const invalid = mounted({
            list: async () => ({
                root: admission(),
                current: { ...admission(), packageDigest: "invalid" },
                currentRevisionId: "admission-1",
                currentReportDigest: "f".repeat(64),
                revisions: [],
                totalRevisions: 0,
            }),
        });

        const unavailableResponse = await unavailable.handle(VALID);
        const invalidResponse = await invalid.handle(VALID);

        expect(unavailableResponse.status).toBe(503);
        expect(unavailableResponse.headers.get("cache-control")).toBe("no-store");
        expect(unavailableResponse.headers.get("access-control-allow-origin")).toBe("*");
        expect(await json(unavailableResponse)).toEqual({
            error: "Integration repository is unavailable",
            code: "integration_repository_unavailable",
        });
        expect(invalidResponse.status).toBe(502);
        expect(invalidResponse.headers.get("cache-control")).toBe("no-store");
        expect(await json(invalidResponse)).toEqual({
            error: "Integration repository returned an invalid response",
            code: "integration_repository_invalid_response",
        });
    });

    test("accepts the inclusive 100-revision page boundary", async () => {
        const history = mutableCompatibilityReader();
        const response = await mounted(history.reader).handle(`${VALID}&limit=100`);

        expect(response.status).toBe(200);
        expect(history.requests).toEqual([{ limit: 100 }]);
    });

    test("does not mount the optional route without a compatibility reader", async () => {
        const runner = new TestRunner();
        new RepositoryCms({
            runner,
            integrationCatalog: {
                list: async () => [],
                getIndex: async () => null,
                listVersions: async () => [],
                get: async () => null,
            },
        });

        expect(runner.handle(VALID)).rejects.toThrow("missing handler");
    });
});
