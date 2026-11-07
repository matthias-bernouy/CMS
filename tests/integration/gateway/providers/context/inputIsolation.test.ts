import { expect, test } from "bun:test";
import { fixture } from "./fixture";

function options(command: boolean) {
    return {
        ...(command
            ? { behavior: { sensitive: false, effect: "command", execution: "sync", idempotency: "natural" } }
            : {}),
        bindings: [
            {
                id: "http",
                transport: "http",
                method: command ? "POST" : "GET",
                path: "/v1/items",
                input: { headers: { range: { property: "term", encoding: "http-field" } } },
                response: {
                    successStatuses: [200],
                    contentTypes: ["application/json"],
                    errorStatuses: { NOT_FOUND: 404 },
                },
            },
        ],
    };
}
const invocation = {
    siteId: "site-a",
    contractId: "ulvia/catalog",
    capabilityId: "item.list",
    actor: { kind: "anonymous" as const },
};

test.each([false, true])("metadata cannot populate an omitted input (command=%s)", async (command) => {
    const f = await fixture(false, options(command));
    let changed = false;
    f.dispatcher.register("ulvia/catalog", "item.list", async (input, context) => {
        expect(input).toEqual({});
        expect(context.http.headers.get("range")).toBe("metadata-only");
        changed = input.term !== undefined;
        return { items: [] };
    });
    f.mount();
    await f.gateway.invoke({ ...invocation, input: {}, requestContext: { headers: { range: "metadata-only" } } });
    expect(f.wireHeaders).toHaveLength(1);
    expect(f.wireHeaders[0]?.range).toBeUndefined();
    expect(changed).toBe(false);
});

test("validated bound inputs still reach the handler, while invalid or denied commands do not mutate state", async () => {
    for (const granted of [true, false]) {
        const f = await fixture(false, options(true), granted);
        let state = "initial";
        f.dispatcher.register("ulvia/catalog", "item.list", async (input) => {
            state = String(input.term);
            return { items: [] };
        });
        f.mount();
        await expect(f.gateway.invoke({ ...invocation, input: { term: "a".repeat(51) } })).rejects.toBeDefined();
        expect(state).toBe("initial");
        expect(f.wireHeaders).toHaveLength(0);
        const call = () => f.gateway.invoke({ ...invocation, input: { term: "validated" } });
        if (granted) {
            await call();
            expect(state).toBe("validated");
            expect(f.wireHeaders[0]?.range).toBe("validated");
        } else {
            await expect(call()).rejects.toMatchObject({ code: "not_authorized" });
            expect(state).toBe("initial");
            expect(f.wireHeaders).toHaveLength(0);
        }
    }
});
