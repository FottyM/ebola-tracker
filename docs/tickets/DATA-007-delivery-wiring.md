# DATA-007: Unify API, static build, and client data wiring

Status: Open  
Priority: High  
Dependencies: DATA-006, DATA-013

## Objective

Make development, production, GitHub Pages, and any retained edge runtime consume the same validated snapshot contract.

Production remains GitHub Pages. Follow the gated sequence in [the GitHub Pages data delivery plan](../github-pages-data-delivery-plan.md). A runtime production API is not part of this ticket.

## Scope

- Provide `/api/ebola-data` only as a local-development compatibility route, if retained.
- Make static builds inject the same snapshot version returned by the API.
- Define client refresh behavior for static and runtime hosting.
- Remove unsupported production API/Worker assumptions from the Pages path.
- Correct broken Vite+ development/start commands.

## Non-goals

- Redesigning the application.
- Introducing a new host without an explicit deployment decision.
- Silently falling back to bundled fabricated data.

## Deliverables

- Versioned static JSON and manifest delivery for GitHub Pages.
- Optional local JSON API backed by the same snapshot loader.
- Static snapshot-loading strategy for GitHub Pages.
- Shared loader for server rendering and prerendering.
- Deployment-entry-point decision and implementation.

## Acceptance criteria

- Development API requests, if retained, return the same JSON contract as the static snapshot.
- Static and runtime rendering agree for the same snapshot version.
- The browser can detect and load a newer validated static snapshot where supported.
- Failure behavior preserves provenance and freshness.
- Existing HTML, CSS, maps, charts, modals, and interactions remain unchanged.

## Verification

Run API contract tests, static/runtime parity tests, `vp check`, `vp test --run`, and the production build.
