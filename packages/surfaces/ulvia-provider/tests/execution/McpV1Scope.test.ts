import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { capabilityBindings } from "@bernouy/cms-repository/contracts/bindings";

const allowed = new Set(["ulvia.cms.repository", "ulvia.cms.content", "ulvia.cms.files", "ulvia.cms.installations"]);
const bootstrap = resolve(import.meta.dir, "../../../../runtimes/ulvia-cli/dist/bootstrap");

test("official MCP V1 exposes only Repository, ordinary content, site files and collection lifecycle tools", async () => {
    const index = JSON.parse(await readFile(resolve(bootstrap, "index.json"), "utf8")) as { contracts: string[] };
    let tools = 0;
    for (const path of index.contracts) {
        const { release } = await admitContractReleaseJson(await readFile(resolve(bootstrap, path)));
        for (const capability of release.capabilities) {
            const bindings = capabilityBindings(capability);
            if (!bindings.some((binding) => binding.transport === "mcp")) {
                continue;
            }
            tools += 1;
            expect(allowed.has(release.contractId)).toBe(true);
            expect(bindings.some((binding) => binding.transport === "http")).toBe(true);
            if (release.contractId === "ulvia.cms.files") {
                expect(capability.id.startsWith("workspace.")).toBe(true);
            }
            if (release.contractId === "ulvia.cms.content") {
                expect(capability.id.startsWith("delivery.")).toBe(false);
            }
            if (release.contractId === "ulvia.cms.installations") {
                expect(
                    capability.id.includes("collection") ||
                        [
                            "get-operation",
                            "list-operations",
                            "list-site-usage",
                            "get-site-upgrade-status",
                            "plan-contract-upgrade",
                            "apply-contract-upgrade",
                            "resume-contract-upgrade",
                            "get-contract-upgrade",
                        ].includes(capability.id),
                ).toBe(true);
            }
        }
    }
    expect(tools).toBe(58);
});
