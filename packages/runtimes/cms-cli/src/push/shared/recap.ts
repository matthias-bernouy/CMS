import { createInterface } from "node:readline/promises";

export type PageStatus = "new" | "update" | "conflict" | "unchanged";

export type RecapEntry = {
    path: string;
    status: PageStatus;
};

const STATUS_LABEL: Record<PageStatus, string> = {
    new: "+ new",
    update: "~ update",
    conflict: "! conflict",
    unchanged: "= unchanged",
};

/** Print the pre-push table grouped by status. Caller logs the tenant URL. */
export function renderRecap(entries: RecapEntry[], label = "entry"): void {
    const counts: Record<PageStatus, number> = { new: 0, update: 0, conflict: 0, unchanged: 0 };
    for (const e of entries) {
        counts[e.status]++;
    }

    console.log("");
    console.log(
        `→ ${entries.length} ${label}(s):` +
            `  ${counts.new} new` +
            `, ${counts.update} update` +
            `, ${counts.conflict} conflict` +
            `, ${counts.unchanged} unchanged`,
    );

    const ordered: PageStatus[] = ["conflict", "new", "update", "unchanged"];
    for (const status of ordered) {
        const rows = entries.filter((e) => e.status === status);
        if (rows.length === 0) {
            continue;
        }
        for (const row of rows) {
            console.log(`    ${STATUS_LABEL[status].padEnd(11)} ${row.path}`);
        }
    }
}

/**
 * Ask `[y/N]` and return whether the user confirmed. When stdin isn't a
 * TTY (CI, piped input) we refuse rather than hang — caller should pass
 * `--yes` upstream to skip the prompt explicitly.
 */
export async function confirm(question: string, autoYes: boolean): Promise<boolean> {
    if (autoYes) {
        return true;
    }
    if (!process.stdin.isTTY) {
        console.error(`✖ Refusing to prompt on a non-TTY. Pass --yes to confirm in CI.`);
        return false;
    }
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = (await rl.question(`${question} [y/N] `)).trim().toLowerCase();
        return answer === "y" || answer === "yes";
    } finally {
        rl.close();
    }
}
