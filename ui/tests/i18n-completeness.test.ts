import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { arDict } from "../src/i18n/ar.ts";
import { deDict } from "../src/i18n/de.ts";
import { enDict } from "../src/i18n/en.ts";
import { esDict } from "../src/i18n/es.ts";
import { frDict } from "../src/i18n/fr.ts";
import { heDict } from "../src/i18n/he.ts";
import { hiDict } from "../src/i18n/hi.ts";
import { huDict } from "../src/i18n/hu.ts";
import { idDict } from "../src/i18n/id.ts";
import { itDict } from "../src/i18n/it.ts";
import { jaDict } from "../src/i18n/ja.ts";
import { koDict } from "../src/i18n/ko.ts";
import { nbDict } from "../src/i18n/nb.ts";
import { nlDict } from "../src/i18n/nl.ts";
import { plDict } from "../src/i18n/pl.ts";
import { ptDict } from "../src/i18n/pt.ts";
import { ruDict } from "../src/i18n/ru.ts";
import { svDict } from "../src/i18n/sv.ts";
import { thDict } from "../src/i18n/th.ts";
import { trDict } from "../src/i18n/tr.ts";
import { uaDict } from "../src/i18n/ua.ts";
import { zhDict } from "../src/i18n/zh.ts";

const catalogs: Record<string, Record<string, string>> = {
  ar: arDict,
  de: deDict,
  en: enDict,
  es: esDict,
  fr: frDict,
  he: heDict,
  hi: hiDict,
  hu: huDict,
  id: idDict,
  it: itDict,
  ja: jaDict,
  ko: koDict,
  nb: nbDict,
  nl: nlDict,
  pl: plDict,
  pt: ptDict,
  ru: ruDict,
  sv: svDict,
  th: thDict,
  tr: trDict,
  ua: uaDict,
  zh: zhDict,
};

const REQUIRED_KEYS = [
  "Something went wrong. Please try again.",
  "The AI service is temporarily unavailable. Please try again.",
  "The request could not be processed. Review your input and try again.",
  "Too many requests. Please wait a moment and try again.",
  "We couldn't reach the AI service. Check your connection and try again.",
  "We couldn't verify that you're human. Please try again.",
  "You are not authorized to use this AI feature. Please sign in or contact the site owner.",
  "Request ID",
];

test("all UI locales have full i18n key parity with en", () => {
  const registry = readFileSync(new URL("../src/i18n/index.ts", import.meta.url), "utf8");
  const registeredLocales = [...registry.matchAll(/^  ([a-z]{2}): /gm)].map((match) => match[1]).sort();
  assert.equal(registeredLocales.length, 22);
  assert.deepEqual(Object.keys(catalogs).sort(), registeredLocales);
  const referenceKeys = Object.keys(enDict).sort();

  for (const [locale, dict] of Object.entries(catalogs)) {
    const localeKeys = Object.keys(dict).sort();

    assert.deepEqual(
      localeKeys,
      referenceKeys,
      `Locale ${locale} keys differ from en reference`,
    );

    for (const key of REQUIRED_KEYS) {
      assert.ok(
        typeof dict[key] === "string" && dict[key].trim().length > 0,
        `Locale ${locale} must contain non-empty value for required key: ${key}`,
      );
    }
  }
});

const INFORMAL_ADDRESS_PATTERNS: Record<string, RegExp> = {
  de: /(?<!\p{L})(?:du|dich|dir|dein(?:e|en|em|er|es)?|frag|fahre|versuche|melde|kontaktiere|warte|überprüfe)(?!\p{L})/iu,
  es: /(?<!\p{L})(?:tú|tu|tus|te|quieres|verifica|pregúntame|haz|ayudarte|selecciona|escribe|inténtalo|tienes|inicia|contacta|espera|revisa|seas)(?!\p{L})/iu,
  fr: /(?<!\p{L})(?:tu|toi|ta|tes|vérifie|réessaie|clique|sélectionne|saisis|connecte)(?!\p{L})/iu,
  hu: /(?<!\p{L})(?:kérdezz|kattints|ellenőrizd|próbáld|jelentkezz|fordulj|várj|keresd|válassz|írj|írd|foglald|állítod|szöveged|jogosultságod|kapcsolatod)(?!\p{L})/iu,
};

test("customer-facing European locale catalogs avoid informal address", () => {
  for (const [locale, pattern] of Object.entries(INFORMAL_ADDRESS_PATTERNS)) {
    const entries = Object.entries(catalogs[locale] ?? {});
    const informal = entries.filter(([, value]) => pattern.test(value));

    assert.deepEqual(
      informal,
      [],
      `Locale ${locale} contains informal customer address`,
    );
  }
});

test("English customer prompts remain neutral and professional", () => {
  assert.equal(enDict["Ask anything…"], "Ask a question…");
  assert.equal(enDict["Ask me"], "Ask");
  assert.equal(enDict["I'm ready to assist you."], "Ready to assist.");
  assert.equal(
    enDict["No issues found. Your text looks great!"],
    "No issues found. The text is ready.",
  );
});

test("customer-facing action labels use the intended meaning", () => {
  assert.equal(huDict.Show, "Megjelenítés");
  assert.equal(huDict.Stop, "Leállítás");
  assert.equal(deDict["Working…"], "Verarbeitung…");
  assert.equal(esDict.Preview, "Vista previa");
  assert.equal(esDict.Show, "Mostrar");
  assert.equal(esDict.Translating, "Traducción");
  assert.equal(frDict.Search, "Rechercher");
  assert.equal(frDict.Show, "Afficher");
  assert.equal(frDict.Type, "Type");
});
