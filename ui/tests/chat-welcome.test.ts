import assert from "node:assert/strict";
import test from "node:test";
import { resolveChatWelcome } from "../src/ai-chatbot/welcome.ts";

test("welcome copy uses the resolved catalog text for both display and starter messages", () => {
  const catalog: Record<string, string> = {
    "Hello!": "Szia!",
    "How can I book an appointment?": "Hol foglalhatok időpontot?",
  };
  const welcome = resolveChatWelcome(
    " Hello! ",
    ["  How can I book an appointment?  ", "", "What are your hours?"],
    (text) => catalog[text] ?? text,
  );

  assert.equal(welcome.greeting, "Szia!");
  assert.deepEqual(welcome.questions, ["Hol foglalhatok időpontot?", "What are your hours?"]);
});

test("welcome questions are bounded and invalid saved values are ignored", () => {
  const welcome = resolveChatWelcome(undefined, [
    "One", "Two", "Three", "Four", "Five", "Six", "Seven",
  ], (text) => text);
  assert.equal(welcome.questions.length, 6);
  assert.deepEqual(resolveChatWelcome(undefined, undefined, (text) => text), {
    greeting: "",
    questions: [],
  });
});
