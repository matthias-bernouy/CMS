import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../../../tests/helpers/integrationDefinition";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
    supabaseUrl,
} from "../../../harness";
import { customFieldScenario } from "./custom-field-scenario";
import { coreParityScenarios } from "./scenarios";

installCommerceTestEnvironment();

const scenarios = [...coreParityScenarios, customFieldScenario];

describe("commerce configuration post-action boundaries", () => {
    test("rejects each malformed mutation before database work", async () => {
        for (const scenario of scenarios) {
            const response = await requestCommerce(scenario.route, { body: scenario.invalid.body });

            expect({ name: scenario.name, status: response.status, body: await response.json() }).toEqual({
                name: scenario.name,
                status: 400,
                body: { error: scenario.invalid.error },
            });
        }
        expect(capturedFetches()).toHaveLength(0);
    });

    test("preserves one-call mutation conflict mapping for every command", async () => {
        for (const scenario of scenarios) {
            setRestResponder(() => jsonResponse({ message: "conflict: configuration changed" }, 400));
            const before = capturedFetches().length;
            const response = await requestCommerce(scenario.route, { body: scenario.changes[0]!.body });

            expect({ name: scenario.name, status: response.status, body: await response.json() }).toEqual({
                name: scenario.name,
                status: 409,
                body: { error: "configuration changed" },
            });
            const calls = capturedFetches().slice(before);
            expect(calls).toHaveLength(1);
            expect(new URL(calls[0]!.url).pathname).toBe(`/rest/v1/rpc/${scenario.rpc}`);
            expect(calls[0]!.url.startsWith(`${supabaseUrl}/rest/v1/`)).toBeTrue();
        }
    });

    test("keeps a missing refetch distinct after a successful mutation", async () => {
        for (const scenario of scenarios) {
            setRestResponder((request) =>
                new URL(request.url).pathname.endsWith(`/rpc/${scenario.rpc}`)
                    ? jsonResponse(scenario.changes[0]!.row)
                    : jsonResponse([]),
            );
            const before = capturedFetches().length;
            const mutation = await requestCommerce(scenario.route, { body: scenario.changes[0]!.body });
            const detail = await requestCommerce(`${scenario.route}?${scenario.detailQuery}`);

            expect(mutation.status).toBe(200);
            expect({ name: scenario.name, status: detail.status, body: await detail.json() }).toEqual({
                name: scenario.name,
                status: 404,
                body: { error: scenario.missingError },
            });
            expect(
                capturedFetches()
                    .slice(before)
                    .map((call) => new URL(call.url).pathname),
            ).toEqual([`/rest/v1/rpc/${scenario.rpc}`, `/rest/v1/${scenario.table}`]);
        }
    });

    test("resolves every configuration action to its matching mutation endpoint", async () => {
        const definition = await loadIntegrationDefinition<any>(definitionPath);
        const endpoints = {
            saveCondition: "upsertOfferCondition",
            saveWorkflowState: "upsertWorkflowState",
            saveWorkflowTransition: "upsertWorkflowTransition",
            saveCustomField: "upsertCustomField",
        } as const;

        for (const scenario of scenarios) {
            const action = findById(definition, scenario.actionId);
            expect(action).toBeDefined();
            expect(action?.endpoint).toMatchObject({
                endpoint: endpoints[scenario.actionId as keyof typeof endpoints],
            });
            expect(action?.after).toEqual({ resource: "$result" });
        }
    });
});

const definitionPath = resolve(import.meta.dir, "../../../../definition.json");

function findById(value: unknown, id: string): Record<string, unknown> | undefined {
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = findById(item, id);
            if (found) {
                return found;
            }
        }
        return undefined;
    }
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    if (record.id === id) {
        return record;
    }
    return findById(Object.values(record), id);
}
