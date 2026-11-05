const RESOURCE_PART = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;

export function isResourceNamespace(value: unknown): value is string {
    return typeof value === "string" && value.length <= 96 && RESOURCE_PART.test(value);
}

/** Resource identities include their owning namespace in every persisted reference. */
export function isResourceId(value: unknown): value is string {
    if (typeof value !== "string" || value.length > 193) {
        return false;
    }
    const parts = value.split("/");
    return parts.length === 2 && parts.every(isResourceNamespace);
}

export function resourcePublisher(id: string): string {
    assertResourceId(id);
    return id.slice(0, id.indexOf("/"));
}

export function resourceName(id: string): string {
    assertResourceId(id);
    return id.slice(id.indexOf("/") + 1);
}

/** Reversible CSS-safe ownership prefix; dots and hyphens in publishers cannot collide. */
export function resourceRuntimeNamespace(id: string): string {
    const publisher = resourcePublisher(id).replaceAll("-", "-h").replaceAll(".", "-d");
    const name = resourceName(id);
    if (name.includes(".")) {
        throw new TypeError("Runtime resource names must use kebab-case");
    }
    return `${publisher}--${name}`;
}

export function assertResourceId(value: unknown): asserts value is string {
    if (!isResourceId(value)) {
        throw new TypeError("Resource identity must be namespace/name with bounded lowercase identifiers");
    }
}
