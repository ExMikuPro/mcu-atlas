# Contributing to MCU Atlas

Report a missing device or incorrect document with the exact ordering code, an official product link, a document ID and a reference to the coverage table or ordering section. Preserve suffixes and distinguish base devices, variants and orderable parts.

For a new adapter, first document source ownership and access rules in `docs/sources.md`. Inspect the manufacturer's official product pages, document metadata, any supported machine-readable feed, and representative parts. Explain how the adapter establishes exact existence and whether a document is device-specific, subfamily-wide or family-wide.

Use the source adapter contract in `collector/adapters/types.ts`. Include a minimal extract of genuine source data and tests for malformed or missing data and conflicting evidence. Preserve the upstream license and attribution for source excerpts. Provide official PDF links and record version or publication fields only when the source establishes them.

Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before opening a PR. Include the scope and verification evidence for data changes. Keep source snapshots in version control, with generated assets reproduced during the build.
