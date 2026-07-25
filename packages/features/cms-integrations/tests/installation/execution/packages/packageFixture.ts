import {
    InMemoryIntegrationInstallationRepository,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployContext,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
    type IntegrationPackageResolver,
    type ResolveIntegrationPackageRequest,
    type ResolvedIntegrationPackageRoot,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { rerunDefinition } from "../definitions";

export const FIRST_DIGEST = "a".repeat(64);
export const SECOND_DIGEST = "b".repeat(64);
export const FIRST_PACKAGE_ROOT = "/cache/objects/sha256/first";
export const SECOND_PACKAGE_ROOT = "/cache/objects/sha256/second";

export function packageLifecycleContext() {
    return {
        sources: new InMemorySourceRepository(),
        secrets: new InMemorySecretStore(),
        installations: new InMemoryIntegrationInstallationRepository(),
    };
}

export function connectorDefinition(version: string, targetUrl: string): IntegrationDefinition {
    return {
        ...rerunDefinition(version, targetUrl),
        connectors: [
            {
                provider: "capture",
                root: "connectors/capture",
                dataApiSchemas: [],
                schemas: [],
                functions: [],
            },
        ],
    };
}

export function resolvedPackage(
    definition: IntegrationDefinition,
    digest: string,
    root: string,
): ResolvedIntegrationPackageRoot {
    return {
        root,
        kind: definition.kind,
        version: definition.version as string,
        digest,
        definition: structuredClone(definition),
    };
}

export class RecordingPackageResolver implements IntegrationPackageResolver {
    readonly requests: ResolveIntegrationPackageRequest[] = [];

    constructor(
        private readonly handler: (
            request: ResolveIntegrationPackageRequest,
        ) => ResolvedIntegrationPackageRoot | Promise<ResolvedIntegrationPackageRoot>,
    ) {}

    async resolve(request: ResolveIntegrationPackageRequest): Promise<ResolvedIntegrationPackageRoot> {
        this.requests.push(structuredClone(request));
        return await this.handler(request);
    }
}

export class CapturingConnectorDeployer implements IntegrationConnectorDeployer {
    readonly provider = "capture";
    readonly calls: Array<{
        deployment: IntegrationConnectorDeployment;
        context: IntegrationConnectorDeployContext;
    }> = [];

    async deploy(
        deployment: IntegrationConnectorDeployment,
        context: IntegrationConnectorDeployContext,
    ): Promise<{ provider: string }> {
        this.calls.push({ deployment: structuredClone(deployment), context: structuredClone(context) });
        return { provider: this.provider };
    }
}
