import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    canonicalJsonBytes,
    sha256Hex,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageSource,
} from "@bernouy/cms-integration-packages";
import type {
    IntegrationDefinition,
    IntegrationDefinitionIndex,
    IntegrationDefinitionRepository,
} from "@bernouy/cms-integrations";
import { RepositoryCms } from "@bernouy/cms-repository";
import { BunRunner } from "@bernouy/http-runner";
import { createLocalIntegrationServices } from "../../../src/commands/dev/integrations";

const KIND = "remote-only-cli-global-mode";
const VERSION = "7.6.5";
const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
    await Promise.all(cleanup.splice(0).map((stop) => stop()));
});

describe("CLI global repository consumption", () => {
    test("reads remote-only definitions and packages from the configured repository", async () => {
        const siteDir = await mkdtemp(join(tmpdir(), "p9r-global-repository-"));
        const runner = new BunRunner();
        const authorizations: Array<string | null> = [];
        runner.use(async (request, next) => {
            authorizations.push(request.headers.get("authorization"));
            return await next();
        });
        runner.group("/.cms/repository", (repositoryRunner) => {
            new RepositoryCms({
                runner: repositoryRunner,
                integrationCatalog: remoteCatalog(),
                integrationPackages: awaitablePackageSource(),
                packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
            });
        });
        runner.start(0);
        cleanup.push(async () => {
            runner.stop();
            await rm(siteDir, { recursive: true, force: true });
        });
        const repositoryUrl = `${origin(runner)}/.cms/repository`;
        const services = await createLocalIntegrationServices(siteDir, repositoryUrl, {} as never);

        expect(await services.integrationCatalog.list()).toEqual([
            expect.objectContaining({ kind: KIND, versions: [VERSION] }),
        ]);
        expect(await services.integrationCatalog.get(KIND, VERSION)).toMatchObject({
            kind: KIND,
            version: VERSION,
        });
        expect((await services.integrationPackageSource.getPackage(KIND, VERSION))?.envelope.kind).toBe(KIND);
        expect(authorizations.length).toBeGreaterThan(0);
        expect(authorizations.every((authorization) => authorization === null)).toBeTrue();
    });
});

function remoteCatalog(): IntegrationDefinitionRepository {
    const definition: IntegrationDefinition = { kind: KIND, label: "Remote CLI fixture", version: VERSION, inputs: [] };
    const index: IntegrationDefinitionIndex = {
        schema: "cms.integration.index.v1",
        kind: KIND,
        label: definition.label,
        stable: VERSION,
        latest: VERSION,
        versions: [
            { version: VERSION, path: `versions/${VERSION}`, definition: `versions/${VERSION}/definition.json` },
        ],
    };
    return {
        async list() {
            return [{ ...index, versions: [VERSION] }];
        },
        async getIndex(kind) {
            return kind === KIND ? index : null;
        },
        async listVersions(kind) {
            return kind === KIND ? index.versions : [];
        },
        async get(kind, version) {
            return kind === KIND && (!version || version === VERSION) ? definition : null;
        },
    };
}

function awaitablePackageSource(): IntegrationPackageSource {
    const definition: IntegrationDefinition = { kind: KIND, label: "Remote CLI fixture", version: VERSION, inputs: [] };
    const envelope: IntegrationPackageEnvelopeV1 = {
        schema: "cms.integration.package.v1",
        kind: KIND,
        version: VERSION,
        definition: "definition.json",
        releaseNotes: "README.md",
        files: {
            "README.md": { encoding: "utf8", content: "# Remote CLI fixture\n" },
            "definition.json": { encoding: "utf8", content: JSON.stringify(definition) },
        },
    };
    const canonicalBytes = canonicalJsonBytes(envelope);
    return {
        async getPackage(kind, version) {
            return kind === KIND && version === VERSION
                ? { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) }
                : null;
        },
    };
}

function origin(runner: BunRunner): string {
    if (!runner.port) {
        throw new Error("CLI repository fixture did not start");
    }
    return `http://127.0.0.1:${runner.port}`;
}
