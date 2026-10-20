# Kabelkrant Notities

Een bord met notities, afbeeldingen, pijlen, klokken en WordArt die je vrij kunt verslepen. Geen database: alles staat in één JSON-bestand en een map met afbeeldingen.

## Wat het kan
- Notities met titel, kleur en Markdown (dik, cursief, `++onderstrepen++`, lijsten, `---` als lijn, links). De editor heeft een opmaakbalk, een linkknop (Ctrl+K; ook een URL plakken over geselecteerde tekst maakt `[tekst](url)`) en een emoji-kiezer van 6 × 5
- Afbeeldingen (PNG, JPEG, GIF, WebP, AVIF; max 15 MB), los zwevend met behoud van transparantie, te schalen via de greep rechtsonder. Uploaden via menu + → Afbeelding of met Ctrl+V vanaf het klembord. Is een afbeelding groter dan de drempel (standaard 2000 px of 2 MB), dan vraagt de app of hij verkleind moet worden
- Pijlen (menu + → Pijl): vrij te slepen, te schalen via de greep rechtsonder en in elke richting te roteren via het greepje boven de pijl (Shift = stappen van 15°; met de toets R draai je 15° rechtsom, Shift+R linksom). Vijf ontwerpen (blokpijl, omlijnd, lijn, gestreept, dubbel) en acht kleuren, in te stellen via ✏️ of dubbelklikken
- Klokken (menu + → Klok): vier analoge stijlen (zilver, rood, neon, zwarte rand) en een rode digitale 7-segmentklok, met tijdzone, eigen label en optionele secondewijzer. De klok toont de tijd van het apparaat waarop je kijkt, omgerekend naar de gekozen tijdzone
- WordArt (menu + → WordArt): opgesmukte tekst van maximaal 60 tekens in zeven stijlen (regenboog, chroom, goud 3D, neon, vuur, retro, strip) en vier vormen (recht, boog omhoog, boog omlaag, golf). Te slepen, vrij te schalen in breedte en hoogte (Shift houdt de verhouding vast) en in elke richting te roteren, net als een pijl. Gebruikt alleen systeemlettertypen
- Slepen, ook met toetsenbord (pijltjes; Enter bewerkt, Delete verwijdert) en touch. Nieuwe items komen op de eerste vrije plek, zonder bestaande items te overlappen
- Zoomen (30–200%) met de knoppen in de werkbalk; het niveau wordt in een cookie onthouden
- Snap to grid (menu ☰): notities verplaatsen in stappen van 20 px, met een raster dat alleen tijdens het verplaatsen zichtbaar is; ook onthouden in een cookie
- Gelijktijdig bewerken: wie een notitie opslaat die intussen door iemand anders is gewijzigd, krijgt een waarschuwing en kan bewust overschrijven
- Over-dialoog met versie-informatie en bijwerken vanaf GitHub (zie Bijwerken)
- Beveiligd met een wachtwoord (zie Inloggen)
- Verwijderen met ongedaan maken (6 seconden)
- Live-sync tussen apparaten via polling (elke 4 seconden)

## Structuur
```
public/        webroot: index.php, api.php, image.php, assets/ (app.css, app.js, js/ met de modules), sticky-note.png
src/           bootstrap.php, JsonStore.php, Guard.php, Auth.php, Updater.php, NoteParsedown.php
data/          notes.json en images/ (niet publiek, wordt aangemaakt/gevuld door de app)
config.php     paden naar de data en optionele limieten
.env           wachtwoord en instellingen (niet in git; voorbeeld: .env.example, uitleg: zie Instellingen)
parsedown.php  Markdown-library
```

## Installeren
1. Pak het project uit op de server.
2. Laat de webroot van de website wijzen naar `public/`. Alles daarbuiten mag niet bereikbaar zijn.
3. Kopieer `.env.example` naar `.env` en vul `APP_PASSWORD` in (chmod 600). Zonder wachtwoord blijft de app dicht. Zie *Instellingen (.env)* voor de overige regels.
4. Maak `data/` aan als die ontbreekt en geef de PHP-gebruiker schrijfrechten (bijv. `chmod 700 data`, eigenaar = PHP-gebruiker).
5. Zorg voor uploadlimieten van minimaal 15 MB:
   - PHP: `upload_max_filesize` en `post_max_size`
   - nginx: `client_max_body_size 15m;`

## Vereisten
- PHP 8.1 of hoger
- Extensies: `fileinfo`, `mbstring`
- Voor bijwerken vanaf GitHub ook: `curl` en `zip`
- Een recente browser (Chrome, Edge, Safari of Firefox 126+): de app gebruikt ES-modules, import maps en CSS `zoom`

## Back-up en verhuizen
Alle gegevens staan in `data/` (`notes.json` en `images/`). Neem die map mee, plus `.env`, voor een back-up of een verhuizing. Zonder `data/` krijg je een lege installatie.
`notes.json` wordt atomair weggeschreven (tijdelijk bestand en `rename`, met `notes.json.lock` voor het vergrendelen).

## Misbruik voorkomen
- **Limieten** (instelbaar in `config.php`): maximaal 500 items en 200 afbeeldingen, 500 MB aan afbeeldingen in totaal, 15 MB per afbeelding.
- **Snelheidslimiet per IP:** 120 wijzigingen en 6 uploads per minuut, met een nette `429`-melding. Het IP komt uit `REMOTE_ADDR` (`X-Forwarded-For` wordt niet vertrouwd). Staat de app achter een proxy die het echte IP niet doorgeeft, dan delen alle bezoekers één limiet.
- **Origin-controle:** schrijfverzoeken vanaf een andere website worden geweigerd.
- **Zoekmachines:** `robots.txt`, een `noindex`-meta-tag en `X-Robots-Tag`-headers houden de site en de afbeeldingen uit zoekresultaten.
- Teller-bestanden staan in `data/ratelimit/` en ruimen zichzelf op.
- Aanvullend op serverniveau aan te raden: `limit_req` op `api.php` en `client_max_body_size 15m;` in nginx.

## Instellingen (.env)
Kopieer `.env.example` naar `.env` (chmod 600; staat niet in git). De file bevat bewust geen commentaar; dit is de uitleg:

| Variabele | Betekenis | Standaard |
| --- | --- | --- |
| `APP_PASSWORD` | Wachtwoord om in te loggen, leesbaar opgeslagen. Zonder wachtwoord blijft de app dicht. | geen |
| `APP_NAME` | Naam in het inlogscherm en op het browsertabblad. | Kabelkrant Notities |
| `IMAGE_MAX_DIMENSION` | Langste zijde (px) waarboven bij een afbeelding gevraagd wordt of hij verkleind moet worden. Tussen 100 en 5000. | 2000 |
| `IMAGE_MAX_KB` | Bestandsgrootte (KB) waarboven die vraag verschijnt; 2048 = 2 MB. Tussen 50 en 15360. | 2048 |
| `ALLOW_NOTES`, `ALLOW_PICTURES`, `ALLOW_ARROW`, `ALLOW_CLOCK`, `ALLOW_WORDART` | Welke soorten items er nog toegevoegd mogen worden, zie *Onderdelen aan- en uitzetten*. | notities aan, de rest uit |

## Inloggen
De hele app zit achter één wachtwoord (geen gebruikersnaam). Het wachtwoord staat leesbaar als `APP_PASSWORD` in `.env` (niet in git, rechten 600). De naam in het inlogscherm en op het tabblad stel je in met `APP_NAME` in dezelfde file. Na inloggen onthoudt de browser dit 30 dagen via een ondertekende cookie (`kn_auth`); de sleutel is afgeleid van het wachtwoord, dus een nieuw wachtwoord in `.env` logt iedereen uit. Uitloggen kan via het menu. Notities, afbeeldingen en de API geven zonder login `401`. Foute pogingen worden vertraagd en beperkt tot 6 per minuut per IP.
Gebruik HTTPS, anders reist het wachtwoord leesbaar over het netwerk.

## Onderdelen aan- en uitzetten
Met `ALLOW_NOTES`, `ALLOW_PICTURES`, `ALLOW_ARROW`, `ALLOW_CLOCK` en `ALLOW_WORDART` in `.env` bepaal je welke soorten items er nog **toegevoegd** mogen worden (`1`/`0`, ook `true`/`false`, `yes`/`no` en `on`/`off`). **Ontbreekt een regel, dan staat het onderdeel uit** (ook bij een onbegrijpelijke waarde); alleen `ALLOW_NOTES` staat dan juist aan. Bij een bestaande installatie moet je de regels dus toevoegen; in `.env.example` staan alleen notities en afbeeldingen aan en pijlen en klokken uit. Bij `0` verdwijnt de keuze uit het +-menu (en bij `ALLOW_PICTURES=0` werkt plakken van een afbeelding niet meer) en weigert de server het aanmaken. Items die al op het bord staan blijven gewoon zichtbaar en kun je nog verplaatsen, bewerken en verwijderen. Staat alles uit, dan verdwijnt de +-knop.

## Bijwerken
Menu ☰ → Over toont de huidige versie (commit) en de nieuwste op GitHub (`Kabelkrant/notities`, branch `main`; de controle wordt 10 minuten gecachet). Als er een update is, wordt **Updaten** actief; de knop haalt de zipball van exact die commit op en kopieert de bestanden over de installatie.
- `data/`, `config.php`, `.env` en `.git*` worden nooit overschreven; overschreven bestanden gaan eerst naar `data/backup-<tijd>/` (alleen de laatste back-up blijft bewaard).
- Bestanden die upstream zijn verwijderd, worden niet verwijderd.
- Bij een git-checkout (map `.git` aanwezig) staat Updaten uit: gebruik dan `git pull`.
- Updaten kan elke ingelogde gebruiker (maximaal 5 pogingen per minuut), en er is geen handtekeningcontrole: je vertrouwt wat er op `main` staat.
- `.env` wordt nooit aangepast. Komt er in een nieuwe versie een instelling bij, dan moet je die zelf in `.env` zetten (zie de tabel bij *Instellingen*); onderdelen die je niet toevoegt blijven uit.

## Sneltoetsen
| Toets | Waar | Doet |
| --- | --- | --- |
| Ctrl+B, Ctrl+I, Ctrl+U | notitie-editor | dik, cursief, onderstrepen |
| Ctrl+K | notitie-editor | link toevoegen of bewerken |
| Ctrl+V | bord | afbeelding van het klembord uploaden |
| Pijltjes (Shift = grotere stap) | geselecteerd item | verplaatsen; met snap to grid in stappen van 20 px (Shift: 100 px) |
| Enter | geselecteerd item | bewerken (notitie, pijl, klok, WordArt) |
| Delete | geselecteerd item | verwijderen (6 seconden ongedaan te maken) |
| R, Shift+R | geselecteerde pijl of WordArt | 15° rechtsom, 15° linksom |
| Escape | menu's, kiezers en dialogen | sluiten |
