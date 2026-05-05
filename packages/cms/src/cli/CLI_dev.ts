import { relative, join } from "node:path";
import { scanDevBlocs } from "./dev-server/scan";
import { buildAllDevBlocs } from "./dev-server/build";
import { startDevServer } from "./dev-server/server";
import { createReloadEmitter, createBlocRegistry } from "./dev-server/watch";
import { fetchRemoteBlocs } from "./dev-server/shell";

function parseFlags(args: string[]): { port: number; host: string } {
    let port = 5000;
    let host = "localhost";
    for (const arg of args) {
        if (arg.startsWith("--port=")) port = Number(arg.slice("--port=".length)) || port;
        else if (arg.startsWith("--host=")) host = arg.slice("--host=".length) || host;
    }
    return { port, host };
}

export default async function CLI_dev(args: string[]) {
    const token = Bun.env.P9R_TOKEN;
    const rawUrl = Bun.env.P9R_URL;

    if (!token || !rawUrl) {
        console.error("✖ P9R_TOKEN and P9R_URL must be set (in .env or the environment).");
        console.error("");
        console.error("Example .env:");
        console.error("  P9R_URL=http://localhost:4999/cms");
        console.error("  P9R_TOKEN=your-admin-bearer-token");
        console.error("");
        console.error("P9R_URL must include the admin path prefix (e.g. /cms).");
        console.error("The public origin (for /bloc?tag=...) is derived automatically.");
        process.exit(1);
    }

    if (!/^https?:\/\//i.test(rawUrl)) {
        console.error(`✖ P9R_URL must start with http:// or https:// (got "${rawUrl}")`);
        console.error(`  Example: P9R_URL=http://localhost:4999/cms`);
        process.exit(1);
    }

    let adminBase: URL;
    let publicOrigin: string;
    try {
        adminBase = new URL(rawUrl.replace(/\/$/, "") + "/");
        publicOrigin = adminBase.origin;
    } catch {
        console.error(`✖ P9R_URL is not a valid URL: "${rawUrl}"`);
        process.exit(1);
    }

    if (publicOrigin === "null" || !adminBase.pathname.startsWith("/")) {
        console.error(`✖ P9R_URL could not be parsed into a valid origin: "${rawUrl}"`);
        console.error(`  Parsed origin: ${publicOrigin}, pathname: ${adminBase.pathname}`);
        console.error(`  Example: P9R_URL=http://localhost:4999/cms`);
        process.exit(1);
    }

    const cwd = process.cwd();
    console.log(`→ Admin base : ${adminBase.href.replace(/\/$/, "")}`);
    console.log(`→ Public     : ${publicOrigin}`);
    console.log(`→ Scanning   : ${cwd}`);

    const blocs = await scanDevBlocs(cwd);
    if (blocs.length === 0) {
        console.warn("⚠ No dev blocs found (looking for folders containing manifest.json).");
        process.exit(0);
    }

    console.log(`→ Found ${blocs.length} dev bloc(s):`);
    for (const b of blocs) {
        const rel = relative(cwd, b.folder) || ".";
        const editor = b.editorEntry ? "" : "  (no editor)";
        console.log(`    • ${b.tag.padEnd(28)} ${b.label}  —  ${rel}${editor}`);
    }

    console.log("→ Building...");
    const built = await buildAllDevBlocs(blocs);

    if (built.size === 0) {
        console.error("✖ All builds failed. See errors above.");
        process.exit(1);
    }

    console.log(`→ Built ${built.size}/${blocs.length} bloc(s):`);
    for (const [tag, b] of built) {
        const viewKb   = (b.viewJS.length   / 1024).toFixed(1);
        const editorKb = b.editorJS ? (b.editorJS.length / 1024).toFixed(1) + "kb" : "—";
        console.log(`    • ${tag.padEnd(28)} view=${viewKb}kb  editor=${editorKb}`);
    }

    const { port, host } = parseFlags(args);
    const packageRoot = join(import.meta.dir, "..", "..");

    console.log("→ Fetching remote bloc list...");
    const remoteBlocs = await fetchRemoteBlocs(adminBase, token);
    if (remoteBlocs.length > 0) {
        console.log(`→ Remote : ${remoteBlocs.length} bloc(s) available`);
        const shadowed = remoteBlocs.filter(r => built.has(r.id)).map(r => r.id);
        if (shadowed.length > 0) {
            console.log(`→ Shadow : dev blocs override ${shadowed.length} remote bloc(s): ${shadowed.join(", ")}`);
        }
    }

    const reload = createReloadEmitter();
    const registry = createBlocRegistry(cwd, blocs, built, reload);

    const handle = startDevServer({
        port,
        host,
        adminBase,
        publicOrigin,
        token,
        devBlocs: built,
        remoteBlocs,
        packageRoot,
        cwd,
        reload,
    });

    console.log("");
    console.log(`✓ Dev server ready`);
    console.log(`  Local    : ${handle.url}`);
    console.log(`  Editor   : ${handle.editorUrl}`);
    console.log(`  Proxying : ${adminBase.href.replace(/\/$/, "")}`);
    console.log(`  Scratch  : ${join(cwd, ".p9r-dev", "scratch.json")}`);
    console.log(`  Writes   : blocked except page save → scratch`);
    console.log(`  Watching : ${blocs.length} bloc folder(s) — edit to hot-reload`);
    console.log(`  Polling  : ${cwd} every 1s for new/renamed/deleted blocs`);
    console.log("");
    console.log("Press Ctrl+C to stop.");

    const shutdown = (signal: string) => {
        console.log(`\n→ Stopping dev server (${signal})...`);
        registry.stop();
        handle.stop();
        process.exit(0);
    };
    process.on("SIGINT",  () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
}
