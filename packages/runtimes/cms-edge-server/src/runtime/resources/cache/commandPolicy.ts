/** Content/installation changes purge. File visibility/bytes/keys may change inline SVG output.
 * Signing and unfinished upload chunks do not change readable bytes. Other domains are neutral.
 * Every new official command requires explicit classification and catalogue coverage.
 */
const COMMANDS: Readonly<Record<string, Readonly<Record<string, "purge" | "neutral">>>> = {
    "ulvia/cms.observability": {
        "logs.append": "neutral",
    },
    "ulvia/provider.connections": {
        "connections.configure": "neutral",
    },
    "ulvia/repository": {
        "namespace-claim": "neutral",
        "namespace-suspend": "neutral",
        "namespace-transfer": "neutral",
        "publication-abort": "neutral",
        "publication-asset": "neutral",
        "publication-begin": "neutral",
        "publication-commit": "neutral",
        "publication-build": "neutral",
        "publication-yank": "neutral",
        "artifact-source-put": "neutral",
        "source-put": "neutral",
    },
    "ulvia/cms.authoring": {
        "configure-connection": "neutral",
        "disconnect-connection": "neutral",
        "prepare-collection": "neutral",
        "prepare-contract": "neutral",
        "prepare-provider-manifest": "neutral",
        "publish-contract": "neutral",
        "publish-provider-manifest": "neutral",
        "claim-namespace": "neutral",
        "discard-preparation": "neutral",
        "publish-collection": "neutral",
        "publish-collection-operation": "neutral",
    },
    "ulvia/cms.access": {
        "create-personal-access-token": "neutral",
        "revoke-personal-access-token": "neutral",
        "deny-mcp-authorization": "neutral",
        "exchange-mcp-token": "neutral",
        "prepare-mcp-authorization": "neutral",
        "request-email-verification": "neutral",
        "revoke-mcp-connection": "neutral",
        "delete-user": "neutral",
        "logout": "neutral",
        "register-mcp-client": "neutral",
        "login-password": "neutral",
        "set-administrator": "neutral",
        "request-password-reset": "neutral",
        "signup": "neutral",
        "confirm-password-reset": "neutral",
        "authorize-mcp-connection": "neutral",
        "confirm-email-verification": "neutral",
    },
    "ulvia/cms.emailer": {
        "emailer.send": "neutral",
    },
    "ulvia/cms.emailer.smtp": {
        "smtp.configuration.update": "neutral",
    },
    "ulvia/cms.content": {
        "theme.token.save": "purge",
        "theme.activate": "purge",
        "theme.token.reset": "purge",
        "localization.text.save": "purge",
        "localization.update": "purge",
        "site.update": "purge",
        "pages.create": "purge",
        "pages.publish": "purge",
        "pages.update": "purge",
        "pages.update-seo": "purge",
        "pages.delete": "purge",
        "pages.update-route": "purge",
        "pages.rename": "purge",
        "site-blocs.restore": "purge",
        "site-blocs.create": "purge",
        "site-blocs.publish": "purge",
        "site-blocs.archive": "purge",
    },
    "ulvia/cms.installations": {
        "initialization.apply": "purge",
        "initialization.repository.configure": "purge",
        "initialization.repository.create": "purge",
        "gateway.provider.prepare": "purge",
        "gateway.invocation.issue": "purge",
        "gateway.delegation.issue": "purge",
        "preview-provider-connection": "purge",
        "approve-provider-connection": "purge",
        "import-provider-manifest": "purge",
        "install-collection": "purge",
        "install-collections": "purge",
        "configure-collection": "purge",
        "resume-collection-upgrade": "purge",
        "set-provider-status": "purge",
        "gateway.provider.resolve": "purge",
        "apply-collection-upgrade": "purge",
        "pair-provider-connection": "purge",
        "apply-contract-upgrade": "purge",
        "resume-contract-upgrade": "purge",
        "update-collection-configuration": "purge",
        "gateway.dispatch.prepare": "purge",
        "gateway.delegation.close": "purge",
        "gateway.identity.resolve": "purge",
        "gateway.audit.append": "purge",
    },
    "ulvia/cms.secrets": {
        "namespace.delete": "neutral",
        "secrets.create": "neutral",
        "namespace.keys.create": "neutral",
        "namespace.create": "neutral",
        "secrets.rotate": "neutral",
        "namespace.keys.rotate": "neutral",
        "secrets.delete": "neutral",
        "namespace.keys.revoke": "neutral",
    },
    "ulvia/cms.files": {
        "workspace.upload.create": "neutral",
        "workspace.upload.complete": "purge",
        "namespace.delete": "purge",
        "files.sign": "neutral",
        "namespace.keys.create": "purge",
        "namespace.create": "purge",
        "workspace.files.set-visibility": "purge",
        "files.update": "purge",
        "representations.sign": "neutral",
        "workspace.files.update": "purge",
        "files.publish": "purge",
        "upload.create": "neutral",
        "upload.write": "neutral",
        "workspace.files.delete": "purge",
        "upload.complete": "purge",
        "files.make-private": "purge",
        "namespace.keys.rotate": "purge",
        "workspace.files.sign": "neutral",
        "files.delete": "purge",
        "namespace.keys.revoke": "purge",
    },
};
export function commandCacheEffect(contractId: string, capabilityId: string): "purge" | "neutral" | null {
    if (!contractId.startsWith("ulvia/")) {
        return "neutral";
    }
    return COMMANDS[contractId]?.[capabilityId] ?? null;
}

/** Content mutations invalidate rendered state; immutable bytes keep their addressed representation.
 * Untagged v1 responses still purge globally. Installation and unknown mutations remain global.
 */
export function commandCacheTags(contractId: string): readonly string[] | undefined {
    return contractId === "ulvia/cms.content" || contractId === "ulvia/cms.files"
        ? ["content:pages", "content:mutable"]
        : undefined;
}
