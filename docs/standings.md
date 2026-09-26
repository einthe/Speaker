# Standings integration

Verified on 2026-09-20 against [VolleyballLive](https://kamper.volleyball.no/standings?seasonId=201070&tournamentId=449623), its loaded JavaScript and JSON responses, the [NIF OpenAPI schema](https://data.nif.no/swagger/v1/swagger.json), and [NIF authentication documentation](https://idrettsforbundet.atlassian.net/wiki/spaces/DDTII/pages/335577089).

## Source selection

1. When NIF credentials are configured, use `https://data.nif.no/api/v1/ta/`. Verified schema endpoints: `Tournament?tournamentId=449623` and `TournamentStandings/?tournamentId=449623`. Both require `data_ta_read`; unauthenticated access returned 401. OAuth uses `https://id.nif.no/connect/token`, `client_credentials`, HTTP Basic client authentication and the requested scope. The identity service's discovery document confirms that grant/authentication method. Actual credentialed access still needs NIF-issued credentials and should be smoke-tested when enabled.
2. Otherwise use `https://sf48-terminlister-prod-app.azurewebsites.net/ta/` with the same paths, exactly as VolleyballLive's frontend does. Both JSON requests returned 200 without authentication. This is the frontend's public data service, not HTML scraping, but it has no separately documented stability guarantee. Schema validation fails safely if its contract changes. Invalid configured credentials do not silently downgrade to this source.

The settings response at `TournamentStandings/Settings/449623` identifies volleyball table system `VB5`. Its columns and the frontend's table mapping were inspected; no additional settings request is necessary to display the supported fixed set of statistics below. No independent ranking, qualification colors or tie-break calculation is introduced.

## Mapping

| Upstream field                                  | Display                           |
| ----------------------------------------------- | --------------------------------- |
| `position` / `orgName`                          | Plassering / Lag                  |
| `matches` / `victories` / `losses`              | Spilt / Vunnet / Tapt             |
| `totalPoints`                                   | Poeng (league points)             |
| `goalsScored` / `goalsConceeded`                | Sett vunnet / Sett tapt           |
| `goalDifference`                                | Settforskjell                     |
| `partialPointsScored` / `partialPointsConceded` | Settpoeng vunnet / Settpoeng tapt |
| `partialPointsDifference`                       | Poengforskjell (rally points)     |

`goalsConceeded` is NIF's actual spelling. Rows retain upstream order and rank, keyed by `entryId`; unknown statistics show a dash, not a calculated value or zero. Duplicate entry IDs and malformed data are rejected. Tournament identity, season, volleyball sport ID and publication status are validated before rows are returned. Unpublished tables show an empty state.

Display names for NTNUI 2/3/4 are mapped to NTNUI D2A/D2B/D2C by the shared team-name helper, also used by the [match import](volleyball-matches.md). Source identifiers and official ranking order are preserved.

The requested tournament currently identifies itself as **Trøndelag - 2. divisjon - Kvinner**, season **Volleyballsesongen 2026/2027**, with nine teams and all match statistics at zero. Those are source values, not demo placeholders. Confirm the competition IDs if a different division was intended.

## Maintenance and verification

Environment variables and cache behavior are documented in [README](../README.md#league-standings-tabell) and `.env.example`. No Supabase storage, cron, third-party browser calls or new dependencies are used. `unstable_cache` provides the existing non-Cache-Components app with Next's Data Cache without changing its rendering architecture. Only normalized competition data and non-secret competition/source cache keys persist; OAuth responses use `no-store`. Last-good data is available only while the host retains that cache.

- `tests/fixtures/standings.json`: captured public metadata and selected standings fields, used to verify the actual response contract.
- `tests/standings.test.ts`: normalization/order/nulls, invalid data/configuration, HTTP failures, publication, OAuth reuse/expiry/401 and server-only boundaries. OAuth calls are mocked; no real credentials are in tests.
- `tests/e2e/standings.spec.ts`: real local authentication/navigation with mocked standings responses, desktop/mobile accessibility and scrolling, errors/retry and automatic refresh retaining previous data. Anonymous and stale-scope API requests exercise the actual handler.
- `npm run test:e2e:local -- tests/e2e/standings.spec.ts tests/e2e/public.spec.ts` uses the disposable loopback backend. The production app has no test bypass or fixture import.
