import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { admitContractRelease, verifyStoredContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
import { capabilityBindings } from "@bernouy/cms-repository/contracts/bindings";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { capabilityDocument, contractDocument } from "../support/fixtures";

function document(bindings: unknown) {
    const capability = capabilityDocument();
    delete capability.binding;
    return contractDocument({ capabilities: [{ ...capability, bindings }] });
}
const mcp = {
    id: "agent",
    transport: "mcp",
    tool: { name: "send_email", title: "Send email", description: "Send a prepared transactional message." },
};

test("MCP-only contracts admit without any HTTP execution plan and retain binding metadata", async () => {
    const admitted = await admitContractRelease(document([mcp]));
    expect(admitted.bindings).toEqual([]);
    expect(admitted.release.capabilities[0]?.bindings).toEqual([mcp]);
    expect(Object.isFrozen(admitted.release.capabilities[0]?.bindings?.[0])).toBe(true);
    expect((await verifyStoredContractReleaseJson(admitted.canonicalJson, admitted.digest)).digest).toBe(
        admitted.digest,
    );
});

test("multiple HTTP aliases and explicit MCP exposure compile independently", async () => {
    const http = capabilityDocument().binding as Record<string, unknown>;
    const admitted = await admitContractRelease(
        document([{ id: "rest", ...http }, { id: "alias", ...http, path: "/v2/messages" }, mcp]),
    );
    expect(admitted.bindings.map(({ bindingId, binding }) => [bindingId, binding.path])).toEqual([
        ["rest", "/v1/messages"],
        ["alias", "/v2/messages"],
    ]);
    expect(capabilityBindings(admitted.release.capabilities[0]!)).toHaveLength(3);
});

test("binding declarations reject ambiguous IDs, routes, names and unsupported configuration", async () => {
    const http = capabilityDocument().binding as Record<string, unknown>;
    const invalid = [
        [],
        Array.from({ length: 17 }, (_, id) => ({ ...mcp, id: `b${id}` })),
        [mcp, mcp],
        [{ ...mcp, id: "bad id" }],
        [{ id: "socket", transport: "ws" }],
        [{ ...mcp, skills: [] }],
        [{ ...mcp, tool: { name: "bad name" } }],
        [
            { id: "a", ...http },
            { id: "b", ...http },
        ],
        [
            { ...mcp, id: "first" },
            { ...mcp, id: "second" },
        ],
    ];
    for (const bindings of invalid) {
        await expect(admitContractRelease(document(bindings))).rejects.toThrow();
    }
    const both = capabilityDocument({ bindings: [mcp] });
    await expect(admitContractRelease(contractDocument({ capabilities: [both] }))).rejects.toThrow(
        "mutually exclusive",
    );
    await expect(admitContractRelease(document([{ ...mcp, tool: { resources: [] } }]))).rejects.toThrow();
});

test("historical single HTTP releases retain their exact canonical bytes and digest", async () => {
    const old = await admitContractRelease(contractDocument());
    const bytes = canonicalizeIJson(old.release);
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    expect(old.canonicalJson).toBe(bytes);
    expect(old.digest).toBe(digest);
    // Pinned using the pre-migration implementation, independently of this parser.
    expect(old.digest).toBe("sha256:60f19c48772dc44422aa5c31a0fa823fb3c7f69570d0e8af16e6c8a6531be7ac");
    expect(old.release.capabilities[0]?.binding).toBeDefined();
    expect(old.release.capabilities[0]?.bindings).toBeUndefined();
    expect(capabilityBindings(old.release.capabilities[0]!)).toMatchObject([{ id: "http", transport: "http" }]);
    expect((await verifyStoredContractReleaseJson(bytes, digest)).canonicalJson).toBe(bytes);
});

test("removing or renaming an MCP exposure requires a major version", async () => {
    const previous = await admitContractRelease(document([mcp]));
    const renamed = await admitContractRelease({
        ...document([{ ...mcp, tool: { name: "send_email_v2" } }]),
        version: "0.2.0",
    });
    expect(compareContractReleases(previous.release, renamed.release)).toMatchObject({ requiredBump: "major" });
    const documented = await admitContractRelease({
        ...document([{ ...mcp, tool: { ...mcp.tool, description: "Improved guidance." } }]),
        version: "0.1.1",
    });
    expect(compareContractReleases(previous.release, documented.release)).toMatchObject({ requiredBump: "patch" });
});

test("MCP admission rejects nested, multiple and nullable binary inputs and browser session effects", async () => {
    for (const properties of [
        { a: { type: "binary", maxBytes: 8 }, b: { type: "binary", maxBytes: 8 } },
        { bytes: { type: "array", maxItems: 2, items: { type: "binary", maxBytes: 8 } } },
        { bytes: { type: "binary", maxBytes: 8, nullable: true } },
    ]) {
        const capability = capabilityDocument({
            input: { type: "object", properties, required: Object.keys(properties) },
        });
        delete capability.binding;
        await expect(
            admitContractRelease(contractDocument({ capabilities: [{ ...capability, bindings: [mcp] }] })),
        ).rejects.toThrow();
    }
    const capability = capabilityDocument({ responseEffects: ["session"] });
    delete capability.binding;
    await expect(
        admitContractRelease(contractDocument({ capabilities: [{ ...capability, bindings: [mcp] }] })),
    ).rejects.toThrow("browser response effects");
});
