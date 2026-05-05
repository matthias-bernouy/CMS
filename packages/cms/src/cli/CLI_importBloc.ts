import { relative } from "node:path";
import { scanDevBlocs, type DevBloc } from "./dev-server/scan";
import { buildAllDevBlocs, type BuiltBloc } from "./dev-server/build";

type Flags = {
    dryRun: boolean;
    force:  boolean;
    only: Set<string> | null;
};

function parseFlags(args: string[]): Flags {
    let dryRun = false;
    let force = false;
    let only: Set<string> | null = null;
    for (const arg of args) {
        if (arg === "--dry-run") dryRun = true;
        else if (arg === "--force" || arg === "-f") force = true;
        else if (arg.startsWith("--only=")) {
            only = new Set(
                arg.slice("--only=".length).split(",").map(s => s.trim()).filter(Boolean),
            );
        }
    }
    return { dryRun, force, only };
}

function resolveAdminBase(): { adminBase: URL; token: string } {
    const token = Bun.env.P9R_TOKEN;
    const rawUrl = Bun.env.P9R_URL;

    if (!token || !rawUrl) {
        console.error("✖ P9R_TOKEN and P9R_URL must be set (in .env or the environment).");
        console.error("");
        console.error("Example .env:");
        console.error("  P9R_URL=http://localhost:4999/cms");
        console.error("  P9R_TOKEN=your-admin-bearer-token");
        process.exit(1);
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
        console.error(`✖ P9R_URL must start with http:// or https:// (got "${rawUrl}")`);
        process.exit(1);
    }
    try {
        return { adminBase: new URL(rawUrl.replace(/\/$/, "") + "/"), token };
    } catch {
        console.error(`✖ P9R_URL is not a valid URL: "${rawUrl}"`);
        process.exit(1);
    }
}

export default async function CLI_importBloc(args: string[]) {
    const { adminBase, token } = resolveAdminBase();
    const flags = parseFlags(args);
    const cwd = process.cwd();

    console.log(`→ Admin base : ${adminBase.href.replace(/\/$/, "")}`);
    console.log(`→ Scanning   : ${cwd}`);
    if (flags.dryRun) console.log(`→ Mode       : dry-run (no upload)`);
    if (flags.force)  console.log(`→ Force      : existing blocs will be overwritten`);
    if (flags.only)   console.log(`→ Filter     : --only=${[...flags.only].join(",")}`);

    // Fail fast — reach the CMS before we spend time building.
    console.log(`→ Fetching remote bloc list...`);
    const remoteTags = await fetchRemoteTags(adminBase, token);
    console.log(`→ Remote     : ${remoteTags.size} bloc(s) already registered`);

    const blocs = await scanDevBlocs(cwd);
    if (blocs.length === 0) {
        console.warn("⚠ No blocs found (looking for folders containing manifest.json).");
        process.exit(0);
    }

    const candidates = flags.only
        ? blocs.filter(b => flags.only!.has(b.tag))
        : blocs;

    if (flags.only && candidates.length === 0) {
        console.error(`✖ --only matched no blocs.`);
        console.error(`  Requested: ${[...flags.only].join(", ")}`);
        console.error(`  Available: ${blocs.map(b => b.tag).join(", ")}`);
        process.exit(1);
    }

    console.log(`→ Found ${candidates.length} bloc(s):`);
    for (const b of candidates) {
        const rel = relative(cwd, b.folder) || ".";
        const opaque = b.editorEntry ? "" : "  (opaque)";
        console.log(`    • ${b.tag.padEnd(28)} ${b.label}  —  ${rel}${opaque}`);
    }

    // Split into new vs collisions before doing any expensive builds.
    const fresh:      DevBloc[] = [];
    const collisions: DevBloc[] = [];
    for (const b of candidates) {
        if (remoteTags.has(b.tag)) collisions.push(b);
        else                       fresh.push(b);
    }

    const toBuild = flags.force ? [...fresh, ...collisions] : fresh;
    const skipped = flags.force ? [] : collisions;

    if (collisions.length > 0) {
        console.warn("");
        if (flags.force) {
            console.warn(`⚠ ${collisions.length} bloc(s) already exist on the remote — will be overwritten (--force):`);
            for (const b of collisions) {
                console.warn(`    • ${b.tag}  (${relative(cwd, b.folder) || "."})`);
            }
        } else {
            console.warn(`⚠ ${collisions.length} bloc(s) already exist on the remote — skipping:`);
            for (const b of collisions) {
                console.warn(`    • ${b.tag}  (${relative(cwd, b.folder) || "."})`);
            }
            console.warn(`  Re-run with --force to overwrite, or delete them from the admin UI first.`);
        }
    }

    if (toBuild.length === 0) {
        console.log("");
        console.log("→ Nothing to push.");
        process.exit(0);
    }

    console.log("");
    console.log(`→ Building ${toBuild.length} bloc(s)...`);
    const built = await buildAllDevBlocs(toBuild);

    if (built.size === 0) {
        console.error("✖ All builds failed. See errors above.");
        process.exit(1);
    }
    const buildFailures = toBuild.length - built.size;
    if (buildFailures > 0) {
        console.warn(`⚠ ${buildFailures} bloc(s) failed to build (see errors above)`);
    }

    if (flags.dryRun) {
        console.log("");
        console.log(`→ Dry-run — would POST ${built.size} bloc(s):`);
        for (const [tag, b] of built) {
            const viewKb   = (b.viewJS.length   / 1024).toFixed(1);
            const editorKb = b.editorJS ? (b.editorJS.length / 1024).toFixed(1) + "kb" : "—";
            console.log(`    • ${tag.padEnd(28)} view=${viewKb}kb  editor=${editorKb}`);
        }
        process.exit(buildFailures > 0 ? 1 : 0);
    }

    console.log("");
    console.log(`→ Uploading ${built.size} bloc(s)...`);
    let ok = 0;
    let fail = 0;
    for (const [tag, b] of built) {
        try {
            await pushBloc(adminBase, token, b, flags.force);
            console.log(`    ✓ ${tag}`);
            ok++;
        } catch (e) {
            console.error(`    ✗ ${tag}: ${e instanceof Error ? e.message : e}`);
            fail++;
        }
    }

    console.log("");
    console.log(`→ Done. ${ok} imported, ${skipped.length} skipped, ${fail + buildFailures} failed.`);
    process.exit(fail + buildFailures > 0 ? 1 : 0);
}

async function fetchRemoteTags(adminBase: URL, token: string): Promise<Set<string>> {
    const url = new URL("api/bloc/list", adminBase).href;
    let res: Response;
    try {
        res = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
    } catch (e) {
        console.error(`✖ Failed to reach CMS at ${url}: ${e instanceof Error ? e.message : e}`);
        process.exit(1);
    }
    if (res.status === 401 || res.status === 403) {
        console.error(`✖ Remote refused the P9R_TOKEN (HTTP ${res.status}). Check your credentials.`);
        process.exit(1);
    }
    if (!res.ok) {
        console.error(`✖ GET ${url} → HTTP ${res.status}`);
        process.exit(1);
    }
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) {
        console.error(`✖ GET ${url} did not return a JSON array`);
        process.exit(1);
    }
    return new Set((data as { id: string }[]).map(b => b.id));
}

async function pushBloc(adminBase: URL, token: string, bloc: BuiltBloc, force: boolean): Promise<void> {
    const url = new URL("api/bloc", adminBase).href;

    const form = new FormData();
    form.append("name",        bloc.label);
    form.append("group",       bloc.group);
    form.append("description", bloc.description);
    form.append("tag",         bloc.tag);
    if (force) form.append("force", "true");
    form.append(
        "viewJS",
        new File([bloc.viewJS], `${bloc.tag}.js`, { type: "application/javascript" }),
    );
    if (bloc.editorJS) {
        form.append(
            "editorJS",
            new File([bloc.editorJS], `${bloc.tag}Editor.js`, { type: "application/javascript" }),
        );
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Authorization": `Bearer ${token}` },
        body: form,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${text ? " — " + text : ""}`);
    }
}
