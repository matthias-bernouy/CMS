import { expect, test } from "bun:test";
import { loadSystemArtifacts } from "../../../../src/runtime/instances/system/artifacts";
import { systemUpgradePlan } from "../../../../src/runtime/instances/system/execution/upgradePlan";
import { repositoryFixture } from "../../../provider-contracts/official/fixture";

test("system upgrades close transitive implementation dependencies through inherited Emailer capabilities", async () => {
    const artifacts = await loadSystemArtifacts((await repositoryFixture()).providers);
    const source = {
        ...artifacts.plan,
        contracts: artifacts.plan.contracts.filter(({ contractId }) => contractId === "ulvia/cms.access"),
    };
    const target = systemUpgradePlan(source, artifacts);
    expect(target.contracts.map(({ contractId }) => contractId)).toEqual([
        "ulvia/cms.access",
        "ulvia/cms.email-templates",
        "ulvia/cms.emailer.smtp",
        "ulvia/cms.events",
        "ulvia/cms.forms",
        "ulvia/cms.secrets",
    ]);
    const withoutTemplates = {
        ...artifacts,
        contracts: artifacts.contracts.filter(({ release }) => release.contractId !== "ulvia/cms.email-templates"),
    };
    expect(() => systemUpgradePlan(source, withoutTemplates)).toThrow("unavailable or ambiguous");
    const incompatible = {
        ...artifacts,
        manifest: {
            ...artifacts.manifest,
            requires: [
                {
                    contractId: "ulvia/cms.email-templates",
                    capabilityId: "templates.render",
                    versionRange: "^99.0.0",
                    optional: false,
                },
            ],
        },
    };
    expect(() => systemUpgradePlan(source, incompatible)).toThrow("unavailable or ambiguous");
    expect(source.contracts).toHaveLength(1);
    const optional = {
        ...artifacts,
        manifest: {
            ...artifacts.manifest,
            requires: [
                {
                    contractId: "ulvia/cms.hosting",
                    capabilityId: "instances.create",
                    versionRange: "^1.0.0",
                    optional: true,
                },
            ],
        },
    };
    expect(systemUpgradePlan(source, optional)).toEqual(target);
});
