# Retirement Forecaster

A single-page calculator that projects your RRSP and TFSA balances year by
year, from today through retirement, based on a savings plan you control.

Enter your starting balances, how much you're contributing (and to which
account), your expected CPP/OAS, and how much income you'll need in
retirement. The app projects a year-by-year balance sheet all the way to a
target end age, shows it as a chart and a table, and flags two things worth
knowing about early: years where your savings run out, and years where your
RRSP contributions would exceed your available contribution room.

Everything runs client-side — there's no backend and no data leaves your
browser.

## Features

- **Plan / Results split.** Inputs and outputs live in separate full-width
  views instead of competing for space in one cramped layout. Adjust the plan,
  then switch to Results to see the projection; a live "projected total"
  teaser keeps you oriented while you're still editing.
- **A savings plan with multiple segments.** Contribution amounts can change
  at chosen ages (e.g. "$800/month RRSP until 45, then $1,200/month"), rather
  than assuming a single flat contribution for your whole career.
- **RRSP tax refund reinvestment.** RRSP contributions generate a tax refund
  at your marginal rate; you choose what fraction of it gets reinvested back
  into the RRSP.
- **RRSP contribution room tracking.** Enter your current room (from your
  latest CRA Notice of Assessment) and the projection grows it every year by
  18% of income (capped at the annual CRA dollar limit) and spends it on RRSP
  contributions — with a chart and an explicit error if the plan would ever
  over-contribute.
- **RRSP + TFSA charted separately**, not just as a combined total.
- **A full projection table** with a frozen header, so the column labels stay
  visible while you scroll through 50+ years of rows.

## The model

Each year of the projection is one of two phases:

**Accumulation** (`currentAge` up to `retirementAge - 1`)
Your monthly RRSP/TFSA contributions for that year (from the active savings
plan segment) are added to the running balance, then the whole balance grows
by the assumed annual rate of return. The RRSP side also generates a tax
refund (`contribution × income tax rate`), a chosen fraction of which is
reinvested into the RRSP as an extra contribution.

**Retirement** (`retirementAge` through `endAge`, inclusive)
Each year, CPP and OAS (entered pre-tax, taxed at your retirement tax rate)
cover part of your required after-tax monthly income; whatever's left is
drawn from savings. The withdrawal takes the *same percentage* from the RRSP
and TFSA, taxing only the RRSP portion — so accounts are drained
proportionally rather than one being exhausted before the other. Whatever
remains keeps growing at the assumed rate of return.

Both phases follow the same "flow first, then grow" convention: this year's
contributions or withdrawals happen first, then growth applies to what's
left.

### Simplifying assumptions

This is a planning tool, not a tax return — it deliberately simplifies some
things:

- Income, tax rates, and the rate of return are flat for the whole
  accumulation or retirement phase (no year-to-year variation or inflation
  adjustment).
- The RRSP contribution-room dollar limit is held at its current value for
  all future years, rather than being indexed forward.
- Pension adjustments (for saver's with an employer pension plan) aren't
  modeled, and RRSP room accrual assumes all income is "earned income" for
  CRA purposes.
- The mandatory RRIF-style minimum withdrawal that applies from age 72 is
  **not** implemented yet (see `TODO(age-72-mandatory-withdrawal)` in
  `src/engine/forecast.ts`); the table does flag years where your withdrawal
  rate would fall short of that eventual 5% minimum, so you can see where it
  would start to bite.

## Getting started

```bash
npm install
npm run dev      # start the dev server
npm test          # run the engine test suite (Vitest)
npm run build     # type-check and build for production
```

Other useful scripts:

```bash
npm run test:watch       # watch mode for the engine tests
npm run lint             # oxlint
npm run build:singlefile # build the whole app as one standalone HTML file
```

## Project structure

```
src/
  engine/       # pure calculation functions + their tests (no React here)
  components/   # form sections, the results table, and the charts
  utils/        # shared formatting/conversion helpers
  App.tsx       # top-level state, the Plan/Results view switch
```

The engine (`src/engine/forecast.ts`) is the single source of truth for the
projection math and is unit-tested independently of the UI — `types.ts` is
the contract both sides depend on.
