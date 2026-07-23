import { ANALYTICS_VERSIONS, STRICT_ANALYTICS_LIMITS } from "@bernouy/cms-analytics";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import {
    analyticsOptOutCookieName,
    analyticsPreferenceCookie,
    isAnalyticsCollectionAllowed,
} from "./privacyPreference";

export const PRIVACY_ANALYTICS_ROUTES = {
    page: "/.cms/privacy/analytics",
    optOut: "/.cms/privacy/analytics/opt-out",
    enable: "/.cms/privacy/analytics/enable",
    selfAssessment: "/.cms/privacy/analytics/self-assessment",
} as const;

export function analyticsPrivacyPage(req: Request, delivery: DeliveryCms): Response {
    const preference = privacyContext(req, delivery);
    const policyLink = delivery.analyticsPrivacyPolicyUrl
        ? `<p><a href="${escapeHtml(delivery.analyticsPrivacyPolicyUrl)}">Read the privacy policy</a></p>`
        : "";
    const action = preference.optedOut ? PRIVACY_ANALYTICS_ROUTES.enable : PRIVACY_ANALYTICS_ROUTES.optOut;
    const label = preference.optedOut ? "Enable audience measurement" : "Disable audience measurement";
    return htmlResponse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Privacy and analytics</title></head>
<body><main><h1>Privacy and analytics</h1>
<p>This site uses privacy-strict audience measurement without advertising identifiers, raw event logs, campaigns, or cross-day tracking.</p>
<p>IP addresses are truncated before a daily site-specific estimate is updated. Aggregate reports use closed time buckets, a minimum threshold of 10, and rounded counts.</p>
<p>Current preference: <strong>${preference.optedOut ? "analytics disabled" : "analytics enabled"}</strong>.</p>
<form method="post" action="${escapeHtml(delivery.basePath + action)}"><button type="submit">${label}</button></form>
${policyLink}<p><a href="${escapeHtml(delivery.basePath + PRIVACY_ANALYTICS_ROUTES.selfAssessment)}">View the audience-measurement self-assessment</a></p>
</main></body></html>`);
}

export function analyticsPreferencePost(req: Request, delivery: DeliveryCms, optedOut: boolean): Response {
    const context = privacyContext(req, delivery);
    if (req.headers.get("origin") !== context.expectedOrigin) {
        return noStore(new Response("Invalid origin", { status: 403 }));
    }
    const response = new Response(null, {
        status: 303,
        headers: {
            Location: delivery.basePath + PRIVACY_ANALYTICS_ROUTES.page,
            "Set-Cookie": analyticsPreferenceCookie(
                context.cookieName,
                optedOut,
                delivery.basePath || "/",
                context.secure,
            ),
        },
    });
    return noStore(response);
}

export function analyticsSelfAssessment(req: Request, delivery: DeliveryCms): Response {
    const context = privacyContext(req, delivery);
    return noStore(
        Response.json({
            status: delivery.analytics && context.secretReady && context.siteScopeReady ? "configured" : "incomplete",
            legalNotice:
                "Technical self-assessment only; the exemption also depends on every other tracker, purpose, recipient, transfer, and site practice.",
            profile: "privacy-strict",
            versions: ANALYTICS_VERSIONS,
            collection: {
                rawEvents: false,
                rawIpRetained: false,
                rawUserAgentRetained: false,
                campaigns: false,
                crossDayIdentity: false,
                visitorEstimator: "HLL++ daily site scope",
                pageIdentity: "resolved CMS page ids",
                externalReferrers: "registrable domains with bounded frequent-item admission",
            },
            publication: {
                threshold: STRICT_ANALYTICS_LIMITS.publicationThreshold,
                rounding: 10,
                completedBucketsOnly: true,
            },
            retention: {
                sketchHours: STRICT_ANALYTICS_LIMITS.sketchTtlHours,
                rollupDays: STRICT_ANALYTICS_LIMITS.rollupRetentionDays,
            },
            readiness: {
                analyticsEnabled: Boolean(delivery.analytics),
                secretReady: context.secretReady,
                siteScopeReady: context.siteScopeReady,
                trustProxy: delivery.analyticsTrustProxy,
                secureCookie: context.secure,
                optedOut: context.optedOut,
            },
            optOutUrl: delivery.basePath + PRIVACY_ANALYTICS_ROUTES.page,
        }),
    );
}

function privacyContext(req: Request, delivery: DeliveryCms) {
    const siteScope = delivery.analyticsSiteScope ?? "";
    const publicUrl = safeUrl(siteScope);
    const cookieName = analyticsOptOutCookieName(siteScope);
    return {
        cookieName,
        expectedOrigin: publicUrl?.origin ?? new URL(req.url).origin,
        secure: publicUrl?.protocol === "https:",
        optedOut: !isAnalyticsCollectionAllowed(req, cookieName, delivery.analyticsHonorDnt),
        secretReady: Boolean(delivery.analyticsVisitorSecret?.trim()),
        siteScopeReady: Boolean(publicUrl),
    };
}

function htmlResponse(body: string): Response {
    return noStore(
        new Response(body, {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Content-Security-Policy":
                    "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
            },
        }),
    );
}

function noStore(response: Response): Response {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Vary", "Cookie");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
}

function safeUrl(value: string): URL | undefined {
    try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:" ? url : undefined;
    } catch {
        return;
    }
}

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}
