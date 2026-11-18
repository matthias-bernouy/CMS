import { budgetFor } from "../../../capabilities/policies";
import { scenarioClient } from "../../../harness/clients/session";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { ClientFailure } from "../../../harness/clients/failure";
import { cleanupNamespace } from "../../../harness/docker/cleanup/namespace";
import { sampleScenario } from "../../../harness/execution/samples";
import { assertCondition } from "../../queries/types";
import { fileCalls } from "../client";
import { namespaceReadState } from "./state/namespace";
import { prepareNamespaceRead } from "./recipe";
import { runWorkspaceRead } from "./workspace/run";
import type { CapabilityInventory, ScenarioDefinition, ScenarioResult, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

export function fileReadScenarios(inventory: CapabilityInventory, fixture: string) {
    return [
        "files.get",
        "files.list",
        "files.read",
        "namespace.get",
        "representations.list",
        "representations.read",
        "workspace.get",
    ].flatMap((capability) => {
        const target = inventory.targets.find(
            (row) => !row.retained && row.release.contractId === "ulvia/cms.files" && row.definition.id === capability,
        );
        assertCondition(target, "file-reader-inventory-stale");
        const variants: readonly Variant[] = ["files.list", "representations.list"].includes(capability)
            ? ["large", "history", "invalidation"]
            : ["invalidation"];
        return target.definition.bindings.flatMap(({ id: binding }) =>
            variants.map((variant) => {
                const definition = {
                    id: `files-read.lifecycle.${capability}.${binding}.${variant}`,
                    version: capability === "files.list" ? 2 : 1,
                    fixture,
                    samples: 10,
                    obligations: [{ target: target.key, binding, variant }],
                    budget: budgetFor(target, variant),
                };
                return {
                    definition,
                    execute: (environment: QueryEnvironment) =>
                        capability === "workspace.get"
                            ? runWorkspaceRead(inventory, environment, definition, binding)
                            : runNamespaceRead(inventory, environment, definition, capability, variant),
                };
            }),
        );
    });
}

async function runNamespaceRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    definition: ScenarioDefinition,
    capability: string,
    profile: string,
): Promise<ScenarioResult> {
    const state = namespaceReadState(
        fileCalls(scenarioClient(inventory, environment.main)),
        environment.main.origin,
        capability.startsWith("representations."),
        (credentials, name) => cleanupNamespace(environment.stack, "files", credentials, name),
    );
    let result: ScenarioResult = {
        scenario: definition.id,
        status: "blocked",
        failure: "file-reader-preparation",
        measurements: [],
    };
    try {
        assertCondition(environment.isolationSite, "file-reader-isolation-site-missing");
        const other = fileCalls(scenarioClient(inventory, await environment.isolationSite()));
        await state.initialize(profile, capability);
        result = await sampleScenario(environment.stack, definition, definition.obligations[0]!, (index) =>
            prepareNamespaceRead(state, capability, profile, index, other, () => {
                const input = {
                    ...state.credentials,
                    filename: "invalid-file.png",
                    size: 0,
                    contentType: "image/png",
                    visibility: "public",
                };
                return expectBodyRefusal(
                    inventory,
                    environment.main,
                    "ulvia/cms.files",
                    "upload.create",
                    input,
                    { ...input, unexpectedPerformanceField: true },
                    400,
                );
            }),
        );
    } catch (error) {
        result = {
            ...result,
            status: "blocked",
            failure: error instanceof ClientFailure ? error.code : "file-reader-preparation",
        };
    } finally {
        try {
            await state.close();
        } catch {
            result = { ...result, status: "blocked", failure: "file-reader-cleanup" };
        }
    }
    return result;
}
