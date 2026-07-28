import { readFile } from "node:fs/promises";
import { BunRunner } from "@bernouy/http-runner";
import { FsIntegrationPackageSource } from "@bernouy/cms-integration-packages/fs";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { RepositoryCms } from "@bernouy/cms-repository";
import { startCmsFixture, type CmsProcessConfig } from "./cmsProcess";

type RunningFixture = { ready: Record<string, unknown>; stop(): Promise<void> };
type RepositoryProcessConfig = { repositoryRoot: string; port?: number };

const [mode, configPath] = process.argv.slice(2);
if ((mode !== "repository" && mode !== "cms") || !configPath) {
    throw new Error("Usage: processFixture.ts <repository|cms> <config.json>");
}

const config = JSON.parse(await readFile(configPath, "utf8")) as RepositoryProcessConfig | CmsProcessConfig;
const fixture =
    mode === "repository"
        ? startRepositoryFixture(config as RepositoryProcessConfig)
        : await startCmsFixture(config as CmsProcessConfig);
console.log(JSON.stringify({ type: "ready", pid: process.pid, role: mode, ...fixture.ready }));

let stopping = false;
const stop = async () => {
    if (stopping) {
        return;
    }
    stopping = true;
    await fixture.stop();
    process.exit(0);
};
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());

function startRepositoryFixture(config: RepositoryProcessConfig): RunningFixture {
    const catalog = new FsIntegrationDefinitionRepository(config.repositoryRoot);
    const packages = new FsIntegrationPackageSource({
        locate: (kind, version) => catalog.locateExactVersion(kind, version),
    });
    const runner = new BunRunner();
    runner.group("/.cms/repository", (repositoryRunner) => {
        new RepositoryCms({
            runner: repositoryRunner,
            integrationCatalog: catalog,
            integrationPackages: packages,
            packageDownloadProtection: { clientAddressPolicy: { mode: "disabled" } },
        });
    });
    runner.start(config.port ?? 0);
    return {
        ready: { port: runner.port },
        stop: async () => {
            await runner.stopGracefully(1_000);
        },
    };
}
