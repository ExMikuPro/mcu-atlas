# MCU Atlas

MCU Atlas is an open-source, serverless index of official microcontroller documentation. It exposes a JSON API for looking up an exact orderable part and finding the datasheet, reference manual and errata that apply to it.

## v0.1 coverage

| Manufacturer | Base device | Exact orderable parts |
| --- | --- | --- |
| STMicroelectronics | STM32F407VE | STM32F407VET6, STM32F407VET6TR |
| STMicroelectronics | STM32F407VG | STM32F407VGT6 |
| STMicroelectronics | STM32F103C8 | STM32F103C8T6 |

The release indexes six unique manufacturer documents. Keil CMSIS-Pack discovery and PDSC parsing run automatically. Exact ST ordering codes and ST document revisions have manually reviewed manufacturer evidence. Microchip has a declared adapter contract and an evaluated candidate API. Its records are outside the v0.1 dataset. See [source research and coverage](docs/sources.md).

## Architecture

A TypeScript collector reads official source evidence. The generator validates and joins manufacturers, families, devices, orderable parts, documents, revisions and applicability with Zod. It emits a manifest, one lookup per orderable part and a compact search index. A Hono Cloudflare Worker reads those files through the Workers Static Assets binding. Query handling uses local assets exclusively.

Each source adapter implements `findDevice(model)` and `getDocuments(device)` over a loaded snapshot. An adapter that can obtain public evidence automatically implements the additional `SourceCollector` contract. This keeps network collection outside the request path and lets tests load the same adapters against saved source extracts.

## Local development

Use Node.js 24+ and pnpm 12.18.0.

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build:data
pnpm validate:data
pnpm build
pnpm dev
```

`pnpm test` rebuilds the assets and runs Node.js and Cloudflare Workers tests. `pnpm build` validates every generated file and runs Wrangler's deployment dry run. The local API is served by Wrangler at `http://localhost:8787` by default.

## Collection and updates

```sh
pnpm collect
pnpm build:data
pnpm validate:data
```

`pnpm collect` retrieves the official Keil index and matching PDSC releases. It deduplicates requests, checks robots.txt and validates source consistency before atomically replacing the CMSIS snapshot. Identical source records produce a no-op. Use `pnpm import:st <capture-dir> <UTC-observed-at>` to replay manually supplied ST eStore captures. Review `data/seeds/st-documents.json` against the official document pages and PDF scope when a revision or applicability changes. The manual workflow is documented in [source notes](docs/sources.md).

The **Refresh CMSIS data** workflow runs Mondays at 03:23 UTC and supports manual dispatch from `main`. A changed snapshot can become a PR only after source validation, tests and the complete Worker build pass. Failed runs leave the last accepted revision in `main`. The workflow does not deploy. The repository's **Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests** setting is required to open update PRs with `GITHUB_TOKEN`. GitHub can require a maintainer to approve the PR's CI run. [GitHub workflow permissions](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository)

## Static format

| File under `generated-assets/v1/` | Content |
| --- | --- |
| `catalog.json` | Normalized entities and evidence. The `applicability` relation records the device and document keys, scope, provenance and verification status. |
| `manifest.json` | Schema version, SHA-256 data version, generation timestamp, counts and sorted exact model membership. |
| `lookup/<lowercase-model>.json` | Data version and API payload for one orderable part. |
| `search/index.json` | Data version and sorted model summaries for offline substring search. |

A document belongs to one manufacturer and can have many device associations. Revision metadata is a separate object on the canonical document. `verifiedAt` means the publisher's evidence was checked for applicability. `publishedAt` is optional and appears only when independently supported. The manifest generation timestamp is derived from the latest contributing source observation, so identical committed inputs generate byte-for-byte identical files.

The Workers Free limit is 20,000 assets per Worker version and 25 MiB per asset. The generator enforces both. Before approaching either limit, partition lookups by a stable hash prefix and search by normalized prefix or token. Each lookup shard should have its own membership data, and the runtime should load only the needed shards. [Workers platform limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets)

## API

```sh
curl -i 'http://localhost:8787/v1/lookup?model=STM32F407VET6'
curl -i 'http://localhost:8787/v1/search?q=STM32F407'
curl -i 'http://localhost:8787/v1/status'
```

- **Lookup** returns `success`, `model`, `manufacturer`, `family` and `documents`, plus the base `device` and ordering-code evidence. Matching trims surrounding whitespace, folds ASCII case and preserves suffixes such as `TR`.
- **Search** matches an ASCII substring, ranks exact and prefix matches first, and returns up to 25 results and the full match count.
- **Status** reports the schema and dataset versions, timestamp and coverage counts.

Errors use `{"success":false,"error":{"code":"MODEL_NOT_FOUND","message":"Model not found."}}`. Invalid or missing parameters return 400. An absent model returns 404. A missing asset for a known model, an unreadable manifest or a schema failure returns 500. Successes carry explicit cache headers. Errors use `Cache-Control: no-store`.

## Preview deployment and production migration

The checked-in Worker is named `mcu-atlas-v01-preview` and uses no custom domain or production routes. Create a GitHub Actions environment named `preview` and add `CLOUDFLARE_ACCOUNT_ID` and an account-scoped `CLOUDFLARE_API_TOKEN` with Workers Scripts Edit permission to its environment secrets. Run **Deploy preview Worker** manually from `main`. If deploying locally, authenticate Wrangler, run `pnpm build`, then run `pnpm exec wrangler deploy` to create or update that preview Worker. Use a Cloudflare account and Worker name reserved for preview. [Cloudflare CI/CD guide](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

Before moving `atlas-api.kaelexvp.cc`, compare the preview response contract with the existing API, smoke-test lookup, search and status, and verify the missing-model and static-asset failure paths. Record the current production version and routing, agree on a rollback target, and schedule the production deployment and route change as a separate, explicitly approved operation.

## Data usage and contributions

The project indexes official links and factual metadata. Consult the manufacturer documents for engineering and purchasing decisions, including current revisions and silicon-specific errata. Vendor PDFs and trademarks belong to their respective owners. Project code is licensed under [Apache-2.0](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for adding source-backed coverage.
