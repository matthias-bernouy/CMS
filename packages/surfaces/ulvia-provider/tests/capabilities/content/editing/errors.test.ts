import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    SiteBlocLifecycleConflictError,
    SiteBlocPublishedSlotConflictError,
    SiteBlocPublicationLockLostError,
    SiteBlocPublicationRecoveryRequiredError,
    ContentStorageFormatError,
    createCmsSiteBloc,
    readCmsSiteBloc,
} from "@bernouy/content";
import { contentTransport } from "../transport";
import { loadOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { capabilityBindings } from "@bernouy/ulvia-contracts/bindings";
import { contentFeature, ContentCapabilityError } from "@bernouy/content/feature";

async function expectRetryableFailure(response: Response, id: string) {
    const build = await loadOfficialFeatures();
    const contract = build.implementedContracts.find(
        ({ release }) => release.contractId === "ulvia/cms.content" && release.version === contentFeature.version,
    );
    const capability = contract!.release.capabilities.find((candidate) => candidate.id === id)!;
    const result = await response.json();
    expect([409, 503]).toContain(response.status);
    expect(result.error.code).not.toBe("TAG_CONFLICT");
    expect(capability.errors.find(({ code }) => code === result.error.code)).toMatchObject({ retryable: true });
    const binding = capabilityBindings(capability).find((candidate) => candidate.transport === "http")!;
    expect(response.status).toBe(binding.response.errorStatuses[result.error.code]!);
    expect(result.error).toMatchObject({ output: { message: expect.any(String) } });
    expect(result.error.output).not.toHaveProperty("stack");
}

test("declared service unavailability remains a valid retryable wire error", async () => {
    const { call } = await contentTransport({
        repo: {
            insertPage: async () => {
                throw new ContentCapabilityError("CORE_UNAVAILABLE");
            },
        } as never,
    });
    await expectRetryableFailure(await call("pages.create", { path: "/draft", title: "Draft" }), "pages.create");
});

for (const failure of [new SiteBlocPublicationLockLostError(), new SiteBlocPublicationRecoveryRequiredError()]) {
    for (const [id, input] of [
        ["pages.create", { path: "/draft", title: "Draft" }],
        ["pages.update", { id: "page", expectedRevision: 1, content: "<p>After</p>" }],
        ["pages.publish", { id: "page", expectedRevision: 1, visible: true }],
        ["pages.rename", { id: "page", expectedRevision: 1, title: "After" }],
        ["pages.update-seo", { id: "page", expectedRevision: 1, language: "en", title: "After" }],
    ] as const) {
        test(`${id} translates ${failure.name} to a declared unavailable response without leaking internals`, async () => {
            const stored = new InMemoryContentRepository();
            const repo = new Proxy(stored, {
                get(target, key) {
                    const value = Reflect.get(target, key);
                    return typeof value === "function"
                        ? async () => {
                              throw failure;
                          }
                        : value;
                },
            });
            const { call } = await contentTransport({ repo });
            const response = await call(id, input);
            await expectRetryableFailure(response, id);
            expect(await stored.getBlocsList()).toEqual([]);
            expect((await stored.scanPages(undefined, 1)).pages).toEqual([]);
        });
    }
}

for (const [label, failure, reason] of [
    ["archived composition", new SiteBlocLifecycleConflictError("site-editable", "save a draft"), /archiv|restore/i],
    ["published slot", new SiteBlocPublishedSlotConflictError("site-editable", "body", "removed"), /slot|emplacement/i],
] as const) {
    test(`the ${label} conflict explains the required correction instead of claiming a duplicate tag`, async () => {
        const raw = new InMemoryContentRepository();
        const repo = new ValidatingContentRepository(raw);
        await createCmsSiteBloc(repo, {
            tag: "site-editable",
            name: "Editable",
            group: "Site",
            content: "<p>Before</p>",
        });
        const read = await readCmsSiteBloc(repo, { tag: "site-editable" });
        const before = await raw.getBlocRecord(read.tag);
        raw.saveSiteBlocDraft = async () => {
            throw failure;
        };
        const { call } = await contentTransport({ repo });
        const response = await call("site-blocs.update", {
            tag: read.tag,
            definitionId: read.definitionId,
            revision: 1,
            draftJson: read.draftJson,
        });
        const result = await response.json();
        expect(await raw.getBlocRecord(read.tag)).toEqual(before);
        expect([409, 422]).toContain(response.status);
        expect(result.error.code).not.toBe("TAG_CONFLICT");
        expect(result.error.code).not.toBe("CORE_UNAVAILABLE");
        expect(result.error.output.message).toMatch(reason);
        if (label === "archived composition") {
            expect(result.error.code).toBe("STATE_CONFLICT");
            const build = await loadOfficialFeatures();
            const current = build.implementedContracts.find(
                ({ release }) =>
                    release.contractId === "ulvia/cms.content" && release.version === contentFeature.version,
            )!;
            expect(
                current.release.capabilities
                    .find(({ id }) => id === "site-blocs.update")!
                    .errors.find(({ code }) => code === "STATE_CONFLICT"),
            ).toMatchObject({ retryable: true });
        }
    });
}

test("a lost composition-write lock is a retryable service refusal rather than a duplicate tag", async () => {
    const raw = new InMemoryContentRepository();
    const repo = new ValidatingContentRepository(raw);
    await createCmsSiteBloc(repo, { tag: "site-editable", name: "Editable", group: "Site", content: "<p>Before</p>" });
    const read = await readCmsSiteBloc(repo, { tag: "site-editable" });
    const before = await raw.getBlocRecord(read.tag);
    raw.saveSiteBlocDraft = async () => {
        throw new SiteBlocPublicationLockLostError();
    };
    const { call } = await contentTransport({ repo });
    const response = await call("site-blocs.update", {
        tag: read.tag,
        definitionId: read.definitionId,
        revision: 1,
        draftJson: read.draftJson,
    });
    expect(await raw.getBlocRecord(read.tag)).toEqual(before);
    await expectRetryableFailure(response, "site-blocs.update");
});

for (const id of ["examples.get", "examples.list"]) {
    test(`${id} never receives an undeclared CORE_UNAVAILABLE mapping`, () => {
        const capability = contentFeature.capabilities.find((entry) => entry.id === id)!;
        for (const failure of [
            new SiteBlocPublicationLockLostError(),
            new SiteBlocPublicationRecoveryRequiredError(),
            new ContentStorageFormatError("Malformed storage"),
        ]) {
            expect(contentFeature.mapError!(failure, capability)).toBeUndefined();
        }
    });
}
