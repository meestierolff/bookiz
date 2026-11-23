# Moneybird-opzeggids, 23 november 2026

## Wijziging

Brief `2026-11-23-moneybird-opzeggen.md` lokaal geïmplementeerd in de Bookiz-repository (`bookiz-app`). De legacy-repository `Bookiz` bevat deze website niet en is ongewijzigd.

De bestaande URL `/overstappen/moneybird/` krijgt het opzegstappenplan, de verwijdertermijn, de overstaptijdlijn voor januari 2027, Compact als archief, een prijsvergelijking, een gelabeld rekenvoorbeeld, importbeperkingen en vijf FAQ's. Homepage, jaarafsluiting, kostengids en overstaphub linken contextueel naar de gids. Tabellen houden op mobiel hun kolomlabels.

Concurrentprijzen staan centraal in `web/sources.ts`; jaarbedragen en scenario's worden berekend. De eigen Cloud-prijs, proefperiode, btw en fiscale grenzen blijven uit bestaande siteconfiguratie en regels komen. `guidePage` ondersteunt een eigen controledatum, publicatiedatum en zichtbare auteur. Alleen de Moneybird-gids krijgt 23 november als `dateModified` en sitemap-`lastmod`; de andere gidsen behouden 17 november.

## Bronnencontrole

Op 23 november 2026 opnieuw geopend:

- [Moneybird-prijzen](https://www.moneybird.nl/prijzen/)
- [Moneybird opzeggen](https://www.moneybird.nl/helpcenter/nl/articles/207468-account-of-pakket-opzeggen-of-verwijderen)
- [Moneybird-pakketten](https://www.moneybird.nl/helpcenter/nl/articles/207464-pakketten-in-moneybird)
- [Moneybird Betaalrekening opzeggen](https://www.moneybird.nl/helpcenter/nl/articles/224049-moneybird-betaalrekening-opzeggen)
- [Nieuwe Moneybird-pakketten](https://www.moneybird.nl/helpcenter/nl/articles/712746-nieuwe-pakketten-per-1-juli)
- [e-Boekhouden-prijzen](https://www.e-boekhouden.nl/prijzen)
- [Jortt-prijzen](https://www.jortt.nl/prijs/)

Reguliere tarieven uit de brief bevestigd. Tijdelijke Jortt-actie niet meegerekend. Btw-status van Moneybird en e-Boekhouden blijft expliciet onbekend; het rekenvoorbeeld benoemt de aanname exclusief btw. Productclaims zijn getoetst aan README, de bestaande gids en `web/site.json` van deze repository, inclusief de nog niet op echte exports geteste overstapfunctie.

## Verificatie

- `npm run verify`: geslaagd, 82 tests, typecheck, rules:check, web:build en site:check.
- Twee nieuwe regressietests: prijsberekeningen bij gewijzigde Cloud-facts, vijf FAQ's, server-HTML met twee tabellen, canonical, één h1, Person-auteur, publicatiedatum, datums per gids en vier inkomende contextlinks.
- `git diff --check`: geslaagd.
- Gebouwde HTML bevat de volledige inhoud zonder JavaScript; JSON-LD parseert. Geen titel- of description-lengtenotitie uit site:check.
- Lokale browsercontrole op 1440 x 1000 en 390 x 844: beide tabellen aanwezig, documentbreedte gelijk aan viewportbreedte; mobiele tabelcellen tonen hun kolomlabel. Screenshots gemaakt met Playwright.
- Unslop-script uit `skills/unslop-seo/UPSTREAM.md` van de legacy-repository uitgevoerd op de zichtbare tekst van de gebouwde Moneybird-gids: 0 treffers. Eerste antwoord bevat menupad en verwijdertermijn; twaalf h2-koppen inclusief FAQ.
- Eerste verificatie vond een dubbele komma in build.ts; gecorrigeerd vóór de geslaagde eindrun.

## Openstaande stappen na publicatiebesluit

Geen commit, push, deployment of indexeringsactie uitgevoerd. Productie-curl, productie-sitemap, Google Rich Results Test op de gewijzigde URL en GSC-indexering zijn overgeslagen omdat de wijziging nog lokaal staat. Bij een latere publicatiedatum eerst de prijzen opnieuw controleren en de datums aanpassen waar opnieuw gecontroleerd.

Na goedgekeurde deployment: controleer de server-HTML en sitemap, voer Rich Results Test uit, en vraag indexering aan via IndexNow en GSC. IndexNow is een externe actie en is hier niet uitgevoerd.

Meet na drie tot vier weken live opnieuw. Baseline uit de aangeleverde brief (niet opnieuw uit GSC opgehaald): pagina 0 klikken / 68 vertoningen / positie 10,3; query `moneybird opzeggen` 0 klikken / 33 vertoningen / positie 9,1. Het maandelijkse voorstel voor een historisch prijsbestand blijft buiten scope: historische brondata ontbreekt volgens de brief.
