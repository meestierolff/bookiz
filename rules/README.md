# Tax rules as data

One file per tax year: `nl-<year>.json`. The engine reads nothing else about
Dutch tax; if a figure is not here, Bookiz does not know it.

Every rule has:

- `title`: what it is, in Dutch, as a taxpayer would call it
- `value`: the figure, or a table
- `unit`: optional
- `source`: the official page (belastingdienst.nl; rijksoverheid.nl or
  overheid.nl only when the Belastingdienst does not state it)
- `quote`: the literal sentence on that page that contains the figure
- `note`: optional; what the engine does and does not do with it

`status` is `definitief` or `voorlopig`. `checked_on` is the date a person last
compared every quote with its source.

## Adding or changing a rule

1. Open the source page and copy the sentence. Do not work from memory, a blog,
   or last year's file.
2. Change the value and the quote together.
3. Set `checked_on` when you have re-read every rule in the file, not just one.
4. Run `npm run verify`. A test must show the effect of the new value.

## Adding a year

Copy the previous file only as a list of keys. Re-fetch every figure. A year
whose figures are not all published yet is `voorlopig`, and optional keys (the
income tax tables) may be left out; the tax estimate is then unavailable for
that year rather than guessed.

## License

The files in this folder are MIT-licensed (see `LICENSE` here), separately from
the AGPL engine, so bookkeepers and other tools can reuse them freely.

## Validating a year

Three separate questions, each with its own check. Do not let one stand in for
another.

1. **Is every quote still on its source page?** `npm run rules:sources` fetches
   each source and looks for the quote. A changed or unreachable page fails.
   It needs the network, so it is not part of `npm run verify`. A pass says the
   Belastingdienst has not changed the sentence; it does not say the value is
   right.
2. **Does each value follow from its quote, and are the limitations acceptable?**
   That needs a person who knows Dutch tax. `npm run rules:review -- 2026 review.xlsx`
   writes a sheet with every rule, its quote, source and the limitations Bookiz
   knows of, plus empty columns for a verdict.
3. **Does Bookiz calculate correctly with them?** The second tab of the review
   sheet lists situations. A bookkeeper fills in the expected outcome by hand;
   each one that comes back becomes a test in `test/`, with the bookkeeper's
   figures as the expected values.

An independent reviewer, human or AI, gets the rule file and the source pages,
not our conclusions. A prompt that works for an AI reviewer:

> You are checking a Dutch tax rule file for sole proprietors. For every rule
> in `rules/nl-2026.json`, open its `source` URL and answer: (a) is `quote`
> literally on the page, (b) does `value` follow from that quote, (c) is the
> `note` correct and complete about what an engine should not do with it. Then
> read `src/core/` and list any calculation that uses a rule differently from
> what its source says. Report only what you verified on the page, with the
> sentence you relied on. Say "not verified" where you could not open a page.
