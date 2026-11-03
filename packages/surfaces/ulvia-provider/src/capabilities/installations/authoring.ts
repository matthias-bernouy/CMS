import {
    CollectionPreparationError,
    NamespaceAccessError,
    type CollectionAuthoring,
} from "@bernouy/cms-repository/repository/authoring";
import { RepositoryRequestError } from "@bernouy/cms-repository/repository/publication";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../dispatch/registry";

export function registerCollectionAuthoringCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    authoring?: CollectionAuthoring,
) {
    for (const id of [
        "get-connection",
        "configure-connection",
        "disconnect-connection",
        "list-namespaces",
        "claim-namespace",
        "prepare-collection",
        "publish-collection",
        "get-collection-sources",
        "discard-preparation",
    ]) {
        dispatcher.register("ulvia.cms.authoring", id, async (input) => {
            if (!authoring) {
                throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
            }
            const request = input;
            let result: unknown;
            try {
                switch (id) {
                    case "list-namespaces":
                        result = await authoring.listNamespaces(request);
                        break;
                    case "get-connection":
                        result = await authoring.connectionStatus();
                        break;
                    case "configure-connection":
                        result = await authoring.configureConnection(required(request.token));
                        break;
                    case "disconnect-connection":
                        result = await authoring.disconnectConnection();
                        break;
                    case "claim-namespace":
                        result = await authoring.claim(required(request.namespace));
                        break;
                    case "prepare-collection":
                        try {
                            result = {
                                valid: true,
                                ...(await authoring.prepare(required(request.sourceJson))),
                            };
                        } catch (error) {
                            if (!(error instanceof CollectionPreparationError)) {
                                throw error;
                            }
                            result = {
                                valid: false,
                                diagnostics: error.diagnostics ?? [
                                    { code: "collection.invalid", severity: "error", message: error.message },
                                ],
                            };
                        }
                        break;
                    case "publish-collection":
                        result = await authoring.publish(
                            required(request.preparationId),
                            required(request.expectedDigest),
                        );
                        break;
                    case "get-collection-sources":
                        result = await authoring.sources(
                            required(request.namespace),
                            required(request.collectionId),
                            required(request.version),
                        );
                        break;
                    case "discard-preparation":
                        result = await authoring.discard(required(request.preparationId));
                        break;
                }
                return result;
            } catch (error) {
                if (error instanceof NamespaceAccessError || error instanceof RepositoryRequestError) {
                    throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
                }
                throw error;
            }
        });
    }
}

function required(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
