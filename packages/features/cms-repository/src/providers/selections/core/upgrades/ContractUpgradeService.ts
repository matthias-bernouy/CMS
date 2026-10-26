import { parseContractSelections } from "../parseContractSelections";
import type {
    ContractSelectionStore,
    ContractSelectionDependencySource,
    CapabilityGrantPolicy,
} from "../../interfaces/ContractSelectionStore";
import type { ContractUpgradeAnalysis } from "../../interfaces/ContractUpgrade";
import type { ContractSelection } from "../../interfaces/ContractSelection";
import type { SiteUpgradeStorage, SiteUpgradeIntent } from "cms-repository/site-upgrades/interfaces";
import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
import { runSiteUpgrade } from "cms-repository/site-upgrades/run";
import { prepareContractUpgrade } from "./plan";

type ContractUpgradePayload = Readonly<{ selections: readonly ContractSelection[]; grants: CapabilityGrantPolicy }>;

export class ContractUpgradeService {
    constructor(
        private readonly store: ContractSelectionStore,
        private readonly dependencies: ContractSelectionDependencySource,
        private readonly storage: SiteUpgradeStorage,
        private readonly analysis: ContractUpgradeAnalysis,
    ) {}
    plan(siteId: string, selections: unknown, grants?: CapabilityGrantPolicy) {
        return prepareContractUpgrade(siteId, selections, grants, this.store, this.dependencies, this.analysis);
    }
    async apply(siteId: string, selections: unknown, grants: CapabilityGrantPolicy | undefined, planDigest: string) {
        const id = await catalogueRevision({ siteId, kind: "contracts", planDigest });
        const existing = await this.storage.get<ContractUpgradePayload>(siteId, id, "contracts");
        if (existing) {
            if (
                (await catalogueRevision(parseContractSelections(selections))) !==
                    (await catalogueRevision(existing.payload.selections)) ||
                (grants !== undefined &&
                    (await catalogueRevision(grants)) !== (await catalogueRevision(existing.payload.grants)))
            ) {
                throw conflict("Upgrade retry changed its reviewed targets or grants");
            }
            return this.run(existing);
        }
        const plan = await this.plan(siteId, selections, grants);
        if (plan.status !== "applicable" || plan.planDigest !== planDigest) {
            throw conflict("The contract upgrade plan is stale, blocked or incomplete");
        }
        const current = await this.store.get(siteId);
        const intent = await this.storage.begin({
            id,
            kind: "contracts",
            siteId,
            planDigest,
            expectedRevision: plan.expectedRevision,
            sourceStateDigest: await stateDigest(current),
            targetStateDigest: await catalogueRevision({
                revision: plan.expectedRevision + 1,
                selections: plan.selections,
                grants: plan.grants,
            }),
            payload: { selections: plan.selections, grants: plan.grants },
            status: "prepared",
            createdAt: new Date().toISOString(),
        });
        return this.run(intent);
    }
    get(siteId: string, id: string) {
        return this.storage.get<ContractUpgradePayload>(siteId, id, "contracts");
    }
    async resume(siteId: string, id: string) {
        const intent = await this.storage.get<ContractUpgradePayload>(siteId, id, "contracts");
        if (!intent) {
            throw Object.assign(new Error("Contract upgrade not found"), { status: 404 });
        }
        return this.run(intent);
    }
    private run(intent: SiteUpgradeIntent<ContractUpgradePayload>) {
        return runSiteUpgrade(this.storage, intent, {
            validatePrepared: async (current) => {
                const plan = await this.plan(current.siteId, current.payload.selections, current.payload.grants);
                return plan.status === "applicable" && plan.planDigest === current.planDigest;
            },
            stateDigest: async () => stateDigest(await this.store.get(intent.siteId)),
            commit: async (current, assertLease) => {
                await assertLease();
                return this.store.replace(
                    current.siteId,
                    current.payload.selections,
                    current.expectedRevision,
                    current.payload.grants,
                );
            },
        });
    }
}
async function stateDigest(current: Awaited<ReturnType<ContractSelectionStore["get"]>>) {
    return catalogueRevision({
        revision: current?.revision ?? 0,
        selections: current?.plan.selections ?? [],
        grants: current?.grants ?? { default: "allow-selected", denied: [] },
    });
}
function conflict(message: string): Error {
    return Object.assign(new Error(message), { status: 409 });
}
