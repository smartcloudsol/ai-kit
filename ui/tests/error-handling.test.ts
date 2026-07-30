import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAiRunErrorFeedback,
  createAiRunErrorFeedback,
  getAiRunErrorMessage,
  normalizeAiRunError,
} from "../src/errorHandling.ts";

function backendError(status: number, body: Record<string, unknown>) {
  return {
    name: "ApiError",
    message: `Backend request failed: ${JSON.stringify(body)}`,
    response: {
      statusCode: status,
      body: JSON.stringify(body),
      headers: { "x-request-id": body.requestId },
    },
  };
}

test("normalizes reCAPTCHA rejection without exposing request data", () => {
  const details = normalizeAiRunError(
    backendError(403, {
      code: "HUMAN_VERIFICATION_ERROR",
      message: "Assessment rejected",
      requestId: "req-human-1",
      token: "must-not-leak",
    }),
  );

  assert.deepEqual(details, {
    kind: "human-verification",
    status: 403,
    code: "HUMAN_VERIFICATION_ERROR",
    safeMessage: "Assessment rejected",
    requestId: "req-human-1",
  });
  assert.equal(
    getAiRunErrorMessage(details),
    "We couldn't verify that you're human. Please try again.",
  );
  assert.doesNotMatch(JSON.stringify(details), /must-not-leak/);
});

test("distinguishes authorization, throttling, network, and backend failures", () => {
  assert.equal(
    normalizeAiRunError(backendError(401, { code: "UNAUTHORIZED" })).kind,
    "authorization",
  );
  assert.equal(
    normalizeAiRunError(backendError(429, { code: "THROTTLED" })).kind,
    "throttled",
  );
  assert.equal(
    normalizeAiRunError(new TypeError("Failed to fetch")).kind,
    "network",
  );
  assert.equal(
    normalizeAiRunError(backendError(503, { code: "UPSTREAM_ERROR" })).kind,
    "server",
  );
});

test("treats intentional cancellation as non-error feedback", () => {
  const feedback = createAiRunErrorFeedback(
    new DOMException("Aborted", "AbortError"),
  );
  assert.equal(feedback.details?.kind, "cancelled");
  assert.equal(feedback.message, null);
});

test("beginning a successful retry clears stale error feedback", () => {
  const failed = createAiRunErrorFeedback(
    backendError(429, { code: "THROTTLED" }),
  );
  assert.equal(failed.details?.kind, "throttled");

  const retry = clearAiRunErrorFeedback();
  assert.deepEqual(retry, { message: null, details: null });
});
