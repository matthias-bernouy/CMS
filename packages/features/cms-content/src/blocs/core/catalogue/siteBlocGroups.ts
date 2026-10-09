import { randomUUIDv7 } from "bun";
import type { SiteBlocGroup } from "cms-content/blocs/interfaces/blocs";
import { ContentValidationError } from "cms-content/application/core/validation/errors";

export const DEFAULT_SITE_BLOC_GROUP_ID = "site";

export function siteBlocGroups(groups: SiteBlocGroup[]): SiteBlocGroup[] {
    return [
        structuredClone(groups.find(({ id }) => id === DEFAULT_SITE_BLOC_GROUP_ID)) ?? {
            id: DEFAULT_SITE_BLOC_GROUP_ID,
            name: "Site",
            description: "Compositions created for this site.",
        },
        ...structuredClone(groups)
            .filter(({ id }) => id !== DEFAULT_SITE_BLOC_GROUP_ID)
            .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)),
    ];
}

export function validateSiteBlocGroupInput(input: Omit<SiteBlocGroup, "id">): Omit<SiteBlocGroup, "id"> {
    if (!input || typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 120) {
        throw new ContentValidationError("name", "a name of 1 to 120 characters is required");
    }
    if (typeof input.description !== "string" || input.description.length > 1000) {
        throw new ContentValidationError("description", "a description of at most 1000 characters is required");
    }
    if (input.icon !== undefined && !["folder", "layers", "grid", "layout", "star", "code"].includes(input.icon)) {
        throw new ContentValidationError("icon", "unsupported group icon");
    }
    return {
        name: input.name.trim(),
        description: input.description.trim(),
        ...(input.icon ? { icon: input.icon } : {}),
    };
}

export function createSiteBlocGroup(input: Omit<SiteBlocGroup, "id">): SiteBlocGroup {
    return { id: randomUUIDv7(), ...validateSiteBlocGroupInput(input) };
}
