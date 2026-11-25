import { domainHostname } from "@bernouy/hosting";
import { readPrivateFile } from "../../stack/orchestration/deployment/storage";
import { join } from "node:path";
export type MaintenancePages = {
    schema: "ulvia.maintenance-pages/v1";
    sites: { id: string; hosts: string[]; resources: string[] }[];
    tlsHosts: string[];
};
export const presentationDirectory = (backup: string) => `${backup}.presentation`;
export async function readPages(directory: string): Promise<MaintenancePages> {
    const value = JSON.parse(
        (await readPrivateFile(join(directory, "pages.json"), 4 * 1024 * 1024)) ?? "null",
    ) as MaintenancePages;
    const hosts = new Set<string>();
    const ids = new Set<string>();
    const host = (name: unknown): name is string => {
        try {
            return typeof name === "string" && domainHostname(name) === name;
        } catch {
            return false;
        }
    };
    if (
        !value ||
        value.schema !== "ulvia.maintenance-pages/v1" ||
        Object.keys(value).sort().join(",") !== "schema,sites,tlsHosts" ||
        !Array.isArray(value.sites) ||
        value.sites.length > 1024 ||
        !Array.isArray(value.tlsHosts)
    ) {
        throw new Error("Invalid maintenance Page manifest");
    }
    for (const site of value.sites) {
        if (
            !site ||
            Object.keys(site).sort().join(",") !== "hosts,id,resources" ||
            !/^[a-f0-9]{64}$/u.test(site.id) ||
            ids.has(site.id) ||
            !Array.isArray(site.hosts) ||
            !site.hosts.length ||
            !Array.isArray(site.resources) ||
            site.resources.length > 64 ||
            site.resources.some((type) => typeof type !== "string" || type.length > 256 || /[\r\n]/u.test(type))
        ) {
            throw new Error("Invalid maintenance site manifest");
        }
        ids.add(site.id);
        for (const name of site.hosts) {
            if (!host(name) || hosts.has(name) || hosts.size >= 4096) {
                throw new Error("Invalid maintenance domain manifest");
            }
            hosts.add(name);
        }
    }
    if (
        value.tlsHosts.length > hosts.size ||
        new Set(value.tlsHosts).size !== value.tlsHosts.length ||
        value.tlsHosts.some((name) => !host(name) || !hosts.has(name))
    ) {
        throw new Error("Invalid maintenance TLS manifest");
    }
    return value;
}
