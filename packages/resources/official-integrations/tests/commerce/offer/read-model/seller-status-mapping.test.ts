import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
    type JsonRecord,
} from "../../harness";

installCommerceTestEnvironment();

const dynamicStates = [
    state("draft_a", "draft"),
    state("ready_b", "ready"),
    state("seller_a", "seller_input"),
    state("seller_b", "seller_input"),
    state("review", "admin_review"),
    state("reject_a", "terminal", true),
    state("archived", "terminal", true),
    state("reject_b", "terminal", true),
];
const noMatchingStates = [state("review", "admin_review")];

const cases: Array<{
    label: string;
    status: string;
    states: JsonRecord[];
    expected: Record<string, string>;
}> = [
    { label: "all", status: "all", states: dynamicStates, expected: {} },
    { label: "paused", status: "paused", states: dynamicStates,
        expected: { publication_status: "eq.paused" } },
    { label: "archived dynamic", status: "archived", states: dynamicStates,
        expected: { or: "(publication_status.eq.archived,workflow_state.in.(archived))" } },
    { label: "archived empty", status: "archived", states: noMatchingStates,
        expected: { or: "(publication_status.eq.archived)" } },
    { label: "rejected dynamic", status: "rejected", states: dynamicStates,
        expected: { workflow_state: "in.(reject_a,reject_b)" } },
    { label: "rejected empty", status: "rejected", states: noMatchingStates,
        expected: { workflow_state: "eq.__none__" } },
    { label: "action required dynamic", status: "action_required", states: dynamicStates,
        expected: { workflow_state: "in.(seller_a,seller_b)" } },
    { label: "action required empty", status: "action_required", states: noMatchingStates,
        expected: { workflow_state: "eq.__none__" } },
    { label: "draft dynamic", status: "draft", states: dynamicStates,
        expected: { workflow_state: "in.(draft_a,ready_b)" } },
    { label: "draft empty", status: "draft", states: noMatchingStates,
        expected: { workflow_state: "eq.__none__" } },
];

describe("commerce seller offer status mapping", () => {
    test.each(cases)("maps $label to the exact historical PostgREST filters", async scenario => {
        useResponder(scenario.states);

        const response = await requestCommerce(`/me/offers?status=${scenario.status}`, {
            userId: "seller-user-123",
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ items: [], total: 0, limit: 50, offset: 0 });
        expect(resources()).toEqual(["sellers", "offer_workflow_states", "offers"]);
        const query = offersQuery();
        expect(query.seller_id).toBe("eq.7");
        expect(statusFilters(query)).toEqual(scenario.expected);
    });
});

function useResponder(states: JsonRecord[]): void {
    setRestResponder(request => {
        const resource = resourceName(request);
        if (resource === "sellers") return jsonResponse([{ id: 7 }]);
        if (resource === "offer_workflow_states") return jsonResponse(states);
        if (resource === "offers") return jsonResponse([], 200, { "content-range": "*/0" });
        throw new Error(`Unexpected seller offer request: ${request.url}`);
    });
}

function statusFilters(query: Record<string, string>): Record<string, string> {
    return Object.fromEntries(["publication_status", "workflow_state", "or"]
        .filter(key => Object.hasOwn(query, key)).map(key => [key, query[key]!]));
}

function offersQuery(): Record<string, string> {
    const call = capturedFetches().find(item => resourceName(item) === "offers");
    if (!call) throw new Error("Missing offers request");
    return Object.fromEntries(new URL(call.url).searchParams);
}

function resources(): string[] {
    return capturedFetches().map(call => resourceName(call));
}

function resourceName(request: Request | { url: string }): string {
    return new URL(request.url).pathname.split("/").at(-1)!;
}

function state(code: string, phase: string, terminal = false): JsonRecord {
    return { code, label: code, phase, terminal };
}
