import { createHash } from "node:crypto";
import { mkdir, open } from "node:fs/promises";
import { join } from "node:path";
import type { MongoClient } from "mongodb";
import { MongoContentRepository } from "@bernouy/content/mongo";
import { createContentReader } from "@bernouy/content/rendering";
import { captureMaintenancePage } from "@bernouy/content/public-delivery";
import { MongoHostingStore } from "@bernouy/hosting/mongo";
import { MongoProviderInstanceRegistry } from "../../runtime/instances/MongoProviderInstanceRegistry";
import { instanceDatabaseName } from "../../runtime/stores/storageRoots";
import { HostedTransport } from "../../runtime/instances/system/hosting/transport/HostedTransport";

/** Read-only preparation: never initialize stores, hydrate tenants or start business recovery. */
export async function exportMaintenancePages(mongo: MongoClient, directory: string, proxy: string) {
    const instances = new MongoProviderInstanceRegistry(mongo.db());
    const domains = new MongoHostingStore(mongo.db());
    const transport = new HostedTransport(proxy, domains, { getInstance: (id) => instances.get(id) });
    await mkdir(join(directory, "sites"), { mode: 0o700 });
    const sites: { id: string; hosts: string[]; resources: string[] }[] = [];
    const tlsHosts: string[] = [];
    let bytes = 0,
        hosts = 0;
    for await (const instance of instances.scan()) {
        if (instance.status !== "ready") {
            continue;
        }
        const active: string[] = [];
        let after: string | null = null;
        do {
            const page = await domains.listDomains({ instanceId: instance.id, after, limit: 50 });
            for (const domain of page.items) {
                if (domain.state !== "active") {
                    continue;
                }
                if (++hosts > 4096) {
                    throw new Error("Maintenance snapshot exceeds 4096 domains");
                }
                active.push(domain.hostname);
                if (domain.origin.startsWith("https:") && domain.tls === "ready") {
                    tlsHosts.push(domain.hostname);
                }
            }
            after = page.nextCursor;
        } while (after !== null);
        if (!active.length) {
            continue;
        }
        if (sites.length >= 1024 || !active.includes(new URL(instance.cmsUrl).hostname)) {
            throw new Error("Maintenance snapshot has too many sites or an inactive primary domain");
        }
        const id = createHash("sha256").update(instance.id).digest("hex");
        const content = createContentReader(
            new MongoContentRepository(mongo.db(instanceDatabaseName(instance.storageKey))),
        );
        const snapshot = await captureMaintenancePage(
            content,
            instance.cmsUrl,
            `/_content/maintenance/${id}`,
            (path, signal) => transport.request(new URL(path, instance.cmsUrl), { method: "GET", signal }),
            AbortSignal.timeout(15000),
        );
        const root = join(directory, "sites", id);
        await mkdir(root, { recursive: true, mode: 0o700 });
        const save = async (name: string, data: string | Uint8Array) => {
            bytes += typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
            if (bytes > 256 * 1024 * 1024) {
                throw new Error("Maintenance snapshot exceeds 256 MiB");
            }
            await durableFile(join(root, name), data);
        };
        await save("page.html", snapshot.html);
        for (const [index, resource] of snapshot.resources.entries()) {
            await save(String(index), resource.bytes);
        }
        sites.push({ id, hosts: active, resources: snapshot.resources.map((row) => row.contentType) });
    }
    await durableFile(
        join(directory, "pages.json"),
        JSON.stringify({ schema: "ulvia.maintenance-pages/v1", sites, tlsHosts }),
    );
}
async function durableFile(path: string, data: string | Uint8Array) {
    const file = await open(path, "wx", 0o600);
    try {
        await file.writeFile(data);
        await file.sync();
    } finally {
        await file.close();
    }
}
