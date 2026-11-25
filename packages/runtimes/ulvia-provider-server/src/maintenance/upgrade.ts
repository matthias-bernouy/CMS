import { open, mkdir } from "node:fs/promises";
import { join, isAbsolute } from "node:path";
import { MongoClient } from "mongodb";
import { readProviderRuntimeEnv } from "../runtimeEnv";
import { bundledBootstrapSources } from "../runtime/instances/system/bootstrap";
import { loadSystemArtifacts } from "../runtime/instances/system/artifacts";
import { formsMigrationPlan } from "./forms/plan";
import { applyFormsMigration } from "./forms/apply";
async function main() {
    const [mode, digest, directory] = process.argv.slice(2);
    if (
        !["plan", "apply"].includes(mode ?? "") ||
        (mode === "apply" && (!/^[a-f0-9]{64}$/u.test(digest ?? "") || !directory || !isAbsolute(directory)))
    ) {
        throw new Error("Invalid release maintenance command");
    }
    const env = readProviderRuntimeEnv(process.env),
        mongo = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 5000 });
    try {
        await mongo.connect();
        const bootstrap = bundledBootstrapSources(env.ULVIA_BOOTSTRAP_DIR),
            artifacts = await loadSystemArtifacts(bootstrap.providers);
        if (mode === "plan") {
            await Bun.write(
                Bun.stdout,
                `${JSON.stringify(await formsMigrationPlan(mongo, artifacts, env.ULVIA_PROVIDER_PUBLIC_URL))}\n`,
            );
            return;
        }
        await mkdir(directory!, { recursive: true, mode: 0o700 });
        const output = await open(join(directory!, "forms-v1-email-settings.ndjson"), "wx", 0o600);
        try {
            await output.writeFile(`${JSON.stringify({ schema: "ulvia.forms-email-export/v1" })}\n`);
            const result = await applyFormsMigration(
                mongo,
                artifacts,
                bootstrap,
                env.ULVIA_PROVIDER_PUBLIC_URL,
                digest!,
                async (value) => {
                    await output.writeFile(`${JSON.stringify(value)}\n`);
                },
            );
            await output.sync();
            await Bun.write(Bun.stdout, `${JSON.stringify(result)}\n`);
        } finally {
            await output.close();
        }
    } finally {
        await mongo.close();
    }
}
try {
    await main();
} catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = /^(FORMS_[A-Z_]+)(?::(.*))?$/u.exec(message);
    const detail = known?.[2] && /^[A-Za-z0-9._:/ -]{1,512}$/u.test(known[2]) ? known[2] : undefined;
    await Bun.write(
        Bun.stderr,
        JSON.stringify({
            error: known?.[1] ?? "MAINTENANCE_PREFLIGHT_FAILED",
            ...(detail ? { detail } : {}),
        }) + "\n",
    );
    process.exitCode = 1;
}
