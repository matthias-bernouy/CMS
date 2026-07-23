import { evaluateAnalyticsCompliance } from "@bernouy/cms-analytics";
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

export async function analyticsPrivacyPage(req: Request, delivery: DeliveryCms): Promise<Response> {
    const preference = privacyContext(req, delivery);
    const settings = await delivery.analytics?.getSettings();
    const noticeUrl = settings?.privacyNoticeUrl || delivery.analyticsPrivacyPolicyUrl;
    const policyLink = noticeUrl ? `<p><a href="${escapeHtml(noticeUrl)}">Read the privacy policy</a></p>` : "";
    const action = preference.optedOut ? PRIVACY_ANALYTICS_ROUTES.enable : PRIVACY_ANALYTICS_ROUTES.optOut;
    const label = preference.optedOut ? "Enable audience measurement" : "Disable audience measurement";
    return htmlResponse(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Privacy and analytics</title></head>
<body><main><h1>Privacy and analytics</h1>
<p>This site uses privacy-strict audience measurement without advertising identifiers, raw event logs, campaigns, or cross-day tracking.</p>
<p>IP addresses are truncated before a daily site-specific estimate is updated. Aggregate reports use closed time buckets, a minimum threshold of 10, and rounded counts.</p>
<p>Current preference: <strong>${preference.optedOut || settings?.enabled === false ? "analytics disabled" : "analytics enabled"}</strong>.</p>
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

export async function analyticsSelfAssessment(req: Request, delivery: DeliveryCms): Promise<Response> {
    const context = privacyContext(req, delivery);
    const snapshot = await delivery.analytics?.latestPublishedComplianceSnapshot();
    if (!delivery.analytics || !snapshot) {
        return noStore(
            Response.json(
                {
                    status: "not-published",
                    legalNotice: "No audience-measurement self-assessment has been published by the site owner.",
                },
                { status: 404 },
            ),
        );
    }
    const current = await evaluateAnalyticsCompliance(
        await delivery.analytics.getSettings(),
        complianceContext(delivery, context),
        snapshot.manualAttestations,
    );
    return noStore(
        Response.json({
            status: snapshot.evaluation.releaseReady ? "ready" : "incomplete",
            legalNotice:
                "Published engineering self-assessment only; this is not a CNIL certification or legal advice.",
            publishedAt: snapshot.publishedAt,
            checklistVersion: snapshot.evaluation.checklistVersion,
            releaseReady: snapshot.evaluation.releaseReady,
            stale: snapshot.evaluation.configurationFingerprint !== current.configurationFingerprint,
            criteria: snapshot.evaluation.criteria.map(({ id, label, status }) => ({ id, label, status })),
        }),
    );
}

function complianceContext(delivery: DeliveryCms, context: ReturnType<typeof privacyContext>) {
    const publicUrl = safeUrl(delivery.analyticsSiteScope ?? "");
    return {
        cmsVersion: delivery.analyticsCmsVersion,
        secretReady: context.secretReady,
        siteScope: delivery.analyticsSiteScope ?? "",
        trustProxy: delivery.analyticsTrustProxy,
        trustedProxyVerified: delivery.analyticsTrustedProxyVerified,
        secureCookie: context.secure,
        optOutUrl: publicUrl
            ? new URL(delivery.basePath + PRIVACY_ANALYTICS_ROUTES.page, publicUrl.origin).href
            : delivery.basePath + PRIVACY_ANALYTICS_ROUTES.page,
    };
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
