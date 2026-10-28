import { delegationKey } from "../authority/inventory";
import { grantedAuthority } from "../authority/grants";
import type { SelectionAuthority } from "../../interfaces/SelectionAuthority";
import type {
    ContractSelectionStore,
    ContractSelectionDependencySource,
    CapabilityGrantPolicy,
} from "../../interfaces/ContractSelectionStore";
import type {
    ContractUpgradeAnalysis,
    ContractUpgradeIssue,
    ContractUpgradePlan,
} from "../../interfaces/ContractUpgrade";
import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
import { parseContractSelections } from "../graph/parseContractSelections";
import { parseCapabilityGrants } from "../grants";
import { planContractSelections } from "../graph/planContractSelections";
import { validateCapabilityUsage } from "./requirements";

export async function prepareContractUpgrade(
    siteId: string,
    value: unknown,
    proposedGrants: CapabilityGrantPolicy | undefined,
    store: ContractSelectionStore,
    dependencies: ContractSelectionDependencySource,
    analysis: ContractUpgradeAnalysis,
): Promise<ContractUpgradePlan> {
    const selections = parseContractSelections(value);
    const [current, context, usage] = await Promise.all([
        store.get(siteId),
        dependencies.capture(siteId),
        analysis.usage(siteId),
    ]);
    const source = current?.plan.selections ?? [];
    const grants = parseCapabilityGrants(
        proposedGrants ?? current?.grants ?? { default: "allow-selected", denied: [] },
    );
    const issues: ContractUpgradeIssue[] = usage.unknown.map((message) => ({
        code: "incomplete",
        location: "usage",
        message,
    }));
    if (!usage.complete) {
        issues.push({ code: "incomplete", location: "usage", message: "Site capability usage is incomplete" });
    }
    for (const id of analysis.protectedContracts ?? []) {
        const old = source.find(({ contractId }) => contractId === id);
        const target = selections.find(({ contractId }) => contractId === id);
        if (old && JSON.stringify(old) !== JSON.stringify(target)) {
            issues.push({
                code: "protected-selection",
                location: `contract:${id}`,
                message: "This control selection requires an explicit Provider profile transition",
            });
        }
    }
    let authority: SelectionAuthority = { providers: [], capabilities: [], machine: [], delegated: [] };
    try {
        const graph = await planContractSelections(siteId, selections, context);
        authority = grantedAuthority(graph.authority, grants);
        issues.push(
            ...(await validateCapabilityUsage(usage, selections, source, grants, graph.dependencies, context.releases)),
        );
    } catch (error) {
        issues.push({
            code: "invalid-graph",
            location: "selections",
            message: error instanceof Error ? error.message : "Invalid target graph",
        });
    }
    const pins = [
        ...new Map([...source, ...selections].map((selection) => [JSON.stringify(selection), selection])).values(),
    ];
    const served: Record<string, string> = {};
    for (const selection of pins) {
        const evidence = await analysis.served(selection);
        const key = `${selection.installationId}:${selection.contractId}@${selection.version}`;
        served[key] = evidence.revision;
        if (!evidence.available) {
            issues.push({
                code: "release-not-served",
                location: key,
                message: "Source and target releases must be served concurrently during a switch",
            });
        }
    }
    const afterUsage = await analysis.usage(siteId);
    if (
        afterUsage.revision !== usage.revision ||
        !(await dependencies.isCurrent(siteId, context.revision)) ||
        (await store.get(siteId))?.revision !== current?.revision
    ) {
        issues.push({
            code: "incomplete",
            location: "site",
            message: "Site or Provider state changed during upgrade analysis",
        });
    }
    for (const selection of pins) {
        const key = `${selection.installationId}:${selection.contractId}@${selection.version}`;
        if ((await analysis.served(selection)).revision !== served[key]) {
            issues.push({
                code: "incomplete",
                location: key,
                message: "Provider release readiness changed during analysis",
            });
        }
    }
    const prior = current ? grantedAuthority(current.plan.authority, current.grants) : null;
    const priorAuthority = new Set(prior?.delegated.map((entry) => delegationKey(prior, entry)) ?? []);
    const result = {
        siteId,
        authority,
        authorityAdded: authority.delegated.filter((entry) => !priorAuthority.has(delegationKey(authority, entry))),
        status: issues.some(({ code }) => code === "incomplete")
            ? ("incomplete" as const)
            : issues.length
              ? ("blocked" as const)
              : ("applicable" as const),
        expectedRevision: current?.revision ?? 0,
        source,
        selections,
        grants,
        issues,
        usageRevision: usage.revision,
        dependencyRevision: context.revision,
        served,
    };
    return { ...result, planDigest: await catalogueRevision(result) };
}
