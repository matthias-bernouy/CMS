import { deepFreeze } from "@bernouy/ulvia-contracts/protocol";
import type { AdmittedContractRelease } from "@bernouy/ulvia-contracts";
import type { AdmittedProviderManifest } from "@bernouy/ulvia-providers";
import type { GatewayRoute } from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayDefinitionCache } from "./DefinitionCache";
import { definitionHash, definitionKind } from "./values";
import type {
    GatewayDefinition,
    GatewayDefinitionEntry,
    GatewayDefinitionValue,
    GatewayDefinitionLease,
    GatewayRoutePacket,
    GatewayContractPacket,
    GatewayRouteSource,
    ReferencedGatewayRoute,
} from "./types";

export class GatewayRouteCodec {
    readonly definitions: GatewayDefinitionCache;
    constructor(maxEntries = 128, maxBytes = 8 * 1024 ** 2) {
        this.definitions = new GatewayDefinitionCache(maxEntries, maxBytes);
    }
    async route(packet: GatewayRoutePacket, lease: GatewayDefinitionLease): Promise<GatewayRouteSource> {
        if (typeof packet.snapshot !== "string" || packet.snapshot.length > 1024 ** 2) {
            throw new TypeError("Gateway route snapshot is invalid");
        }
        const envelope = JSON.parse(packet.snapshot) as { format?: string; route?: ReferencedGatewayRoute };
        if (
            envelope?.format !== "ulvia.gateway-route.v1" ||
            !envelope.route?.release ||
            !envelope.route.requestedRelease ||
            !envelope.route.manifest
        ) {
            throw new TypeError("Gateway route snapshot format is invalid");
        }
        const loaded = await this.load(packet.definitions);
        const get = (key: string, kind: "contract" | "manifest") => {
            if (definitionKind(key) !== kind) {
                throw new TypeError("Gateway definition kind does not match its reference");
            }
            const entry = loaded.get(key) ?? lease.get(key);
            if (!entry) {
                throw new TypeError("Gateway route references an unknown definition");
            }
            return entry;
        };
        const source = envelope.route;
        const release = get(source.release.admission, "contract");
        const requested = get(source.requestedRelease.admission, "contract");
        const manifest = get(source.manifest.admission, "manifest");
        const route: GatewayRoute = {
            ...source,
            release: { ...source.release, admission: release.value as AdmittedContractRelease },
            requestedRelease: { ...source.requestedRelease, admission: requested.value as AdmittedContractRelease },
            manifest: { ...source.manifest, admission: manifest.value as AdmittedProviderManifest },
        };
        // Remove the envelope and replace three quoted references with their original JSON lengths.
        // This preserves the old complete-route admission and route-cache size ceilings.
        const characters =
            packet.snapshot.length -
            '{"format":"ulvia.gateway-route.v1","route":'.length -
            1 +
            release.json.length +
            requested.json.length +
            manifest.json.length -
            source.release.admission.length -
            source.requestedRelease.admission.length -
            source.manifest.admission.length -
            6;
        if (characters > 1024 ** 2) {
            throw new TypeError("Installations Provider Gateway route is too large");
        }
        lease.release();
        this.retain(loaded);
        return { route, characters };
    }
    async contract(
        packet: GatewayContractPacket,
        lease: GatewayDefinitionLease,
    ): Promise<AdmittedContractRelease | null> {
        if (typeof packet.found !== "boolean" || typeof packet.key !== "string") {
            throw new TypeError("Gateway tool response is invalid");
        }
        const loaded = await this.load(packet.definitions);
        if (!packet.found) {
            if (packet.key || loaded.size) {
                throw new TypeError("Missing Gateway tool cannot return definitions");
            }
            return null;
        }
        if (definitionKind(packet.key) !== "contract") {
            throw new TypeError("Gateway tool references an invalid definition");
        }
        const entry = loaded.get(packet.key) ?? lease.get(packet.key);
        if (!entry) {
            throw new TypeError("Gateway tool references an unknown definition");
        }
        lease.release();
        this.retain(loaded);
        return entry.value as AdmittedContractRelease;
    }
    private async load(definitions: readonly GatewayDefinition[]): Promise<Map<string, GatewayDefinitionEntry>> {
        if (!Array.isArray(definitions) || definitions.length > 3) {
            throw new TypeError("Gateway definitions exceed their bound");
        }
        const loaded = new Map<string, GatewayDefinitionEntry>();
        for (const { key, json } of definitions) {
            const kind = definitionKind(key);
            if (
                typeof json !== "string" ||
                json.length > 1024 ** 2 ||
                key !== `${kind}:${await definitionHash(json)}` ||
                loaded.has(key)
            ) {
                throw new TypeError("Gateway definition content does not match its identity");
            }
            const value = JSON.parse(json) as GatewayDefinitionValue;
            if (
                !value ||
                typeof value !== "object" ||
                typeof value.canonicalJson !== "string" ||
                typeof value.digest !== "string" ||
                !/^sha256:[a-f0-9]{64}$/u.test(value.digest) ||
                (kind === "contract" ? !("release" in value) || !Array.isArray(value.bindings) : !("manifest" in value))
            ) {
                throw new TypeError("Gateway definition is not an admitted representation");
            }
            loaded.set(key, { json, value: deepFreeze(value), bytes: 0, leases: 0 });
        }
        return loaded;
    }
    private retain(loaded: ReadonlyMap<string, GatewayDefinitionEntry>) {
        for (const [key, { json, value }] of loaded) {
            this.definitions.retain(key, json, value);
        }
    }
}
