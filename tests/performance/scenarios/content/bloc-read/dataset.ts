import { randomUUID } from "node:crypto";
import { ClientFailure } from "../../../harness/clients/failure";
import { assertCondition, requireRecord } from "../../queries/types";
import type { ScenarioClient } from "../../../harness/clients/session";

export function blocReadDataset(client: ScenarioClient) {
    const marker = `site-perf-${randomUUID()}`;
    const attempted = new Set<string>();
    const receipts = new Map<string, Readonly<Record<string, unknown>>>();
    const call = (
        capability: string,
        binding: string,
        input: Readonly<Record<string, unknown>>,
        assert?: (output: unknown) => void,
    ) => client("ulvia/cms.content", capability, binding, input, assert);
    const fixture = async (capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await call(capability, "http", input);
        if (!result.observation.validated) {
            throw new ClientFailure(`bloc-read-fixture-${capability}-${result.observation.failure ?? "invalid"}`);
        }
        return requireRecord(result.output);
    };
    const create = async (suffix: string) => {
        assertCondition(attempted.size < 80, "bloc-read-fixture-count");
        const tag = `${marker}-${suffix}`;
        attempted.add(tag);
        const input = {
            tag,
            name: `Performance ${suffix}`,
            group: marker,
            description: `Owned composition ${suffix}`,
            content: "<section><p>Controlled composition</p></section>",
        };
        const row = await fixture("site-blocs.create", input);
        assertCondition(
            row.tag === tag &&
                row.name === input.name &&
                row.group === marker &&
                row.description === input.description &&
                row.lifecycle === "active" &&
                row.draftRevision === 1 &&
                row.publishedRevision === null,
            "bloc-read-create-receipt",
        );
        receipts.set(tag, structuredClone(row));
        return row;
    };
    const publish = async (tag: string) => {
        const before = receipts.get(tag)!;
        const row = await fixture("site-blocs.publish", { tag, revision: before.draftRevision });
        assertCondition(
            row.tag === tag &&
                row.lifecycle === "active" &&
                row.draftRevision === before.draftRevision &&
                row.publishedRevision === before.draftRevision,
            "bloc-read-publish-receipt",
        );
        receipts.set(tag, structuredClone(row));
    };
    const archive = async (row: Readonly<Record<string, unknown>>) => {
        assertCondition(typeof row.tag === "string" && attempted.has(row.tag), "bloc-read-archive-ownership");
        const next = await fixture("site-blocs.archive", { tag: row.tag, revision: row.draftRevision });
        assertCondition(
            next.tag === row.tag && next.lifecycle === "archived" && next.draftRevision === row.draftRevision,
            "bloc-read-archive-receipt",
        );
        receipts.set(row.tag, structuredClone(next));
    };
    return {
        marker,
        call,
        fixture,
        create,
        publish,
        rows: () => [...receipts.values()],
        async initialize(variant: string) {
            if (variant === "invalidation") {
                return;
            }
            const deadline = Date.now() + 180_000;
            for (let index = 0; index < 64; index++) {
                assertCondition(Date.now() <= deadline, "bloc-read-preparation-deadline");
                const row = await create(String(index).padStart(3, "0"));
                if (variant === "history") {
                    await archive(row);
                } else {
                    await publish(String(row.tag));
                }
            }
            if (variant === "history") {
                const anchor = await create("anchor");
                await publish(String(anchor.tag));
            }
        },
        async close() {
            let failed = false;
            const deadline = Date.now() + 120_000;
            for (const tag of attempted) {
                if (Date.now() > deadline) {
                    failed = true;
                    break;
                }
                try {
                    const found = await call("site-blocs.get", "http", { tag });
                    if (!found.observation.validated && found.observation.status === 404 && !receipts.has(tag)) {
                        continue;
                    }
                    assertCondition(found.observation.validated, "bloc-read-cleanup-get");
                    const current = requireRecord(found.output);
                    assertCondition(current.tag === tag, "bloc-read-cleanup-identity");
                    if (current.lifecycle !== "archived") {
                        await archive(current);
                    } else {
                        receipts.set(tag, structuredClone(current));
                    }
                } catch {
                    failed = true;
                }
            }
            try {
                const final = await fixture("site-blocs.list", {});
                assertCondition(Array.isArray(final.items), "bloc-read-cleanup-list");
                const owned = final.items.map(requireRecord).filter((row) => String(row.tag).startsWith(marker));
                assertCondition(
                    owned.length === receipts.size && owned.every((row) => row.lifecycle === "archived"),
                    "bloc-read-active-fixtures-remain",
                );
            } catch {
                failed = true;
            }
            assertCondition(!failed, "bloc-read-cleanup-failed");
            // Archived domain records stay in this disposable instance until stack teardown.
        },
    };
}

export type BlocReadDataset = ReturnType<typeof blocReadDataset>;
