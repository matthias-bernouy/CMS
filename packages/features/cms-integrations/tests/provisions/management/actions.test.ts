import { expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { parseActions } from "cms-integrations/core/parsing/artifacts/dashboard/actions";
import { definition, fixture } from "./fixture";

const fields = [{ id: "page", label: "Published page", path: "page", type: "page-link" as const, publishedOnly: true }];
test("declared action fields resolve only their own published page references", async () => {
    const resolved: string[] = [];
    const { service, installations } = await fixture(
        async (_installation, _fn, payload) => ({
            actionId: payload.actionId,
            resolvedPages: payload.resolvedPages,
            actor: payload.actor,
        }),
        {
            resolvePublishedPage: async (path) => {
                resolved.push(path);
                return path === "/missing"
                    ? null
                    : {
                          id: "page-123",
                          path,
                          title: "Trusted",
                          content: [],
                          publishedSnapshotUrl: "https://site.test/published/123",
                      };
            },
        },
    );
    const installed = (await installations.get(definition.kind))!;
    installed.definitionSnapshot!.management!.actions = [
        { id: "publish", label: "Publish", functionId: "manage", fields },
        { id: "retry", label: "Retry", functionId: "manage" },
    ];
    installed.definitionSnapshot!.management!.settings!.fields = [
        { id: "settingsPage", label: "Settings", path: "settingsPage", type: "page-link" },
    ];
    await installations.replace(installed);
    expect(
        await service.action(
            definition.kind,
            "publish",
            {
                page: "/terms",
                settingsPage: "/unrelated",
                resolvedPages: { page: { id: "forged" } },
            },
            { id: "admin", role: "admin" },
        ),
    ).toEqual({
        actionId: "publish",
        actor: { id: "admin", role: "admin" },
        resolvedPages: {
            page: {
                id: "page-123",
                path: "/terms",
                title: "Trusted",
                content: [],
                publishedSnapshotUrl: "https://site.test/published/123",
            },
        },
    });
    expect(resolved).toEqual(["/terms"]);
    await service.action(definition.kind, "retry", { page: "/unrelated" });
    expect(resolved).toEqual(["/terms"]);
    await expect(service.action(definition.kind, "publish", { page: "/missing" })).rejects.toThrow(
        "missing or unpublished",
    );
});

test("manifest and dashboard contracts parse declared management actions and reject malformed targets", () => {
    const manifest = {
        ...definition,
        management: {
            ...definition.management!,
            actions: [{ id: "publish", label: "Publish", functionId: "manage", fields }],
        },
    };
    expect(parseIntegrationDefinition(manifest).management?.actions?.[0]?.fields).toEqual(fields);
    expect(() =>
        parseIntegrationDefinition({
            ...manifest,
            management: {
                ...manifest.management,
                actions: [{ ...manifest.management.actions[0], fields: [{ ...fields[0], path: "__proto__.page" }] }],
            },
        }),
    ).toThrow("safe");
    const action = {
        id: "publish",
        label: "Publish",
        management: {
            installationId: definition.kind,
            action: "action",
            actionId: "publish",
            body: { page: "$field.page" },
        },
    };
    expect(parseActions([action], "actions")[0]?.management).toEqual(action.management);
    expect(() =>
        parseActions([{ ...action, management: { ...action.management, actionId: undefined } }], "actions"),
    ).toThrow("actionId");
    expect(() =>
        parseActions([{ ...action, management: { ...action.management, action: "save-settings" } }], "actions"),
    ).toThrow("actionId");
});
