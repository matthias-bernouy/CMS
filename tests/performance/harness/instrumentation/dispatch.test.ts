import { expect, test } from "bun:test";
import { readFile, rm } from "node:fs/promises";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/cms-gateway/provider/server";
import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { inventoryFixture } from "../../fixtures/inventory";
import { instrumentDispatcher } from "./dispatch";
import { traceFile } from "./records";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";

class MeasuredDispatcher extends DefaultProviderCapabilityDispatcher {
    override seal(...args: Parameters<DefaultProviderCapabilityDispatcher["seal"]>) {
        return super.seal(...args);
    }
    override invoke(...args: Parameters<DefaultProviderCapabilityDispatcher["invoke"]>) {
        return super.invoke(...args);
    }
}
instrumentDispatcher(MeasuredDispatcher.prototype);

async function fixture() {
    const { build } = await inventoryFixture();
    const catalogue = new InMemoryReleaseCatalogue();
    const parent = build.contracts.find((row) => row.release.contractId === "performance/parent")!;
    await catalogue.publish(parent);
    const admission = await admitContractRelease({ ...build.implementedContracts[0]!.release, version: "2.0.0" });
    const view = await resolveContract(catalogue, admission);
    const dispatcher = new MeasuredDispatcher();
    for (const capability of view.capabilities) {
        dispatcher.register(view.release.contractId, capability.definition.id, async (input) => {
            if (input.fail) {
                throw new Error("Fixture failure");
            }
            return { ok: true };
        });
    }
    dispatcher.seal([view]);
    return { dispatcher, view, catalogue };
}

function context(contractId: string, contractVersion: string): ProviderCapabilityInvocationContext {
    return {
        requestId: crypto.randomUUID(),
        contractVersion,
        invocation: {
            contractId,
            instanceId: crypto.randomUUID(),
            bindingId: "http",
        },
        siteId: "fixture",
        providerId: "performance/provider",
    };
}

async function captured(context: ProviderCapabilityInvocationContext) {
    const file = traceFile(context.requestId);
    try {
        const rows = (await readFile(file, "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        return rows.filter((row) => row.kind === "capability");
    } finally {
        await rm(file, { force: true });
    }
}

test("parent HTTP dispatch witnesses the exact mounted child version and preserves failures and trace isolation", async () => {
    const { dispatcher, view } = await fixture();
    const contexts = Array.from({ length: 10 }, () => context("performance/parent", "1.0.0"));
    const key = `performance/child@2.0.0#${view.digest}:inherited`;
    await Promise.all(
        contexts.map(async (value, index) => {
            if (index === 0) {
                await expect(
                    dispatcher.invoke("performance/child", "inherited", { fail: true }, value),
                ).rejects.toThrow();
            } else {
                expect(await dispatcher.invoke("performance/child", "inherited", {}, value)).toEqual({ ok: true });
            }
            const rows = await captured(value);
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                target: key,
                contractId: "performance/parent",
                binding: "http",
                traceId: value.requestId,
                success: index !== 0,
                firstInProcess: true,
            });
        }),
    );
});

test("unmounted or wrong parent pins cannot become complete concrete execution witnesses", async () => {
    const { dispatcher } = await fixture();
    for (const value of [context("performance/parent", "9.0.0"), context("performance/foreign", "1.0.0")]) {
        await dispatcher.invoke("performance/child", "inherited", {}, value);
        const rows = await captured(value);
        expect(rows[0].target).toContain("#unresolved:");
    }
});

test("ambiguous mounted child versions fail closed instead of choosing the latest execution pin", async () => {
    const { view, catalogue } = await fixture();
    const newer = await resolveContract(catalogue, await admitContractRelease({ ...view.release, version: "3.0.0" }));
    const dispatcher = new MeasuredDispatcher();
    for (const capability of view.capabilities) {
        dispatcher.register("performance/child", capability.definition.id, async () => ({ ok: true }));
    }
    dispatcher.seal([view, newer]);
    const value = context("performance/parent", "1.0.0");
    await dispatcher.invoke("performance/child", "inherited", {}, value);
    const rows = await captured(value);
    expect(rows).toHaveLength(1);
    expect(rows[0].target).toContain("#unresolved:");
});

test("direct concrete dispatch retains its exact version and cold first-dispatch identity", async () => {
    const { dispatcher, view } = await fixture();
    const first = context("performance/child", "2.0.0");
    const second = { ...first, requestId: crypto.randomUUID() };
    for (const value of [first, second]) {
        await dispatcher.invoke("performance/child", "read", {}, value);
        const rows = await captured(value);
        expect(rows[0]).toMatchObject({
            target: `performance/child@2.0.0#${view.digest}:read`,
            traceId: value.requestId,
            firstInProcess: value === first,
            success: true,
        });
        expect(typeof rows[0].epoch).toBe("string");
    }
});
