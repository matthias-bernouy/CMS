import { expect, test } from "bun:test";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { commandCacheEffect } from "../../src/runtime/resources/cache/commandPolicy";

test("every official command has a deliberate cache classification; logs and authentication do not purge", async () => {
    let count = 0;
    for (const { release } of (await compileOfficialFeatures()).contracts) {
        for (const capability of release.capabilities) {
            if (capability.behavior.effect !== "command") {
                continue;
            }
            expect(
                commandCacheEffect(release.contractId, capability.id),
                `${release.contractId}/${capability.id}`,
            ).not.toBeNull();
            count++;
        }
    }
    expect(count).toBeGreaterThan(50);
    expect(commandCacheEffect("ulvia/cms.observability", "logs.append")).toBe("neutral");
    expect(commandCacheEffect("ulvia/cms.access", "login-password")).toBe("neutral");
    expect(commandCacheEffect("ulvia/cms.files", "files.make-private")).toBe("purge");
    expect(commandCacheEffect("ulvia/cms.content", "pages.publish")).toBe("purge");
    expect(commandCacheEffect("ulvia/cms.content", "future-command")).toBeNull();
});
