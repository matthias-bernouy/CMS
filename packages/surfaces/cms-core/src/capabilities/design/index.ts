import { composeCollectionThemes, readSystemSnapshot, type ThemeSettings } from "@bernouy/cms-content";
import {
    MAX_CAPABILITY_JSON_BYTES,
    MAX_CAPABILITY_JSON_DEPTH,
    parseStrictJson,
} from "@bernouy/cms-repository/contracts/protocol";
import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "../../dispatch/registry";
import type { CmsDesignDependencies } from "../../ports";
import { projectDesignOverview, projectTextCatalogue } from "./projection";

export function registerDesignCapabilities(dispatcher: CoreCapabilityRegistry, core: CmsDesignDependencies): void {
    dispatcher.register("ulvia.cms.design", "overview", async (_input, context) => {
        const [system, collections] = await Promise.all([
            readSystemSnapshot(core.repo),
            core.collections.snapshot(context.siteId),
        ]);
        return projectDesignOverview(system, collections);
    });
    dispatcher.register("ulvia.cms.design", "update-languages", async (input) =>
        designCommand(async () => {
            const expectedRevision = revision(input.expectedRevision);
            const system = await core.repo.updateSystem(
                {
                    site: {
                        language: language(input.language),
                        additionalLanguages: languages(input.additionalLanguages),
                        activeLanguages: languages(input.activeLanguages),
                    },
                } as never,
                expectedRevision,
            );
            return {
                revision: expectedRevision + 1,
                language: system.site.language,
                additionalLanguages: system.site.additionalLanguages ?? [],
                activeLanguages: system.site.activeLanguages ?? [],
            };
        }),
    );
    dispatcher.register("ulvia.cms.design", "get-theme", async (_input, context) => {
        const [snapshot, collections] = await Promise.all([
            readSystemSnapshot(core.repo),
            core.collections.snapshot(context.siteId),
        ]);
        const theme = composeCollectionThemes(
            snapshot.system.theme,
            collections.collections.map(({ release }) => release),
            snapshot.system.site.language,
        );
        return {
            revision: snapshot.revision,
            activeThemeId: theme.activeThemeId,
            themeJson: JSON.stringify(theme),
        };
    });
    dispatcher.register("ulvia.cms.design", "save-theme", async (input, context) =>
        designCommand(async () => {
            const expectedRevision = revision(input.expectedRevision);
            const [snapshot, collections] = await Promise.all([
                readSystemSnapshot(core.repo),
                core.collections.snapshot(context.siteId),
            ]);
            const theme = composeCollectionThemes(
                parseJson(input.themeJson) as ThemeSettings,
                collections.collections.map(({ release }) => release),
                snapshot.system.site.language,
            );
            const system = await core.repo.updateSystem({ theme }, expectedRevision);
            return {
                revision: expectedRevision + 1,
                activeThemeId: system.theme.activeThemeId,
                themeJson: JSON.stringify(system.theme),
            };
        }),
    );
    dispatcher.register("ulvia.cms.design", "get-texts", async (input, context) => {
        const snapshot = await core.collections.snapshot(context.siteId);
        const installation = snapshot.collections.find(({ collectionId }) => collectionId === input.collectionId);
        if (!installation) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectTextCatalogue(snapshot.revision, installation, optionalText(input.locale));
    });
    dispatcher.register("ulvia.cms.design", "save-texts", async (input, context) =>
        designCommand(async () => {
            const snapshot = await core.collections.saveTexts(
                context.siteId,
                requiredText(input.collectionId),
                revision(input.expectedRevision),
                parseJson(input.overridesJson),
            );
            const installation = snapshot.collections.find(({ collectionId }) => collectionId === input.collectionId)!;
            return projectTextCatalogue(snapshot.revision, installation, optionalText(input.locale));
        }),
    );
}

async function designCommand<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CoreCapabilityDispatchError) {
            throw error;
        }
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 0;
        if (status === 404) {
            throw new CoreCapabilityDispatchError("NOT_FOUND", 404);
        }
        if (status === 409) {
            throw new CoreCapabilityDispatchError("REVISION_CONFLICT", 409);
        }
        if (String(error).includes("migration is in progress")) {
            throw new CoreCapabilityDispatchError("MIGRATION_IN_PROGRESS", 423);
        }
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
}

function parseJson(value: unknown): unknown {
    if (typeof value !== "string") {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return parseStrictJson(new TextEncoder().encode(value), MAX_CAPABILITY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH);
}

function languages(value: unknown): string[] {
    if (!Array.isArray(value)) {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.map(language);
}

function language(value: unknown): string {
    const candidate = requiredText(value).trim();
    try {
        return Intl.getCanonicalLocales(candidate)[0] ?? invalid();
    } catch {
        return invalid();
    }
}

function invalid(): never {
    throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
}

function revision(value: unknown): number {
    return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : invalid();
}

function optionalText(value: unknown): string | undefined {
    return typeof value === "string" && value.length ? value : undefined;
}

function requiredText(value: unknown): string {
    return optionalText(value) ?? invalid();
}
