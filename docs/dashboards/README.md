# Dashboards And Views

Collections can release Control HTML views from `views/<view-id>/definition.json`
and `view.html`. The first format admits semantic HTML, text and declared local
bloc tags. It rejects scripts, links, inline handlers, styles and arbitrary
provider bindings. The Control view runner exposes read-only `dashboard.name`
and `dashboard.viewCount` through the existing document binding core.

A collection may release `dashboards/<dashboard-id>/definition.json`. Its
`navigation` is a tree of groups and view references. A primary item may lead
directly to tabs or to a lateral section whose children may lead to tabs. A
view can appear only once in one dashboard. The collection owns its dashboard
definition; the site owns activation and member assignments. Collection
dashboards start inactive after installation, and a collection upgrade updates
their definitions. The optional `contracts` list identifies sources actually
used by a dashboard for links on the Sources page.

`/admin/dashboards` explores dashboard definitions in configured repositories,
grouped at the latest collection release, and can install or upgrade the
underlying collection. Installed dashboards appear in the secondary navigation,
grouped by collection. Administrators can activate them, assign members and
make a private copy. The same page can create, edit and delete private site
dashboards. Its navigation editor selects views from installed collections,
arranges up to three levels and permits a primary item to open tabs directly.
A new private dashboard starts inactive.

Active assigned dashboards appear in the header dashboard switcher. The view
page uses the defined primary, lateral and tab navigation. Every view and
context request checks the current dashboard state and member assignment;
disabling a dashboard removes member access immediately. Administrator edits
use optimistic revisions to detect concurrent changes.

The current Control view runner does not admit authored provider calls or
command forms, compile execution grants or render installed bloc browser
bundles inside dashboard views. The `Test` collection contains two simple
HTML views and a collection dashboard for local exercises.
