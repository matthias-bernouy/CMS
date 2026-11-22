import { expect, test } from "bun:test";
import { createProtectedProviderManagement } from "../../src/runtime/gateway/protectedManagement";

const control = {
    contractId: "ulvia/cms.installations",
    version: "1.0.0",
    digest: `sha256:${"a".repeat(64)}`,
};
const content = {
    contractId: "ulvia/cms.content",
    version: "1.0.0",
    digest: `sha256:${"b".repeat(64)}`,
};
const systemInstallation = {
    id: "provider:system",
    providerId: "ulvia/primary-provider",
    accountId: "instance:control",
};

test("the control installation stays pinned while ordinary contract selections remain replaceable", async () => {
    const replacements: unknown[] = [];
    const management = {
        list: async () => ({ installations: [systemInstallation] }),
        replaceSelections: async (input: unknown) => {
            replacements.push(input);
            return { revision: 2, selected: [] };
        },
        setStatus: async () => ({}),
    };
    const protectedManagement = createProtectedProviderManagement(
        management as never,
        { id: systemInstallation.accountId } as never,
        { manifest: { providerId: systemInstallation.providerId }, contracts: [control, content] } as never,
    );
    const input = {
        expectedRevision: 1,
        selections: [
            { ...control, installationId: systemInstallation.id },
            { ...content, installationId: "provider:alternative" },
            { ...content, contractId: "ulvia/cms.observability", installationId: "provider:alternative" },
        ],
    };

    await expect(protectedManagement.replaceSelections(input)).resolves.toEqual({ revision: 2, selected: [] });
    expect(replacements).toEqual([input]);
    await expect(
        protectedManagement.replaceSelections({
            ...input,
            selections: input.selections.filter(({ contractId }) => contractId !== "ulvia/cms.observability"),
        }),
    ).rejects.toMatchObject({ code: "observability_selection_protected" });
});

test("the control installation cannot remove or redirect its own selection", async () => {
    const management = {
        list: async () => ({ installations: [systemInstallation] }),
        replaceSelections: async () => ({ revision: 2, selected: [] }),
        setStatus: async () => ({}),
    };
    const protectedManagement = createProtectedProviderManagement(
        management as never,
        { id: systemInstallation.accountId } as never,
        { manifest: { providerId: systemInstallation.providerId }, contracts: [control] } as never,
    );

    await expect(
        protectedManagement.replaceSelections({
            expectedRevision: 1,
            selections: [{ ...control, installationId: "provider:alternative" }],
        }),
    ).rejects.toMatchObject({ code: "control_selection_protected" });
});

test("only the host can change the control installation status", async () => {
    const statusChanges: unknown[] = [];
    const alternative = { id: "provider:alternative", providerId: "ulvia/vendor.remote", accountId: "remote" };
    const management = {
        list: async () => ({ installations: [systemInstallation, alternative] }),
        replaceSelections: async () => ({ revision: 2, selected: [] }),
        setStatus: async (input: unknown) => {
            statusChanges.push(input);
            return {};
        },
    };
    const protectedManagement = createProtectedProviderManagement(
        management as never,
        { id: systemInstallation.accountId } as never,
        { manifest: { providerId: systemInstallation.providerId }, contracts: [control] } as never,
    );
    const alternativeChange = {
        installationId: alternative.id,
        revision: 1,
        action: "disable" as const,
    };

    await expect(protectedManagement.setStatus(alternativeChange)).resolves.toEqual({});
    await expect(
        protectedManagement.setStatus({ ...alternativeChange, installationId: systemInstallation.id }),
    ).rejects.toMatchObject({ code: "control_installation_protected" });
    expect(statusChanges).toEqual([alternativeChange]);
});

test("an enabled hosting selection cannot be removed or redirected to another Provider", async () => {
    let replacements = 0;
    const hosting = { ...content, contractId: "ulvia/cms.hosting" };
    const management = createProtectedProviderManagement(
        {
            list: async () => ({ installations: [systemInstallation] }),
            replaceSelections: async () => {
                replacements++;
                return { revision: 2, selected: [] };
            },
        } as never,
        { id: systemInstallation.accountId } as never,
        { manifest: { providerId: systemInstallation.providerId }, contracts: [control, hosting] } as never,
    );
    const selections = [
        { ...control, installationId: systemInstallation.id },
        { ...content, contractId: "ulvia/cms.observability", installationId: systemInstallation.id },
    ];
    for (const extra of [
        [],
        [{ ...hosting, installationId: "another-provider" }],
        [{ ...hosting, version: "1.1.0", installationId: systemInstallation.id }],
    ]) {
        await expect(
            management.replaceSelections({ expectedRevision: 1, selections: [...selections, ...extra] }),
        ).rejects.toMatchObject({ code: "hosting_selection_protected" });
    }
    expect(replacements).toBe(0);
    await management.replaceSelections({
        expectedRevision: 1,
        selections: [...selections, { ...hosting, installationId: systemInstallation.id }],
    });
    expect(replacements).toBe(1);
});

test("single-contract selection cannot bypass protected control and observability selections", async () => {
    let writes = 0;
    const provider = {
        list: async () => ({ installations: [systemInstallation] }),
        selectContract: async (_input: unknown, check: (selections: unknown) => Promise<void>) => {
            await check([{ ...content, installationId: "provider:foreign" }]);
            writes++;
            return { revision: 2, selected: [] };
        },
    };
    const management = createProtectedProviderManagement(
        provider as never,
        { id: systemInstallation.accountId } as never,
        { manifest: { providerId: systemInstallation.providerId }, contracts: [control] } as never,
    );
    await expect(management.selectContract!({ installationId: "provider:foreign", ...control })).rejects.toMatchObject({
        code: "control_selection_protected",
    });
    expect(writes).toBe(0);
});
