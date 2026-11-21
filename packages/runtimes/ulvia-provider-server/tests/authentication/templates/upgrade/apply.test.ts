import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import { MemoryTemplateStore } from "@bernouy/email-templates/memory";
import { AccountEmailTemplates, MemoryAccountEmailConfigurationStore } from "@bernouy/auth/email-templates";
import { createInstanceProvisioningTarget } from "../../../../src/runtime/instances/instanceProvisioning";
import { initializeAccountTemplates } from "../../../../src/runtime/authentication/templates/initialize";
import { reviewSystemUpgrade } from "../../../../src/runtime/instances/system/execution/upgrades";
import type { InstanceComposition } from "../../../../src/runtime/instances/composition/ProviderInstanceHost";
import type { ProviderRuntimeEnv } from "../../../../src/runtimeEnv";
import { previousInstance } from "./fixture";

test("the upgrade contracts step initializes account publications after selection/pairing and resumes without resetting setup", async () => {
    const f = await previousInstance();
    const review = await reviewSystemUpgrade(
        f.instance,
        {
            expectedRevision: 1,
            administratorSub: "local:admin",
            manifestDigest: (await f.system.available()).manifest.digest,
        },
        f.stores,
        f.support,
        f.system,
        f.installed.installation.endpoint,
    );
    let configuration = new MemoryAccountEmailConfigurationStore();
    const templates = new EmailTemplates(new MemoryTemplateStore());
    let selected = review.source.contracts;
    let replacements = 0;
    let pairs = 0;
    let checkpoints = 0;
    let interrupted = true;
    const execution = { signal: new AbortController().signal, throwIfLeaseLost: () => {} };
    const options: Parameters<typeof createInstanceProvisioningTarget>[0] = {
        installAccountTemplates: true,
        instance: { ...f.instance, status: "upgrading" },
        env: {} as ProviderRuntimeEnv,
        credentials: {} as never,
        providerSource: {} as never,
        composition: {
            runtime: { report: { instanceId: f.instance.id } },
            gateway: {
                siteId: "default",
                selections: { get: async () => ({ revision: 1, plan: { selections: [] } }) },
            },
            management: {
                list: async () => ({
                    installations: [
                        {
                            id: "installation:own",
                            providerId: review.target.manifest.providerId,
                            accountId: f.instance.id,
                        },
                    ],
                    selected: selected.map((pin) => ({ ...pin, installationId: "installation:own" })),
                }),
                replaceSelections: async (input: { selections: typeof selected }) => {
                    replacements++;
                    selected = input.selections;
                },
            },
            pairOfficialProvider: async () => {
                pairs++;
            },
            initializeAccountTemplates: async (checkpoint: () => void) => {
                expect(pairs).toBeGreaterThan(0);
                expect(selected.some(({ contractId }) => contractId === "ulvia/cms.email-templates")).toBe(true);
                await initializeAccountTemplates(configuration, templates, "selected-source", () => {
                    checkpoint();
                    if (interrupted && ++checkpoints === 3) {
                        throw new Error("Lease interrupted initialization");
                    }
                });
            },
            stores: {
                initializationState: {
                    initialize: async () => {
                        throw new Error("Existing setup must be retained");
                    },
                },
            },
        } as unknown as InstanceComposition,
    };
    const target = createInstanceProvisioningTarget(options);
    await expect(target.selectContracts(review.target, execution)).rejects.toThrow("Lease interrupted");
    expect(await configuration.read()).toBeNull();
    expect(replacements).toBe(1);
    interrupted = false;
    await target.selectContracts(review.target, execution);
    expect(replacements).toBe(1);
    const before = await configuration.read();
    expect(before).not.toBeNull();
    const composer = new AccountEmailTemplates(configuration, {
        source: async () => "selected-source",
        describe: ({ id, version }) => templates.getVersion({ id, version }),
        render: ({ id, version }, values) => templates.render({ id, version, values }),
    });
    expect(
        (
            await composer.compose({
                kind: "email_verification",
                to: { email: "visitor@example.test" },
                actionUrl: "https://site.test/verify",
                token: "private",
                expiresAt: new Date(),
                siteName: "Upgraded",
            })
        ).subject,
    ).toBe("Verify your email for Upgraded");
    const seed = await templates.get({ id: before!.emailVerification.id });
    await templates.updateDraft({
        id: seed.id,
        description: seed.description,
        name: "Customized",
        expectedRevision: seed.revision,
        draft: { ...seed.draft, subject: "Custom" },
    });
    await target.selectContracts(review.target, execution);
    expect(await configuration.read()).toEqual(before);
    expect((await templates.get({ id: seed.id })).draft.subject).toBe("Custom");
    expect((await templates.list({ limit: 100, includeArchived: true })).items).toHaveLength(2);
    expect((await templates.get({ id: seed.id })).latestVersion).toBe(1);
    // Registry activation and later upgrades cannot silently repair missing mandatory account state.
    configuration = new MemoryAccountEmailConfigurationStore();
    const registry = createInstanceProvisioningTarget({ ...options, installAccountTemplates: false });
    await registry.selectContracts(review.target, execution);
    expect(await configuration.read()).toBeNull();
}, 20000);
