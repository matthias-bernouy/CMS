import { expect, test } from "bun:test";
import { prepareSettingsRead, SETTINGS_READERS } from "./recipe";
import { settingsReadChange } from "./change";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import { auditPlan } from "../../../../capabilities/coverage";
import { assessmentScenarios } from "../../../plan";
import { inventoryFixture } from "../../../../fixtures/inventory";
import type { QueryEnvironment } from "../../../queries/execute";
import type { ScenarioClient } from "../../../../harness/clients/session";

const before = { revision: 7 };
const collection = "owned/fixture";
const theme = {
    ...before,
    collectionId: collection,
    profileId: "profile",
    mode: "light",
    sourceFound: true,
    hasToken: true,
    token: { id: "accent", value: "#456789", overridden: false },
};

test("site and language invalidation oracles require independently selected values and the next revision", () => {
    const site = settingsReadChange("site.get", { ...before, name: "Original", visible: false }, collection, "Changed");
    expect(site.input).toEqual({ expectedRevision: 7, name: "Changed", visible: true });
    expect(() => site.assert({ revision: 8, name: "Changed", visible: true })).not.toThrow();
    for (const row of [
        { revision: 7, name: "Changed", visible: true },
        { revision: 8, name: "Original", visible: true },
    ]) {
        expect(() => site.assert(row)).toThrow();
    }
    const locale = settingsReadChange("localization.get", { ...before, language: "fr" }, collection);
    expect(locale.input).toEqual({
        expectedRevision: 7,
        language: "en",
        additionalLanguages: ["fr"],
        activeLanguages: ["fr"],
    });
    expect(() =>
        locale.assert({ revision: 8, language: "en", additionalLanguages: ["fr"], activeLanguages: ["fr"] }),
    ).not.toThrow();
    expect(() =>
        locale.assert({ revision: 8, language: "en", additionalLanguages: ["fr"], activeLanguages: [] }),
    ).toThrow();
});

test("both text readers reject unchanged overrides and foreign collection/locale data", () => {
    for (const capability of ["localization.texts.get", "localization.texts.read"]) {
        const change = settingsReadChange(
            capability,
            { ...before, items: [{ id: "greeting", overrideValue: "Old" }] },
            collection,
            "Changed",
        );
        expect(change.capability).toBe("localization.text.save");
        expect(change.input).toEqual({
            expectedRevision: 7,
            collectionId: collection,
            textId: "greeting",
            locale: "en",
            value: "Changed",
        });
        const row = {
            revision: 8,
            collectionId: collection,
            locale: "en",
            items: [{ id: "greeting", overrideValue: "Changed" }],
        };
        expect(() => change.assert(row)).not.toThrow();
        expect(() => change.assert({ ...row, collectionId: "foreign/collection" })).toThrow();
        expect(() => change.assert({ ...row, locale: "fr" })).toThrow();
        expect(() => change.assert({ ...row, items: [{ id: "greeting", overrideValue: "Old" }] })).toThrow();
    }
});

test("theme invalidation checks the selected profile, mode, token and complete catalogue value", () => {
    for (const capability of ["theme.get", "theme.read"]) {
        const change = settingsReadChange(capability, theme, collection);
        expect(change.input).toEqual({
            expectedRevision: 7,
            themeId: "profile",
            tokenId: "accent",
            mode: "light",
            value: "#abcdef",
        });
        const token = { id: "accent", value: "#abcdef", overridden: true };
        const row = { ...theme, revision: 8, token, tokens: [token] };
        expect(() => change.assert(row)).not.toThrow();
        expect(() => change.assert({ ...row, profileId: "foreign" })).toThrow();
        expect(() => change.assert({ ...row, token: theme.token })).toThrow();
        expect(() => change.assert({ ...row, tokens: [theme.token] })).toThrow();
    }
    expect(SETTINGS_READERS).toHaveLength(6);
});

test("invalidation prepares the mutation before timing, checks refusals without state changes and releases its lease", async () => {
    const fixture = await inventoryFixture();
    let released = 0;
    let mutated = false;
    let saved: Record<string, unknown> = { ...before, name: "Before", visible: false };
    const events: string[] = [];
    const client: ScenarioClient = async (_contract, capability, _binding, input, assert = () => {}, options = {}) => {
        events.push(capability);
        if (options.httpCredentials?.cookie === "foreign-main") {
            return { observation: { ...fixture.measurement, validated: false, status: 401 }, output: undefined };
        }
        if (capability === "site.update") {
            if (mutated) {
                return { observation: { ...fixture.measurement, validated: false, status: 409 }, output: undefined };
            }
            mutated = true;
            saved = { revision: 8, name: input.name, visible: true };
        }
        await assert(saved);
        return { observation: fixture.measurement, output: saved };
    };
    const lease = {
        value: {
            prepare: async () => {
                events.push("prepare");
            },
            resource: { id: collection },
            fixture: async () => saved,
            client,
        },
        release: () => {
            released++;
        },
    };
    const environment = { main: { cookie: "foreign-main" } } as QueryEnvironment;
    const sample = await prepareSettingsRead(lease, environment, "site.get", "http");
    expect(events).toEqual(["prepare", "site.update"]);
    await sample.send();
    await sample.verify!();
    await sample.close!();
    expect(released).toBe(1);
    expect(events).toEqual(["prepare", "site.update", "site.get", "site.get", "site.update"]);
    const failed = {
        ...lease,
        value: {
            ...lease.value,
            prepare: async () => {
                throw Error("Owned fixture preparation failed");
            },
        },
    };
    await expect(prepareSettingsRead(failed, environment, "site.get", "http")).rejects.toThrow();
    expect(released).toBe(2);
});

test("all six settings readers have complete current HTTP/MCP variants in the assessment plan", async () => {
    const inventory = await performanceCapabilityInventory();
    const targets = inventory.targets.filter(
        (target) =>
            target.release.contractId === "ulvia/cms.content" &&
            SETTINGS_READERS.some((capability) => capability === target.definition.id),
    );
    expect(targets).toHaveLength(6);
    const keys = new Set(targets.map((target) => target.key));
    const scenarios = assessmentScenarios(inventory, "unit")
        .map((scenario) => scenario.definition)
        .filter((scenario) => scenario.obligations.every((row) => keys.has(row.target)));
    const added = scenarios.filter((scenario) => scenario.id.startsWith("content-settings-read."));
    expect(added).toHaveLength(12);
    expect(auditPlan({ ...inventory, targets }, scenarios)).toEqual([]);
    expect(
        auditPlan(
            { ...inventory, targets },
            scenarios.filter((scenario) => scenario.id !== added[0]!.id),
        ).some((row) => row.code === "missing-scenario" && row.obligation?.variant === "invalidation"),
    ).toBe(true);
});
