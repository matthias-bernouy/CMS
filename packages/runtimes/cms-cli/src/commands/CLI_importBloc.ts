import { getAccessToken } from "../credentials";
import { runBlocs, type RunBlocsFlags } from "../push/blocs/run";

function parseFlags(args: string[]): RunBlocsFlags {
    const flags: RunBlocsFlags = { dryRun: false, force: false, yes: false, only: null };
    for (const arg of args) {
        if (arg === "--dry-run") {
            flags.dryRun = true;
        } else if (arg === "--force" || arg === "-f") {
            flags.force = true;
        } else if (arg === "--yes" || arg === "-y") {
            flags.yes = true;
        } else if (arg.startsWith("--only=")) {
            flags.only = new Set(
                arg
                    .slice("--only=".length)
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
            );
        }
    }
    return flags;
}

async function resolveAdminBase(): Promise<{ adminBase: URL; token: string }> {
    const rawUrl = Bun.env.P9R_URL;

    if (!rawUrl) {
        console.error("✖ P9R_URL must be set (in .env or the environment).");
        console.error("  Then set P9R_TOKEN to a CMS Personal Access Token (admin → Profile).");
        process.exit(1);
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
        console.error(`✖ P9R_URL must start with http:// or https:// (got "${rawUrl}")`);
        process.exit(1);
    }

    const token = await getAccessToken(rawUrl.replace(/\/+$/, ""));
    if (!token) {
        console.error(
            `✖ No token for ${rawUrl}. Set P9R_TOKEN to a CMS Personal Access Token (admin → Profile), or add it to ~/.config/p9r/credentials.json.`,
        );
        process.exit(1);
    }
    try {
        return { adminBase: new URL(rawUrl.replace(/\/$/, "") + "/"), token };
    } catch {
        console.error(`✖ P9R_URL is not a valid URL: "${rawUrl}"`);
        process.exit(1);
    }
}

export default async function CLI_importBloc(args: string[]): Promise<number> {
    const { adminBase, token } = await resolveAdminBase();
    return runBlocs(adminBase, token, parseFlags(args));
}
