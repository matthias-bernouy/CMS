type RemoteBlocMeta = {
    id:          string;
    name:        string;
    group:       string;
    description: string;
};

type Flags = {
    json: boolean;
};

function parseFlags(args: string[]): Flags {
    let json = false;
    for (const arg of args) {
        if (arg === "--json") json = true;
    }
    return { json };
}

function resolveAdminBase(): { adminBase: URL; token: string } {
    const token  = Bun.env.P9R_TOKEN;
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

async function fetchBlocs(adminBase: URL, token: string): Promise<RemoteBlocMeta[]> {
    const url = new URL("api/blocs-list", adminBase).href;
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
    return data as RemoteBlocMeta[];
}

function printHuman(blocs: RemoteBlocMeta[], adminBase: URL) {
    console.log(`→ Admin base : ${adminBase.href.replace(/\/$/, "")}`);
    console.log(`→ Found      : ${blocs.length} bloc(s) registered on the remote CMS`);
    console.log("");

    if (blocs.length === 0) {
        console.log("  (no blocs registered — use `p9r import` to deploy some)");
        return;
    }

    const byGroup = new Map<string, RemoteBlocMeta[]>();
    for (const b of blocs) {
        const g = b.group || "Uncategorized";
        const bucket = byGroup.get(g) || [];
        bucket.push(b);
        byGroup.set(g, bucket);
    }

    const groups = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));
    for (const group of groups) {
        console.log(`  [${group}]`);
        const bucket = byGroup.get(group)!.sort((a, b) => a.id.localeCompare(b.id));
        for (const b of bucket) {
            const header = `    • ${b.id.padEnd(28)} ${b.name}`;
            console.log(header);
            if (b.description) {
                console.log(`      ${b.description}`);
            }
        }
        console.log("");
    }

    console.log("Reserved prefixes: `w13c-*` and `p9r-*` are reserved by the Cms system.");
    console.log("Do not create blocs using those prefixes.");
}

export default async function CLI_listBlocs(args: string[]) {
    const flags = parseFlags(args);
    const { adminBase, token } = resolveAdminBase();

    const blocs = await fetchBlocs(adminBase, token);

    if (flags.json) {
        console.log(JSON.stringify(blocs, null, 2));
        return;
    }

    printHuman(blocs, adminBase);
}
