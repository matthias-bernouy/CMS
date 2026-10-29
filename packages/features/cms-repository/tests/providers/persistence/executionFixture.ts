import type { Db } from "mongodb";
import { deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import { planContractSelections, type StoredContractSelections } from "@bernouy/cms-repository/providers/selections";
import type { StoredProviderInstallation } from "@bernouy/cms-repository/providers/installations";
import { MongoProviderExecutionStateReader } from "@bernouy/cms-repository/providers/mongo";
import { graphFixture, siteId } from "../selections/fixtures";

export async function executionFixture() {
    const graph = await graphFixture();
    const plan = await planContractSelections(siteId, [await graph.select("payment")], graph.context);
    const model = {
        selection: deepFreeze({
            siteId,
            revision: 1,
            dependencyRevision: "initial",
            grants: { default: "allow-selected", denied: [] },
            plan,
        }) as StoredContractSelections | null,
        installation: deepFreeze({
            installation: graph.installation,
            revision: 1,
        }) as StoredProviderInstallation | null,
        commands: 0,
        payloads: 0,
        unavailable: false,
        mutateOnPayload: () => {},
        beforeSelectionRead: () => {},
        beforeSelectionPayload: async () => {},
        beforeInstallationPayload: async () => {},
        mutateHeaders: (headers: {
            current: { revision: number }[];
            installations: { _id: string; revision: number }[];
        }) => headers,
        pipeline: [] as Record<string, unknown>[],
    };
    const db = {
        collection: () => ({
            aggregate: (pipeline: Record<string, unknown>[]) => ({
                next: async () => {
                    model.commands++;
                    model.pipeline = pipeline;
                    if (model.unavailable) {
                        throw new Error("Database unavailable");
                    }
                    const scope = pipeline[0]!.$match as { siteId: string; _id: { $in: string[] } };
                    const installations =
                        scope.siteId === siteId && scope._id.$in.includes(graph.installation.id) && model.installation
                            ? [{ _id: graph.installation.id, revision: model.installation.revision }]
                            : [];
                    model.beforeSelectionRead();
                    return model.mutateHeaders({
                        current:
                            model.selection && model.selection.siteId === scope.siteId
                                ? [{ revision: model.selection.revision }]
                                : [],
                        installations,
                    });
                },
            }),
        }),
    } as unknown as Db;
    const selections = {
        get: async () => {
            model.payloads++;
            model.mutateOnPayload();
            const record = model.selection;
            await model.beforeSelectionPayload();
            return record;
        },
    };
    const installations = {
        get: async () => {
            model.payloads++;
            model.mutateOnPayload();
            const record = model.installation;
            await model.beforeInstallationPayload();
            return record;
        },
    };
    return {
        model,
        siteId,
        installationId: graph.installation.id,
        reader: new MongoProviderExecutionStateReader(db, selections, installations),
    };
}
