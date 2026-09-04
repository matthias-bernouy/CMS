import type { IntegrationPackageSource } from "@bernouy/cms-integration-packages";
import { HttpIntegrationPackageSource } from "@bernouy/cms-integration-packages/http";
import {
    isIntegrationDefinitionVersionInstallable,
    type IntegrationDefinitionRepository,
    type IntegrationDefinitionVersion,
} from "@bernouy/cms-integrations";
import { HttpIntegrationDefinitionRepository } from "@bernouy/cms-integrations/http";
import { parseStrictJsonDocument } from "@bernouy/cms-integration-packages";
import type { PulledPackage } from "./local";
import { parseReviewedSchemaBaselines } from "./reviewed-schema";

const MAX_SCHEMA_BASELINES_BYTES = 16 * 1_024 * 1_024;

export const DEFAULT_REPOSITORY_URL = "https://repo.cms.ulvia.fr/.cms/repository";

export class RemoteIntegrationRepository {
    private readonly definitions: IntegrationDefinitionRepository;
    private readonly packages: IntegrationPackageSource;
    private readonly fetchImpl: typeof fetch;

    constructor(
        readonly url: string,
        fetchImpl?: typeof fetch,
    ) {
        this.fetchImpl = fetchImpl ?? fetch;
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
        return (await this.versionEntries(kind))
            .filter(isIntegrationDefinitionVersionInstallable)
            .map(({ version }) => version);
    }

    async versionEntries(kind: string): Promise<readonly IntegrationDefinitionVersion[]> {
        return await this.definitions.listVersions(kind);
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
        const target = { kind, version, packageDigest: resolved.digest };
        const reviewedSchemaBaselines = parseReviewedSchemaBaselines(await this.fetchSchemaBaselines(target), target);
        return { package: resolved, definition, reviewedSchemaBaselines, source: this.url };
    }

    private async fetchSchemaBaselines(target: {
        kind: string;
        version: string;
        packageDigest: string;
    }): Promise<unknown> {
        const endpoint = new URL(`${this.url.replace(/\/$/u, "")}/api/integrations/schema-baselines`);
        endpoint.search = new URLSearchParams(target).toString();
        const response = await this.fetchImpl(endpoint, { headers: { accept: "application/json" } });
        if (!response.ok) {
            throw new Error(
                `Repository reviewed schema baselines for ${target.kind}@${target.version} returned HTTP ${response.status}`,
            );
        }
        const declaredLength = Number(response.headers.get("content-length"));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_SCHEMA_BASELINES_BYTES) {
            throw new Error("Repository reviewed schema baseline response is too large");
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength > MAX_SCHEMA_BASELINES_BYTES) {
            throw new Error("Repository reviewed schema baseline response is too large");
        }
        return parseStrictJsonDocument(bytes, MAX_SCHEMA_BASELINES_BYTES);
    }
}
