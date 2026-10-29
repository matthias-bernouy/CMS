import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { commandCacheEffect } from "../../src/runtime/resources/cache/commandPolicy";

test("every official command has a deliberate cache classification; logs and authentication do not purge", async () => {
    const root = resolve(import.meta.dir, "../../../../official-repository/contracts");
    let count = 0;
    for await (const path of new Bun.Glob("**/capabilities/**/*.json").scan({ cwd: root })) {
        const capability = await Bun.file(resolve(root, path)).json();
        if (capability.behavior?.effect !== "command") {
            continue;
        }
        const contractId = path.split("/")[0]!;
        expect(commandCacheEffect(contractId, capability.id), `${contractId}/${capability.id}`).not.toBeNull();
        count++;
    }
    expect(count).toBeGreaterThan(50);
    expect(commandCacheEffect("ulvia.cms.observability", "logs.append")).toBe("neutral");
    expect(commandCacheEffect("ulvia.cms.access", "login-password")).toBe("neutral");
    expect(commandCacheEffect("ulvia.cms.files", "files.make-private")).toBe("purge");
    expect(commandCacheEffect("ulvia.cms.content", "pages.publish")).toBe("purge");
    expect(commandCacheEffect("ulvia.cms.content", "future-command")).toBeNull();
});
