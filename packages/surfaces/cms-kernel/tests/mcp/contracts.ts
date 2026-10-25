import { admitContractRelease } from "@bernouy/cms-repository/contracts";

export async function createMcpTestContract() {
    const contract = await admitContractRelease({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "test",
        contractId: "test.cms",
        name: "Test CMS",
        version: "1.0.0",
        capabilities: [
            {
                id: "echo",
                access: "admin",
                behavior: { effect: "query", execution: "sync" },
                input: { type: "object", properties: {}, required: [] },
                output: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
                errors: [],
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "GET",
                        path: "/echo",
                        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                    },
                    { id: "mcp", transport: "mcp", tool: { name: "echo" } },
                ],
            },
        ],
    });
    const update = structuredClone(contract.release.capabilities[0]!);
    Object.assign(update, {
        id: "update",
        behavior: { effect: "command", execution: "sync", idempotency: "none" },
        bindings: [{ id: "mcp", transport: "mcp", tool: { name: "update" } }],
    });
    const withCommand = await admitContractRelease({
        ...contract.release,
        capabilities: [...contract.release.capabilities, update],
    });
    return withCommand;
}
