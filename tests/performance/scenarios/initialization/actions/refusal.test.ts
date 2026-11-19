import { expect, test } from "bun:test";
import { prepareInitializationList } from "./list";
import type { FreshTenant } from "../../installations/fresh";
import type { QueryEnvironment } from "../../queries/execute";
import type { Dataset } from "../datasets";
import type { workflowDatasets } from "./datasets";

function fixture(refusalStatus: number) {
    const events: string[] = [];
    const root: NonNullable<Dataset["root"]> = {
        publisherId: "performance-init",
        collectionId: "performance-init/workflow-one",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}`,
        bootstrapId: "start",
    };
    const dataset: Dataset = { root, paths: ["/fixture"], collections: 1 };
    const page = {
        items: [{ root, label: "Fixture", description: "Fixture recipe", pageCount: 1, includeCount: 0 }],
        cursor: "",
    };
    const state = {
        async prepare() {
            events.push("prepare");
        },
        async fixture(capability: string) {
            events.push(capability);
            if (capability === "initialization.status") {
                return { status: "pending", revision: 0 };
            }
            return { items: [], cursor: "", revision: 0 };
        },
        async client(
            _contract: string,
            _capability: string,
            _binding: string,
            input: Readonly<Record<string, unknown>>,
            assert: (output: unknown) => void | Promise<void> = () => {},
            options: { httpCredentials?: { cookie?: string } } = {},
        ) {
            if (input.cursor === "invalid-cursor") {
                events.push("invalid-cursor");
                return { observation: { validated: false, status: refusalStatus } };
            }
            if (options.httpCredentials) {
                expect(options.httpCredentials.cookie).toBe("foreign-session");
                events.push("foreign");
                return { observation: { validated: false, status: 401 } };
            }
            events.push("measured");
            await assert(page);
            return { observation: { validated: true, status: 200 }, output: page };
        },
        async close() {
            events.push("closed");
        },
    } as unknown as FreshTenant;
    const environment = { main: { cookie: "foreign-session" } } as unknown as QueryEnvironment;
    const datasets = (async () => [dataset]) as ReturnType<typeof workflowDatasets>;
    return { state, environment, datasets, events };
}

test("initialization recipe list accepts the native cursor conflict and still checks foreign access and final state", async () => {
    const f = fixture(409);
    const sample = await prepareInitializationList(f.state, f.environment, "http", "nominal", f.datasets);
    try {
        expect((await sample.send()).validated).toBe(true);
        await sample.verify?.();
    } finally {
        await sample.close?.();
    }
    expect(f.events).toContain("invalid-cursor");
    expect(f.events.slice(-5)).toEqual([
        "foreign",
        "initialization.status",
        "pages.list",
        "list-collection-installations",
        "closed",
    ]);
});

for (const status of [400, 422, 503]) {
    test(`initialization recipe list does not accept cursor refusal ${status} as a conflict`, async () => {
        const f = fixture(status);
        const sample = await prepareInitializationList(f.state, f.environment, "http", "nominal", f.datasets);
        try {
            await sample.send();
            await expect(sample.verify!()).rejects.toThrow("Business postcondition was not satisfied");
        } finally {
            await sample.close?.();
        }
        expect(f.events).not.toContain("foreign");
        expect(f.events.at(-1)).toBe("closed");
    });
}
