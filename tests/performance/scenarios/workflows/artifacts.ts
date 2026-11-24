import { configureRepository } from "../../../integration/instance/repository/initializationClient";
import { repositoryApi } from "../../../integration/instance/repository/client";
import { registryCalls, registrySession } from "../repository/client";
import { scenarioClient } from "../../harness/clients/session";
import { admitWorkflowManifest } from "@bernouy/workflows/manifest";
import { workflowDocument } from "./fixture";
import { assertCondition, requireRecord } from "../queries/types";
import type { WorkflowContext } from "./context";
export async function workflowArtifact(context: WorkflowContext) {
    const environment = context.environment;
    const namespace = `performance-${crypto.randomUUID().replaceAll("-", "")}`;
    const release = context.inventory.targets.find(
        (target) => !target.retained && target.release.contractId === "ulvia/cms.content",
    )!.release;
    const admission = admitWorkflowManifest(
        JSON.stringify({
            kind: "workflow",
            format: "ulvia-workflow-manifest/v1",
            workflowId: `${namespace}/workflow`,
            publisherId: namespace,
            version: "1.0.0",
            name: "Performance workflow",
            requirements: [
                {
                    contractId: release.contractId,
                    versionRange: `^${release.version}`,
                    capabilityIds: ["site.get"],
                    eventIds: [],
                },
            ],
            definition: await workflowDocument(context),
        }),
    );
    const account = await repositoryApi(environment.registry.origin).signup(
        `${namespace}@performance.test`,
        `Fixture-${crypto.randomUUID()}!`,
    );
    const registry = registryCalls(
        scenarioClient(context.inventory, registrySession(environment.registry.origin, account.cookie)),
    );
    const owned = await registry.fixture("namespace-claim", { namespace });
    const scope = { namespace, namespaceRevision: owned.revision };
    const upload = await registry.fixture("publication-begin", {
        ...scope,
        manifest: new TextEncoder().encode(admission.canonicalJson),
    });
    const committed = await registry.fixture("artifacts.commit", { ...scope, uploadId: upload.uploadId });
    assertCondition(
        committed.digest === admission.digest && committed.kind === "workflow",
        "workflow-artifact-publication",
    );
    await configureRepository(context.fresh.site.url, context.fresh.site.administrator, environment.registry.origin);
    const found = await context.fresh.fixture(
        "repository.artifacts.search",
        { query: admission.manifest.workflowId, kinds: ["workflow"], limit: 10 },
        "ulvia/cms.installations",
    );
    assertCondition(Array.isArray(found.results));
    const row = found.results
        .map(requireRecord)
        .find((value) => requireRecord(value.reference).digest === admission.digest);
    assertCondition(row && typeof row.repositoryId === "string", "workflow-artifact-discovery");
    return {
        repositoryId: row.repositoryId,
        publisherId: namespace,
        workflowId: admission.manifest.workflowId,
        version: admission.manifest.version,
        digest: admission.digest,
    };
}
