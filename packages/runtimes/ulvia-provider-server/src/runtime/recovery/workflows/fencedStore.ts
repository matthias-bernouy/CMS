import { withSiteWriteFence } from "@bernouy/repository/upgrades";
import type { SiteUpgradeStorage } from "@bernouy/repository/upgrades";
import { WorkflowError, inspectWorkflowPlan } from "@bernouy/workflows";
import type { WorkflowServices, WorkflowStore, WorkflowPlan } from "@bernouy/workflows";
/** Coordinate local publication with maintenance. Remote resource changes remain independent. */
export function fencedWorkflowStore(
    store: WorkflowStore,
    services: WorkflowServices,
    fence: SiteUpgradeStorage,
    siteId: string,
): WorkflowStore {
    const currentPlan = async (plan: WorkflowPlan) => {
        const diagnostic = await inspectWorkflowPlan(plan, services.contracts);
        if (diagnostic) {
            throw new WorkflowError("INVALID_DEFINITION", diagnostic.path);
        }
    };
    const verify = async (workflowId: string, revision: number) => {
        const plan = await store.plan(workflowId, revision);
        if (!plan) {
            throw new WorkflowError("INVALID_STATE");
        }
        await currentPlan(plan);
    };
    const guarded = new Proxy(store, {
        get(target, property) {
            if (property === "publish") {
                return async (...args: Parameters<WorkflowStore["publish"]>) => {
                    await currentPlan(args[2]);
                    return target.publish(...args);
                };
            }
            if (property === "publishInstalledPlan") {
                return async (...args: Parameters<WorkflowStore["publishInstalledPlan"]>) => {
                    await currentPlan(args[3]);
                    return target.publishInstalledPlan(...args);
                };
            }
            if (property === "createRun") {
                return async (...args: Parameters<WorkflowStore["createRun"]>) => {
                    await verify(args[0].workflowId, args[0].workflowRevision);
                    return target.createRun(...args);
                };
            }
            if (property === "acceptEvent") {
                return async (...args: Parameters<WorkflowStore["acceptEvent"]>) => {
                    if (args[2]) {
                        await verify(args[2].workflowId, args[2].workflowRevision);
                    }
                    return target.acceptEvent(...args);
                };
            }
            if (property === "createTrigger") {
                return async (...args: Parameters<WorkflowStore["createTrigger"]>) => {
                    await verify(args[0].workflowId, args[0].workflowRevision);
                    return target.createTrigger(...args);
                };
            }
            if (property === "updateTrigger") {
                return async (...args: Parameters<WorkflowStore["updateTrigger"]>) => {
                    if (args[0].state === "preparing" || args[0].state === "active") {
                        await verify(args[0].workflowId, args[0].workflowRevision);
                    }
                    return target.updateTrigger(...args);
                };
            }
            const value = Reflect.get(target, property, target);
            return typeof value === "function" ? value.bind(target) : value;
        },
    });
    const mutations = [
        "createDraft",
        "updateDraft",
        "publish",
        "retire",
        "publishInstalledPlan",
        "confirmInstalledPlan",
        "retireInstalledPlans",
        "createRun",
        "acceptEvent",
        "checkpoint",
        "createTrigger",
        "updateTrigger",
    ];
    return withSiteWriteFence(guarded, fence, siteId, mutations, mutations);
}
