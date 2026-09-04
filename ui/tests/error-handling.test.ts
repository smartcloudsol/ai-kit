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
      error: {
        code: "HUMAN_VERIFICATION_FAILED",
        classification: "RISK_REJECTED",
        message: "reCAPTCHA verification failed",
        retryable: true,
        requestId: "req-human-1",
        token: "must-not-leak",
      },
    }),
  );

  assert.deepEqual(details, {
    kind: "human-verification",
    status: 403,
    code: "HUMAN_VERIFICATION_FAILED",
    safeMessage: "reCAPTCHA verification failed",
    requestId: "req-human-1",
    classification: "RISK_REJECTED",
    retryable: true,
  });
  assert.equal(
    getAiRunErrorMessage(details),
    "We couldn't verify that you're human. Please try again.",
  );
  assert.doesNotMatch(JSON.stringify(details), /must-not-leak/);
});

test("normalizes a reCAPTCHA provider outage as retryable human verification", () => {
  const details = normalizeAiRunError(
    backendError(503, {
      error: {
        code: "HUMAN_VERIFICATION_UNAVAILABLE",
        classification: "PROVIDER_UNAVAILABLE",
        message: "reCAPTCHA verification is temporarily unavailable",
        retryable: true,
        requestId: "req-human-503",
      },
    }),
  );

  assert.equal(details.kind, "human-verification");
  assert.equal(details.classification, "PROVIDER_UNAVAILABLE");
  assert.equal(details.retryable, true);
  assert.equal(
    getAiRunErrorMessage(details),
    "Human verification is temporarily unavailable. Please try again.",
  );
});

test("continues to recognize the legacy AI Kit reCAPTCHA response during rollout", () => {
  const details = normalizeAiRunError(
    backendError(403, {
      code: "HUMAN_VERIFICATION_ERROR",
      message: "Assessment rejected",
      requestId: "req-human-legacy",
    }),
  );

  assert.equal(details.kind, "human-verification");
  assert.equal(details.classification, undefined);
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

test("explains a configured model capability mismatch", () => {
  const details = normalizeAiRunError(
    backendError(400, {
      code: "MODEL_CAPABILITY_ERROR",
      message: "The configured AI model does not support image attachments.",
      requestId: "req-model-capability",
    }),
  );

  assert.equal(details.kind, "validation");
  assert.equal(details.code, "MODEL_CAPABILITY_ERROR");
  assert.equal(
    getAiRunErrorMessage(details),
    "The configured AI model does not support image attachments. Contact the site administrator.",
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
