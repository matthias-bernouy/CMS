import { renderSafeMarkdown } from "@bernouy/cms-content";
import type { RepositoryCatalogVersionView } from "../view/models";
import { repositoryPackageDownloadPath } from "../routes";
import { escapeAttr, escapeHtml, formatBytes, humanLabel } from "./html";

export function renderVersionSections(view: RepositoryCatalogVersionView): string {
    return [
        renderPackage(view),
        renderProviders(view),
        renderDependencies(view),
        renderArtifacts(view),
        renderInstructions(view),
        renderReleaseNotes(view),
    ].join("");
}

function renderPackage(view: RepositoryCatalogVersionView): string {
    const href = repositoryPackageDownloadPath(view.integration.kind, view.version);
    return `<section class="package"><h2>Package</h2>
<p><a href="${escapeAttr(href)}" download>Download ${escapeHtml(view.integration.kind)}@${escapeHtml(view.version)}</a></p>
<dl>
<div><dt>Digest</dt><dd><code>${escapeHtml(view.package?.digest ?? "Unavailable for this legacy version")}</code></dd></div>
<div><dt>Canonical size</dt><dd>${escapeHtml(formatBytes(view.package?.canonicalBytes))}</dd></div>
</dl></section>`;
}

function renderProviders(view: RepositoryCatalogVersionView): string {
    return `<section class="providers"><h2>Technical providers</h2>${
        view.providers.length > 0
            ? `<ul>${view.providers.map((provider) => `<li>${escapeHtml(provider)}</li>`).join("")}</ul>`
            : "<p>No technical provider is declared.</p>"
    }</section>`;
}

function renderDependencies(view: RepositoryCatalogVersionView): string {
    return `<section class="dependencies"><h2>Dependencies</h2>${
        view.dependencies.length > 0
            ? `<ul>${view.dependencies
                  .map(
                      (dependency) =>
                          `<li><a href="/integrations/${escapeAttr(dependency.kind)}">${escapeHtml(dependency.name)}</a> <code>${escapeHtml(dependency.versionRange ?? "any version")}</code>${dependency.optional ? " (optional)" : ""}</li>`,
                  )
                  .join("")}</ul>`
            : "<p>This version has no integration dependencies.</p>"
    }</section>`;
}

function renderArtifacts(view: RepositoryCatalogVersionView): string {
    return `<section class="artifacts"><h2>Artifacts</h2>${
        view.artifacts.length > 0
            ? `<ul>${view.artifacts.map(({ type, count }) => `<li>${escapeHtml(humanLabel(type))}: ${count}</li>`).join("")}</ul>`
            : "<p>No declarative artifacts are included.</p>"
    }</section>`;
}

function renderInstructions(view: RepositoryCatalogVersionView): string {
    const instructions = view.definition.ui?.instructions ?? [];
    return `<section class="instructions"><h2>Instructions</h2>${
        instructions.length > 0
            ? instructions
                  .map(
                      ([title, markdown]) =>
                          `<article><h3>${escapeHtml(title)}</h3><div class="markdown">${renderSafeMarkdown(markdown)}</div></article>`,
                  )
                  .join("")
            : "<p>No additional instructions are published.</p>"
    }</section>`;
}

function renderReleaseNotes(view: RepositoryCatalogVersionView): string {
    return `<section class="release-notes"><h2>Release notes</h2>${
        view.releaseNotes
            ? `<div class="markdown">${renderSafeMarkdown(view.releaseNotes)}</div>`
            : "<p>No release notes are available for this legacy version.</p>"
    }</section>`;
}
