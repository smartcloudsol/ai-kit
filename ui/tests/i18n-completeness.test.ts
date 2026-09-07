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
