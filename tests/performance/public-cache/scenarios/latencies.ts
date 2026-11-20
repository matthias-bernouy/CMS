import { expect } from "bun:test";
import { restart } from "../evidence/containers";
import { requirePage } from "../evidence/context";
import type { Context } from "../evidence/context";
import type { ScenarioId } from "../plan";

/** Expiry/idle outcomes are observed, not pinned to today's short cache lifetimes. */
export async function latencyScenario(context: Context, id: ScenarioId) {
    const { reader, options, sample, stack, epochs, findings } = context;
    const initial = await sample(id, "prime", 0, false);
    requirePage(initial, reader);
    requirePage(await sample(id, "prime", 0, false), reader, "HIT");
    const reload: Record<string, string> =
        id === "public.reload.no-cache"
            ? { "cache-control": "no-cache", pragma: "no-cache" }
            : id === "public.reload.max-age-zero"
              ? { "cache-control": "max-age=0" }
              : {};
    if (id === "public.warm" || id.startsWith("public.reload.")) {
        try {
            for (let index = 0; index < options.samples; index++) {
                const row = await sample(id, "request", index, true, undefined, reload);
                requirePage(row, reader, id === "public.warm" ? "HIT" : "REVALIDATED");
                expect(row.hash).toBe(initial.hash);
            }
        } finally {
            await context.flushWork();
        }
        return;
    }
    for (let epoch = 1; epoch <= options.epochs; epoch++) {
        // Prime directly before waiting; preparation work is outside client latency.
        requirePage(await sample(id, "prime", epoch, false), reader);
        if (id === "public.response-expiry" || id === "public.context-idle") {
            const delay = id === "public.context-idle" ? 65_000 : 17_000;
            console.log(`Public cache: ${id}, epoch ${epoch}/${options.epochs}, idle ${delay}ms`);
            await Bun.sleep(delay);
        } else {
            epochs.push({ scenario: id, epoch, ...(await restart(stack, id === "public.provider-edge-restart")) });
        }
        const first = await sample(id, "first", epoch);
        requirePage(first, reader);
        if (first.hash !== initial.hash) {
            findings.push({
                scenario: id,
                code: "html-bytes-changed",
                detail: `Exact HTML differs after epoch ${epoch}; original and new bodies retained without normalization`,
            });
        }
        for (let following = 0; following < 5; following++) {
            const next = await sample(id, "following", epoch);
            requirePage(next, reader, "HIT");
            expect(next.hash).toBe(first.hash);
        }
    }
}
