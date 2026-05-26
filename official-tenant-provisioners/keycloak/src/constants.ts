/** Default `providerId` advertised in `/.well-known/tenant-provisioner-info`. */
export const DEFAULT_KEYCLOAK_PROVIDER_ID = "keycloak";

/** The issuer URL of a realm, by Keycloak convention. The hub derives this
 *  from its known Keycloak base URL + the `tenantId` (= realm name) to wire
 *  the realm into other TPs' trusted-issuer lists. */
export const realmIssuerUrl = (keycloakBaseUrl: string, realm: string): string =>
    `${keycloakBaseUrl.replace(/\/+$/, "")}/realms/${realm}`;
