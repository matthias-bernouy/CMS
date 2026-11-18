import { repositoryApi } from "../../../../integration/instance/repository/client";
import { bootstrapDataset, datasetPublisher } from "../datasets";
import { assertCondition } from "../../queries/types";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";
import type { Dataset } from "../datasets";

async function workflowPublisher(inventory: CapabilityInventory, environment: QueryEnvironment) {
    const implementation = inventory.targets.find(
        (row) => !row.retained && row.release.contractId === "ulvia/cms.content",
    )!.release;
    const pat = await repositoryApi(environment.registry.origin).pat(environment.registry.cookie);
    const publish = await datasetPublisher(environment.registry.origin, pat.token);
    const one = (name: string, pages = 1, version = "1.0.0") =>
        bootstrapDataset(implementation, name, pages, [], version).then(publish);
    const cached = new Map<string, Promise<readonly Dataset[]>>();
    let changes = 0;
    return async (name: "one" | "25-pages" | "large" | "history" | "changed") => {
        if (name === "changed") {
            assertCondition(changes < 32);
            return [await one(`workflow-change-${++changes}`)];
        }
        let pending = cached.get(name);
        if (!pending) {
            pending = (async () => {
                if (name === "one" || name === "25-pages") {
                    return [await one(`workflow-${name}`, name === "one" ? 1 : 25)];
                }
                const entries: Dataset[] = [];
                for (let index = 0; index < 16; index++) {
                    entries.push(
                        await one(
                            name === "history" ? "workflow-history" : `workflow-large-${index}`,
                            1,
                            name === "history" ? `1.${index}.0` : "1.0.0",
                        ),
                    );
                }
                return entries;
            })();
            cached.set(name, pending);
        }
        return pending;
    };
}

export function workflowDatasets(inventory: CapabilityInventory) {
    const environments = new WeakMap<QueryEnvironment, ReturnType<typeof workflowPublisher>>();
    return async (
        environment: QueryEnvironment,
        name: Parameters<Awaited<ReturnType<typeof workflowPublisher>>>[0],
    ) => {
        let publisher = environments.get(environment);
        if (!publisher) {
            publisher = workflowPublisher(inventory, environment);
            environments.set(environment, publisher);
        }
        return (await publisher)(name);
    };
}
