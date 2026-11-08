import { isCanonicalSemVer, isRepositoryIdentifier } from "@bernouy/ulvia-contracts/compatibility";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { boundedResponseBytes } from "@bernouy/repository/repository/publication/transport";

export type InstanceProfile = Readonly<{ id: string; version: string }>;

export function parseInstanceProfile(value: unknown): InstanceProfile {
    const profile = value as InstanceProfile;
    if (
        !profile ||
        typeof profile !== "object" ||
        Array.isArray(profile) ||
        Object.keys(profile).sort().join(",") !== "id,version" ||
        !isRepositoryIdentifier(profile.id) ||
        !isCanonicalSemVer(profile.version)
    ) {
        throw new Error("Invalid instance profile; use an exact id@version");
    }
    return Object.freeze({ id: profile.id, version: profile.version });
}

export function instanceProfileCoordinate(value: string): InstanceProfile {
    const separator = value.lastIndexOf("@");
    if (separator < 1) {
        throw new Error("Instance profile must use an exact id@version");
    }
    return parseInstanceProfile({ id: value.slice(0, separator), version: value.slice(separator + 1) });
}

/** The Provider owns shipped profile versions; the CLI stores only an exact selected reference. */
export async function selectInstanceProfile(
    providerUrl: string,
    operatorToken: string,
    requested?: string,
): Promise<InstanceProfile> {
    const explicit = requested ? instanceProfileCoordinate(requested) : undefined;
    const response = await fetch(`${providerUrl}/ulvia/operator/profiles`, {
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${operatorToken}` },
    });
    if (!response.ok) {
        await response.body?.cancel();
        throw new Error(`Cannot read Provider profiles (${response.status})`);
    }
    const value = parseStrictJson(await boundedResponseBytes(response, 16_384), 16_384, 4) as {
        defaultProfile: unknown;
        profiles: unknown[];
    };
    if (
        !value ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).sort().join(",") !== "defaultProfile,profiles" ||
        !Array.isArray(value.profiles) ||
        value.profiles.length < 1 ||
        value.profiles.length > 32
    ) {
        throw new Error("Invalid Provider profiles response");
    }
    const profiles = value.profiles.map(parseInstanceProfile);
    const defaultProfile = parseInstanceProfile(value.defaultProfile);
    const target = explicit ?? defaultProfile;
    if (
        new Set(profiles.map((profile) => `${profile.id}@${profile.version}`)).size !== profiles.length ||
        !profiles.some((profile) => profile.id === defaultProfile.id && profile.version === defaultProfile.version) ||
        !profiles.some((profile) => profile.id === target.id && profile.version === target.version)
    ) {
        throw new Error("Requested instance profile is unavailable");
    }
    return target;
}
