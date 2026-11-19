import { loadPolicy } from "../../../capabilities/policies";
import { ClientFailure } from "../../../harness/clients/failure";
import { assertCondition } from "../../queries/types";
import { oauthDocument, oauthRefusal } from "./protocol";
import type { Variant } from "../../../capabilities/types";

type PoolLease = Readonly<{ release: () => void }>;

/** Finish lazy tenant construction before issuing the concurrent exchange cohort's short-lived codes. */
export async function prepareOAuthCohort(
    acquire: () => Promise<PoolLease>,
    capability: string,
    variant: Variant,
    sampleIndex: number,
): Promise<void> {
    if (capability !== "exchange-mcp-token" || variant !== "concurrent" || sampleIndex !== 0) {
        return;
    }
    const leases: PoolLease[] = [];
    try {
        const count = loadPolicy("concurrent").load!.concurrency;
        for (let index = 0; index < count; index++) {
            leases.push(await acquire());
        }
    } finally {
        for (const lease of leases.reverse()) {
            lease.release();
        }
    }
}

type PreparedResponse = Readonly<{ observation: Readonly<{ validated: boolean }>; output: unknown }>;

/** Only public fixture preparation waits for native windows. Measured calls never use this helper. */
export function oauthPreparation(
    sleep: (milliseconds: number) => Promise<unknown> = Bun.sleep,
    now = Date.now,
    scope: "read" | "lifecycle" = "lifecycle",
) {
    let waited = 0;
    const deadline = now() + 360_000;
    const prefix = `oauth-${scope}`;
    return async (capability: string, send: () => Promise<PreparedResponse>) => {
        assertCondition(["register-mcp-client", "prepare-mcp-authorization"].includes(capability));
        for (let attempt = 0; attempt < 2; attempt++) {
            assertCondition(now() <= deadline, `${prefix}-preparation-deadline`);
            const result = await send();
            assertCondition(result.observation.validated, `${prefix}-preparation-envelope`);
            const output = oauthDocument(result.output);
            if (!Object.hasOwn(output, "error")) {
                return output;
            }
            if (attempt !== 0 || output.error !== "temporarily_unavailable" || output.status !== 429) {
                throw oauthRefusal(`${prefix}-preparation-refused`, output);
            }
            waited += 60_050;
            assertCondition(waited <= 5 * 60_050 && now() + 60_050 <= deadline, `${prefix}-window-budget`);
            console.log(`OAuth ${scope} fixture: waiting for the unchanged public rate-limit window`);
            for (let remaining = 60_050; remaining > 0; remaining -= 10_000) {
                await sleep(Math.min(10_000, remaining));
            }
        }
        throw new ClientFailure(`${prefix}-preparation-incomplete`);
    };
}
