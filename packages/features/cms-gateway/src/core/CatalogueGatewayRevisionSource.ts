import type {
    ContractSelectionDependencySource,
    ContractSelectionStore,
} from "@bernouy/cms-repository/providers/selections";
import type { GatewayRouteRevisionSource } from "../interfaces/Invocation";
import { GatewayError } from "./GatewayError";

/** Fences route reads against both dependency and selection revisions. */
export class CatalogueGatewayRevisionSource implements GatewayRouteRevisionSource {
    constructor(
        readonly selections: ContractSelectionStore,
        readonly dependencies: ContractSelectionDependencySource,
    ) {}

    async capture(siteId: string): Promise<string> {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const dependencyRevision = this.dependencies.revision
                ? await this.dependencies.revision(siteId)
                : (await this.dependencies.capture(siteId)).revision;
            const selection = await this.selections.get(siteId);
            const revision = JSON.stringify([dependencyRevision, selection?.revision ?? 0]);
            if (await this.isCurrent(siteId, revision)) {
                return revision;
            }
        }
        throw new GatewayError("stale_route", "site route changed during revision capture");
    }

    async isCurrent(siteId: string, revision: string): Promise<boolean> {
        if (revision.length > 512) {
            return false;
        }
        let decoded: unknown;
        try {
            decoded = JSON.parse(revision);
        } catch {
            return false;
        }
        if (
            !Array.isArray(decoded) ||
            decoded.length !== 2 ||
            typeof decoded[0] !== "string" ||
            !Number.isSafeInteger(decoded[1]) ||
            decoded[1] < 0
        ) {
            return false;
        }
        const current = await this.selections.get(siteId);
        return (current?.revision ?? 0) === decoded[1] && this.dependencies.isCurrent(siteId, decoded[0]);
    }
}
