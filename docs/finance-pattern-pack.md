# Finance pattern pack (GLBA)

Second industry pattern pack, added alongside `hipaaPack` to prove the
pluggable pattern-set architecture in `server/checks/patternPacks.js`
extends cleanly to a second vertical (finance / GLBA), not just healthcare.

## What it does

`financePack` (exported from `server/checks/patternPacks.js`) adds
finance-specific PII detection to the session compliance report's PII scan.
It's a plain pattern pack object - same shape as `genericPack` and
`hipaaPack` - and requires no core-code changes to use: `piiScan.js`
already accepts an array of packs, so passing `[genericPack, financePack]`
(or any subset) is all that's needed.

## Patterns

| id | label | catches |
|---|---|---|
| `routing_number` | Possible ABA routing number | `routing number 021000021` |
| `iban` | Possible IBAN | `DE89370400440532013000` |
| `loan_number` | Possible loan or brokerage number | `loan number 4837201` |

These are distinct from what `genericPack` already catches (SSN,
credit-card numbers via Luhn check, and generic `account number ...`
phrasing) - the finance pack does not re-detect those.

## Using it

```js
import { analyzeSession } from "./server/checks/analyze.js";

analyzeSession(session, { patternPackIds: ["generic", "finance"] });
```

See `server/checks/analyze.test.js` for a test proving the generic scan
alone misses these identifiers while enabling `financePack` catches them.
