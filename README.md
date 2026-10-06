# Kabelkrant Notities

Een bord met notities en afbeeldingen die je vrij kunt verslepen. Geen database: alles staat in één JSON-bestand en een map met afbeeldingen.

## Wat het kan
- Notities met titel, kleur en Markdown
- Afbeeldingen (PNG, JPEG, GIF, WebP, AVIF; max 15 MB), los zwevend met behoud van transparantie, te schalen via de greep rechtsonder
- Slepen, ook met toetsenbord (pijltjes) en touch
- Verwijderen met ongedaan maken (6 seconden)
- Live-sync tussen apparaten via polling (elke 4 seconden)

## Structuur
```
public/        webroot: index.php, api.php, image.php, assets/, sticky-note.png
src/           bootstrap.php, JsonStore.php
data/          notes.json en images/ (niet publiek, wordt aangemaakt/gevuld door de app)
config.php     paden naar de data
parsedown.php  Markdown-library
```

## Installeren
1. Pak het project uit op de server.
2. Laat de webroot van de website wijzen naar `public/`. Alles daarbuiten mag niet bereikbaar zijn.
3. Maak `data/` aan als die ontbreekt en geef de PHP-gebruiker schrijfrechten (bijv. `chmod 700 data`, eigenaar = PHP-gebruiker).
4. Zorg voor uploadlimieten van minimaal 15 MB:
   - PHP: `upload_max_filesize` en `post_max_size`
   - nginx: `client_max_body_size 15m;`

## Vereisten
- PHP 8.1 of hoger
- Extensies: `fileinfo`, `mbstring`

## Back-up en verhuizen
Alle gegevens staan in `data/` (`notes.json` en `images/`). Neem die map mee voor een back-up of een verhuizing. Zonder `data/` krijg je een lege installatie.

## Misbruik voorkomen
- **Limieten** (instelbaar in `config.php`): maximaal 500 items en 200 afbeeldingen, 500 MB aan afbeeldingen in totaal, 15 MB per afbeelding.
- **Snelheidslimiet per IP:** 120 wijzigingen en 6 uploads per minuut, met een nette `429`-melding. Het IP komt uit `REMOTE_ADDR` (`X-Forwarded-For` wordt niet vertrouwd). Staat de app achter een proxy die het echte IP niet doorgeeft, dan delen alle bezoekers één limiet.
- **Origin-controle:** schrijfverzoeken vanaf een andere website worden geweigerd.
- **Zoekmachines:** `robots.txt`, een `noindex`-meta-tag en `X-Robots-Tag`-headers houden de site en de afbeeldingen uit zoekresultaten.
- Teller-bestanden staan in `data/ratelimit/` en ruimen zichzelf op.
- Aanvullend op serverniveau aan te raden: `limit_req` op `api.php` en `client_max_body_size 15m;` in nginx.

## Let op
De app heeft **geen login**. Iedereen met de URL kan notities lezen, wijzigen en verwijderen. Zet bij een openbaar bereikbare site bijvoorbeeld Basic Auth in de webserver.
