# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/wahyuda110/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/wahyuda110/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0, make.fun's reference CSV reader. `solve.js`
exports `run(input)`, which returns exactly what csv-reader 1.0.0 returns for
`{text, header}` — `{columns, rows, errors}` — including its broken-row policy
(BOM, stray CRs, unterminated quotes, quote junk, short/long rows), but reads
the text with regex scans and `slice`/`split` instead of one character at a
time.

How it is fast:

- A quote-free, stray-CR-free line is answered by one `split(',')` — no
  per-field work at all.
- Unquoted fields are found with a single regex scan for the next `,`, CR or
  LF, instead of three separate scans.
- Quoted fields are sliced between their quotes; doubled quotes and line
  breaks inside quotes take a slow path only when they actually occur.

## Run it

```sh
node main.ts
```

`main.ts` (the house driver) reads every case from `/input/cases.json`
(`MAKEFUN_INPUT_DIR` outside a container), answers each with `run`, and
writes `/output/answers.json` (`MAKEFUN_OUTPUT_DIR` outside a container).

## Check it

```sh
# practice set, against the kit's reference answers
MAKEFUN_INPUT_DIR=<kit>/practice/input MAKEFUN_OUTPUT_DIR=/tmp/csv-out node main.ts
node -e "const a=require('/tmp/csv-out/answers.json'),e=require('<kit>/practice/reference/expected.json');console.log(a.length===e.cases.length&&a.every((x,i)=>JSON.stringify(x)===JSON.stringify(e.cases[i].output))?'all cases match':'MISMATCH')"
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=g0v1qb0d&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
