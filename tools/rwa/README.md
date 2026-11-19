# RWA asset list generator

`buildRwaAssets.js` builds `src/rwa/data/rwaAssets.json`, the curated list of tokenized stocks,
ETFs, gold and treasuries shown in the Stocks & gold section. It lives outside `src/` so Metro
never bundles it; the app only reads the generated JSON.

## Regenerate the list

From the repo root, with Node 22 (no npm packages needed, it uses the built-in `fetch`):

```sh
node tools/rwa/buildRwaAssets.js
```

It reads:

- the Ondo Stocks CSV linked from docs.ondo.finance/addresses,
- the xStocks API (api.backed.fi and api.xstocks.fi),
- fixed entries for PAXG, XAUt, USDY and CETES.

It then checks every EVM token on-chain with `symbol()` and `decimals()` and drops any mismatch.
It also checks logo URLs and uses a letter avatar when a logo is broken.

It only makes read-only requests. Nothing is signed or sent.

Review the summary it prints, which shows kept and dropped entries by issuer and chain. Then run:

```sh
npx jest src/rwa
```

Commit the updated JSON.

`node tools/rwa/buildRwaAssets.js --recompact` only rewrites an old pretty-printed file into the
compact format. It doesn't fetch anything.
