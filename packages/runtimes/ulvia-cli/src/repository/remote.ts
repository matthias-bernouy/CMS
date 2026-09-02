import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import type { PulledPackage } from "./local";

export const DEFAULT_REPOSITORY_URL = "https://repo.cms.ulvia.fr/.cms/repository";

export class RemoteIntegrationRepository {
    private readonly definitions: IntegrationDefinitionRepository;
    private readonly packages: IntegrationPackageSource;

    constructor(
        readonly url: string,
        fetchImpl?: typeof fetch,
    ) {
        this.definitions = new HttpIntegrationDefinitionRepository({
            baseUrl: url,
            ...(fetchImpl ? { fetch: fetchImpl } : {}),
        });
        this.packages = new HttpIntegrationPackageSource({
            baseUrl: url,
            ...(fetchImpl ? { fetch: fetchImpl } : {}),
        });
    }

    async list(): Promise<readonly { kind: string; versions: readonly string[] }[]> {
        return await this.definitions.list();
    }

    async versions(kind: string): Promise<readonly string[]> {
        return (await this.definitions.listVersions(kind)).map(({ version }) => version);
    }

    async defaultVersion(kind: string): Promise<string> {
        const index = await this.definitions.getIndex(kind);
        if (!index) {
            throw new Error(`Integration ${kind} does not exist in ${this.url}`);
        }
        const version = index.latest ?? index.stable;
        if (!version) {
            throw new Error(`Integration ${kind} has no published channel in ${this.url}`);
        }
        return version;
    }

    async pull(kind: string, version: string): Promise<PulledPackage> {
        const [definition, resolved] = await Promise.all([
            this.definitions.get(kind, version),
            this.packages.getPackage(kind, version),
        ]);
        if (!definition || !resolved) {
            throw new Error(`Integration package ${kind}@${version} does not exist in ${this.url}`);
        }
        return { package: resolved, definition, source: this.url };
    }
}
