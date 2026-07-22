import type { LocalCredentialStore, TUser } from "@bernouy/cms-auth";

export type UserView = TUser & {
    label: string;
    email: string;
    provider: string;
    providerLabel: string;
    roleLabel: string;
    emailVerifiedAt: Date | null;
    emailStatusLabel: string;
    createdAtLabel: string;
    lastSeenAtLabel: string;
    subParam: string;
    emailVerificationAction: string;
    markVerifiedAction: string;
    passwordResetAction: string;
};

export async function userView(user: TUser, credentials: LocalCredentialStore): Promise<UserView> {
    const local = user.provider === "local";
    const email = user.email ?? "";
    const credential = local && email ? await credentials.getByEmail(email) : null;
    const verifiedAt = credential?.emailVerifiedAt ?? null;
    const canUseLocalEmailActions = local && Boolean(email);
    const isVerified = Boolean(verifiedAt);
    return {
        ...user,
        label: user.email?.trim() || user.sub,
        email,
        provider: user.provider ?? "external",
        providerLabel: providerLabel(user.provider),
        roleLabel: label(user.role),
        emailVerifiedAt: verifiedAt,
        emailStatusLabel: emailStatusLabel(local, email, verifiedAt),
        createdAtLabel: dateLabel(user.createdAt),
        lastSeenAtLabel: dateLabel(user.lastSeenAt),
        subParam: encodeURIComponent(user.sub),
        emailVerificationAction: flag(canUseLocalEmailActions && !isVerified),
        markVerifiedAction: flag(canUseLocalEmailActions && !isVerified),
        passwordResetAction: flag(canUseLocalEmailActions),
    };
}

function providerLabel(provider: string | undefined): string {
    if (!provider) {
        return "External";
    }
    if (provider === "local") {
        return "Local";
    }
    return label(provider);
}

function emailStatusLabel(local: boolean, email: string, verifiedAt: Date | null): string {
    if (!email) {
        return "No email";
    }
    if (!local) {
        return "Managed by provider";
    }
    return verifiedAt ? "Verified" : "Not verified";
}

function label(value: string): string {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function dateLabel(value: Date): string {
    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(value);
}

function flag(value: boolean): string {
    return value ? "true" : "false";
}
