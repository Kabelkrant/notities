<?php
// Opslaglocaties; buiten de publieke map (public/).
const DATA_FILE = __DIR__ . '/data/notes.json';
const IMAGE_DIR = __DIR__ . '/data/images';

// Limieten tegen misbruik (alle optioneel; dit zijn de standaardwaarden).
// const MAX_ITEMS = 500;                          // notities + afbeeldingen samen
// const MAX_IMAGES = 200;
// const MAX_IMAGE_BYTES = 15 * 1024 * 1024;       // per afbeelding
// const MAX_IMAGE_TOTAL_BYTES = 500 * 1024 * 1024; // alle afbeeldingen samen
// const RATE_WRITES_PER_MIN = 120;                // wijzigingen per IP per minuut (incl. verslepen)
// const RATE_UPLOADS_PER_MIN = 6;                 // uploads per IP per minuut
