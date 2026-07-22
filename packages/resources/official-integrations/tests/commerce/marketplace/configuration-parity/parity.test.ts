import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
    supabaseUrl,
    type CapturedFetch,
} from "../../harness";
import { customFieldScenario } from "./custom-field-scenario";
import { coreParityScenarios, type Change, type ParityScenario } from "./scenarios";

installCommerceTestEnvironment();

const scenarios = [...coreParityScenarios, customFieldScenario];

describe("commerce configuration post-action parity", () => {
    for (const scenario of scenarios) {
        test(`returns the exact created and updated ${scenario.name} detail`, async () => {
            let currentRow: Record<string, unknown> | undefined;
            let mutationIndex = 0;
            setRestResponder((request) => {
                const path = new URL(request.url).pathname;
                if (path.endsWith(`/rpc/${scenario.rpc}`)) {
                    currentRow = scenario.changes[mutationIndex++]?.row;
                    return currentRow
                        ? jsonResponse(currentRow)
                        : jsonResponse({ message: "unexpected extra mutation" }, 500);
                }
                if (path.endsWith(`/${scenario.table}`) && currentRow) {
                    return jsonResponse([currentRow]);
                }
                return jsonResponse({ message: `unexpected request ${path}` }, 500);
            });

            for (const change of scenario.changes) {
                const before = capturedFetches().length;
                const mutation = await requestCommerce(scenario.route, { body: change.body });
                const saved = (await mutation.json()) as Record<string, unknown>;
                const detail = await requestCommerce(`${scenario.route}?${scenario.detailQuery}`);
                const fetched = (await detail.json()) as Record<string, unknown>;

                expect(mutation.status).toBe(200);
                expect(detail.status).toBe(200);
                expect(saved).toEqual(change.dto);
                expect(fetched).toEqual(change.dto);
                expect(saved).toEqual(fetched);
                expect(Object.keys(saved).some((key) => key.includes("_"))).toBeFalse();
                for (const key of scenario.omittedKeys) {
                    expect(saved).not.toHaveProperty(key);
                    expect(fetched).not.toHaveProperty(key);
                }

                expectMutationThenDetail(capturedFetches().slice(before), scenario, change);
            }
            expect(mutationIndex).toBe(2);
            expect(capturedFetches()).toHaveLength(4);
        });
    }
});

function expectMutationThenDetail(calls: CapturedFetch[], scenario: ParityScenario, change: Change): void {
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.url.startsWith(`${supabaseUrl}/rest/v1/`))).toBeTrue();
    const [mutation, detail] = calls as [CapturedFetch, CapturedFetch];

    expect({
        path: new URL(mutation.url).pathname,
        method: mutation.method,
        body: mutation.body,
    }).toEqual({
        path: `/rest/v1/rpc/${scenario.rpc}`,
        method: "POST",
        body: change.rpcBody,
    });
    expect(mutation.headers.get("apikey")).toBe("sb_secret_test");
    expect(mutation.headers.get("authorization")).toBeNull();
    expect(mutation.headers.get("accept-profile")).toBe("commerce");
    expect(mutation.headers.get("content-profile")).toBe("commerce");

    const detailUrl = new URL(detail.url);
    expect({
        path: detailUrl.pathname,
        method: detail.method,
        params: Object.fromEntries(detailUrl.searchParams),
        body: detail.body,
    }).toEqual({
        path: `/rest/v1/${scenario.table}`,
        method: "GET",
        params: scenario.detailParams,
        body: {},
    });
    expect(detail.headers.get("apikey")).toBe("sb_secret_test");
    expect(detail.headers.get("authorization")).toBeNull();
    expect(detail.headers.get("accept-profile")).toBe("commerce");
    expect(detail.headers.get("content-profile")).toBeNull();
}
