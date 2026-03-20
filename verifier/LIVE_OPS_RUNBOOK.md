# Live Ops Runbook

## Core checks

PowerShell:

```powershell
Invoke-RestMethod https://www.lineagewar.xyz/status | ConvertTo-Json -Depth 8
Invoke-RestMethod https://www.lineagewar.xyz/verifier/latest.json | ConvertTo-Json -Depth 8
```

Local diagnostics:

```powershell
npm.cmd --prefix verifier run inspect:deploy -- --base https://www.lineagewar.xyz
npm.cmd --prefix verifier run inspect:war -- --war 17
```

## Force refresh

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri https://www.lineagewar.xyz/notify `
  -ContentType 'application/json' `
  -Body '{"warId":17,"reason":"admin-update"}'
```

## Railway vars to verify

- `LINEAGE_PACKAGE_ID`
- `LINEAGE_SUI_RPC`
- `LINEAGE_SUI_GRAPHQL_URL`
- `LINEAGE_OUTPUT_PATH`
- `LINEAGE_WAR_ID`
- `VITE_LIVE_VERIFIER_POLL_INTERVAL_MS`

## Expected live flow

1. Create war from admin.
2. Admin auto-selects the created `WarAdminCap`.
3. Admin posts `/notify` with the target `warId`.
4. Verifier rewrites `runtime/verifier/latest.json`.
5. Scoreboard polls `/verifier/latest.json` with `cache: "no-store"`.

## GraphQL degraded mode

- The verifier retries GraphQL ownership resolution 5 times with backoff.
- If GraphQL still fails, the entire tick is frozen and persisted as degraded.
- The public payload marks the tick as `degraded_frozen`.
- Historical rewrite is intentionally manual and not part of the normal loop.
