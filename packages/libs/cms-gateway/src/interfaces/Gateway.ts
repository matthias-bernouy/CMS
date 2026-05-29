import type { DataShape } from "./DataShape";

export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

/** Where a rule's value comes from. */
export type EndpointRuleSource =
    | { from: 'static'; value: string }   // ex: "2024-01"
    | { from: 'secret'; ref: string }     // ex: ${STRIPE_KEY} → credential de l'app
    | { from: 'userId' };                 // identité du user CMS courant

/**
 * Règles d'injection sortantes, composables, appliquées dans l'ordre.
 * À l'étape 0 (sans auth) AUCUNE n'est appliquée — c'est le seam pluggable.
 * Une règle `from: 'userId'` exigera une session CMS authentifiée (validé
 * quand les rules seront câblées).
 */
export type EndpointRule =
    | { place: 'bearer';                                       source: EndpointRuleSource }
    | { place: 'header'; name: string;                         source: EndpointRuleSource }
    | { place: 'query';  param: string;                        source: EndpointRuleSource }
    | { place: 'jwt'; header?: string; audience?: string; signingKeyRef: string; source: EndpointRuleSource };

/** Un paramètre d'entrée + son emplacement dans la requête amont. */
export type EndpointParam = {
    name: string;
    in: 'path' | 'query' | 'header';   // 'path' → templé dans `targetUrl` sous la forme {name}
    required?: boolean;
    description?: string;
    schema: DataShape;
};

/** Métadonnées descriptives pour l'éditeur (listing/présentation). Pas utilisées par le proxy. */
export type GatewayMeta = {
    name: string;
    description?: string;
    icon?: string;
};

export type Endpoint = {
    urn: string;            // ex: "urn:provider-id:getUser" (method PAS dans l'urn)
    method: HTTPMethod;
    targetUrl: string;      // ex: "https://api.example.com/v1/users/{id}"
    rules: EndpointRule[];  // étape 0: [] (aucune appliquée)

    meta?: GatewayMeta;

    /** Contrat de requête : pilote le formulaire éditeur ET la construction de l'appel amont. */
    input?: {
        params?: EndpointParam[];
        body?: DataShape;
    };

    /** Contrat de réponse : pilote le binding des champs côté éditeur (flattenScalars). */
    output?: DataShape;
};

export type Provider = {
    urn: string;            // ex: "urn:provider-id"
    meta?: GatewayMeta;
    endpoints: Endpoint[];
};
