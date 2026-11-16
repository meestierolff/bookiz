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
