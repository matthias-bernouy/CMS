import { mkdir, open, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { GatewayCommandAuditEvent, GatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";

/** Append-only, fixed-size command records; no inputs, proofs or credentials are retained. */
export class RepositoryCommandAudit implements GatewayCommandAuditStore {
    constructor(private readonly root: string) {}

    async append(event: GatewayCommandAuditEvent): Promise<void> {
        const directory = join(this.root, ".capability-audit", event.occurredAt.slice(0, 10));
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const temporary = join(directory, `${randomUUID()}.tmp`);
        const handle = await open(temporary, "wx", 0o600);
        try {
            await handle.writeFile(JSON.stringify(event));
            await handle.sync();
        } finally {
            await handle.close();
        }
        try {
            await rename(temporary, join(directory, `${event.id}.json`));
            for (const path of [directory, join(this.root, ".capability-audit"), this.root]) {
                const parent = await open(path, "r");
                try {
                    await parent.sync();
                } finally {
                    await parent.close();
                }
            }
        } finally {
            await rm(temporary, { force: true });
        }
    }
}
