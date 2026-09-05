import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../src/cli";
import {
    DEV_INTEGRATION_KIND,
    DEV_STORE_SQL,
    DEV_STORE_SQL_MANIFEST,
    devStoreDefinition,
} from "./fixtures/devStoreDefinition";
import { DEV_STORE_FUNCTION } from "./fixtures/devStoreFunction";

export async function prepareDevRepository(input: {
    workspace: string;
    integrations: string;
    data: string;
}): Promise<void> {
    await writeDevStoreIntegration(input.integrations);
    await runCli(["release", DEV_INTEGRATION_KIND, "--root", input.integrations], {
        cwd: input.workspace,
        environment: { ULVIA_DATA_DIR: input.data },
        releaseVerifier: { verify: async () => undefined },
        log: () => undefined,
    });
}

async function writeDevStoreIntegration(integrations: string): Promise<void> {
    const root = join(integrations, DEV_INTEGRATION_KIND);
    const functionRoot = join(root, "connectors/supabase/functions/cms-dev-store");
    const sqlRoot = join(root, "connectors/supabase/sql");
    await Promise.all([mkdir(functionRoot, { recursive: true }), mkdir(sqlRoot, { recursive: true })]);
    const index = {
        schema: "cms.integration.index.v1",
        kind: DEV_INTEGRATION_KIND,
        label: "Development persistence fixture",
        latest: "1.0.0",
        stable: "1.0.0",
        versions: [{ version: "1.0.0", path: ".", definition: "definition.json" }],
        type: "source",
    };
    await Promise.all([
        writeFile(join(root, "integration.json"), JSON.stringify(index, null, 2)),
        writeFile(join(root, "definition.json"), JSON.stringify(devStoreDefinition(), null, 2)),
        writeFile(join(root, "release-notes.txt"), "Initial generic development fixture.\n"),
        writeFile(join(functionRoot, "index.ts"), DEV_STORE_FUNCTION),
        writeFile(
            join(root, "connectors/supabase/supabase.config.toml"),
            "[functions.cms-dev-store]\nverify_jwt = false\n",
        ),
        writeFile(join(sqlRoot, "schema.manifest.json"), JSON.stringify(DEV_STORE_SQL_MANIFEST, null, 2)),
        writeFile(join(sqlRoot, "model.sql"), DEV_STORE_SQL),
    ]);
}
