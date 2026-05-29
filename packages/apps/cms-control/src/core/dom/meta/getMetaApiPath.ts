import { getMetaBasePath } from "./getMetaBasePath";

export function getMetaApiPath(): string {
    return `${getMetaBasePath()}/api`;
}
