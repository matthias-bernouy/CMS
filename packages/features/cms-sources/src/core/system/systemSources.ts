import { parseUrn } from "./urn";

/** Former system Source identities remain reserved so stored records cannot impersonate CMS routes. */
export const SYSTEM_SOURCE_ID_PREFIX = "system-";

export function isSystemSourceId(sourceId: string): boolean {
    return sourceId.startsWith(SYSTEM_SOURCE_ID_PREFIX);
}

export function isSystemSourceUrn(urn: string): boolean {
    const parsed = parseUrn(urn);
    return parsed !== null && parsed.endpoint === null && isSystemSourceId(parsed.source);
}
