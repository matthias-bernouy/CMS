import type { Finding } from "../../capabilities/types";

/** Release every owned resource, even if an earlier teardown fails. Callbacks are registered on acquisition. */
export class Cleanup {
    private readonly resources: { name: string; release: () => Promise<unknown> }[] = [];

    add(name: string, release: () => Promise<unknown>): void {
        this.resources.push({ name, release });
    }

    async close(): Promise<Finding[]> {
        const findings: Finding[] = [];
        for (const resource of this.resources.splice(0).reverse()) {
            try {
                await resource.release();
            } catch {
                findings.push({
                    code: "cleanup-failed",
                    message: `Could not release test-owned resource: ${resource.name}`,
                });
            }
        }
        return findings;
    }
}
