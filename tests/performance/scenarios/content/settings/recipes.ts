import { randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";
import type { settingsTenants } from "./tenant";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { QueryEnvironment } from "../../queries/execute";

export const SETTINGS_CAPABILITIES = [
    "site.update",
    "localization.update",
    "localization.text.save",
    "theme.activate",
    "theme.token.save",
    "theme.token.reset",
] as const;
type Lease = Awaited<ReturnType<ReturnType<typeof settingsTenants>>>;

/** Explicit business inputs and persisted-state checks; revision reads stay outside client timing. */
export async function prepareSettings(
    lease: Lease,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const state = lease.value;
    try {
        await state.prepare(binding);
        const collectionId = state.resource.id;
        const marker = `Performance ${randomUUID()}`;
        const read = () =>
            state.fixture(
                capability.startsWith("theme.")
                    ? "theme.get"
                    : capability === "localization.text.save"
                      ? "localization.texts.get"
                      : capability === "localization.update"
                        ? "localization.get"
                        : "site.get",
                capability.startsWith("theme.") || capability === "localization.text.save"
                    ? { collectionId, ...(capability === "localization.text.save" ? { locale: "en" } : {}) }
                    : {},
            );
        const before = await read();
        const themeId = capability.startsWith("theme.") ? before.profileId : undefined;
        const tokenId = capability.startsWith("theme.token.") ? requireRecord(before.token).id : undefined;
        if (capability === "theme.token.reset") {
            const primed = await state.client("ulvia/cms.content", "theme.token.save", "http", {
                expectedRevision: before.revision,
                themeId,
                tokenId,
                mode: "light",
                value: "#fedcba",
            });
            assertCondition(primed.observation.validated);
        }
        let input: Readonly<Record<string, unknown>> = {};
        const assertPersisted = (output: Readonly<Record<string, unknown>>) => {
            if (capability === "site.update") {
                assertCondition(output.name === marker && output.visible === true);
            } else if (capability === "localization.update") {
                assertCondition(output.language === "fr");
                assertCondition(canonicalizeIJson(output.additionalLanguages) === canonicalizeIJson(["en"]));
                assertCondition(canonicalizeIJson(output.activeLanguages) === canonicalizeIJson(["en"]));
            } else if (capability === "localization.text.save") {
                assertCondition(Array.isArray(output.items));
                const item = output.items.find((entry) => entry.id === "greeting");
                assertCondition(item?.overrideValue === marker);
            } else if (capability === "theme.activate") {
                assertCondition(output.activeThemeId === themeId);
            } else {
                const token = requireRecord(output.token);
                assertCondition(token.id === tokenId && token.overridden === (capability === "theme.token.save"));
                assertCondition(token.value === (capability === "theme.token.save" ? "#456789" : "#123456"));
            }
        };
        return {
            async send() {
                const current = await read();
                const expectedRevision = Number(current.revision);
                input = {
                    expectedRevision,
                    ...(capability === "site.update"
                        ? { name: marker, visible: true }
                        : capability === "localization.update"
                          ? { language: "fr", additionalLanguages: ["en"], activeLanguages: ["en"] }
                          : capability === "localization.text.save"
                            ? { collectionId, textId: "greeting", locale: "en", value: marker }
                            : capability === "theme.activate"
                              ? { themeId }
                              : {
                                    themeId,
                                    tokenId,
                                    mode: "light",
                                    ...(capability === "theme.token.save" ? { value: "#456789" } : {}),
                                }),
                };
                return (
                    await state.client("ulvia/cms.content", capability, binding, input, (output) => {
                        const out = requireRecord(output);
                        assertCondition(out.revision === expectedRevision + 1);
                        if (capability === "localization.text.save") {
                            assertCondition(
                                out.collectionId === collectionId &&
                                    out.textId === "greeting" &&
                                    out.locale === "en" &&
                                    out.overridden === true,
                            );
                        } else if (capability.startsWith("theme.token.")) {
                            assertCondition(
                                out.themeId === themeId &&
                                    out.tokenId === tokenId &&
                                    out.overridden === (capability === "theme.token.save"),
                            );
                        } else {
                            assertPersisted(out);
                        }
                    })
                ).observation;
            },
            async verify() {
                const current = await read();
                assertPersisted(current);
                const stale = await state.client("ulvia/cms.content", capability, "http", input);
                assertCondition(!stale.observation.validated && stale.observation.status === 409);
                const invalidInput =
                    capability === "site.update"
                        ? { expectedRevision: current.revision, notFound: { pageId: "missing-fixture-page" } }
                        : {
                              ...input,
                              expectedRevision: current.revision,
                              ...(capability === "localization.update"
                                  ? { language: "invalid locale" }
                                  : capability === "localization.text.save"
                                    ? { locale: "invalid locale" }
                                    : capability === "theme.activate"
                                      ? { themeId: "missing-theme" }
                                      : { tokenId: "missing-token" }),
                          };
                const invalid = await state.client("ulvia/cms.content", capability, "http", invalidInput);
                assertCondition(
                    !invalid.observation.validated &&
                        invalid.observation.status === (capability.startsWith("theme.") ? 404 : 422),
                );
                const foreign = await state.client(
                    "ulvia/cms.content",
                    capability,
                    "http",
                    { ...input, expectedRevision: current.revision },
                    undefined,
                    { httpCredentials: { cookie: environment.main.cookie } },
                );
                assertCondition(!foreign.observation.validated && [401, 403].includes(foreign.observation.status));
                assertCondition(canonicalizeIJson(await read()) === canonicalizeIJson(current));
            },
            close: async () => lease.release(),
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}
