/** Authored starting points. Selecting a preset never changes the saved profile. */
export const ANSWERS_PROFILE_PRESETS = [
  {
    id: "site-guide",
    label: "Site guide",
    description: "Help visitors understand your content and find the right page.",
    role: "a helpful website guide",
    tasks: [
      "Answer questions using the site's relevant published content.",
      "Help visitors find pages that match their question.",
      "Ask a short clarifying question when the request is ambiguous.",
    ],
    tone: "Clear, welcoming, and concise.",
  },
  {
    id: "services",
    label: "Services and enquiries",
    description: "Explain your services and help visitors decide what to ask next.",
    role: "a helpful services guide",
    tasks: [
      "Explain relevant services using the site's available source information.",
      "Clarify the visitor's needs before suggesting a service.",
      "Mention contact or booking routes only when supplied by the site.",
      "Do not invent prices, availability, guarantees, or service terms.",
    ],
    tone: "Professional, approachable, and concise.",
  },
  {
    id: "product-discovery",
    label: "Product discovery",
    description: "Help visitors compare products using your content and connected catalog.",
    role: "a helpful product discovery assistant",
    tasks: [
      "Clarify the visitor's needs and compare relevant products using available sources.",
      "Use current connected catalog results for prices, variants, and availability when that connection is configured.",
      "Keep product names as returned by the source; do not invent products or offers.",
      "Suggest product links only when supplied by an approved source.",
      "Do not claim to add to a cart, place an order, or reserve stock unless a configured action actually succeeds.",
    ],
    tone: "Helpful, practical, and concise; avoid sales pressure.",
  },
  {
    id: "customer-support",
    label: "Customer support",
    description: "Answer common questions from your documentation and support policies.",
    role: "a helpful customer support guide",
    tasks: [
      "Answer common questions using the site's documentation and supplied policies.",
      "Ask for the minimum non-sensitive detail needed to clarify the issue.",
      "Give source-supported steps and explain when information is unavailable.",
      "Suggest a human support route only when supplied by the site.",
      "Do not invent account access, refund decisions, order status, or policy exceptions.",
    ],
    tone: "Patient, respectful, and clear.",
  },
] as const;

export type AnswersProfilePresetId = (typeof ANSWERS_PROFILE_PRESETS)[number]["id"];

export interface ProfilePresetInputs {
  siteName: string;
  sitePurpose: string;
  audience: string;
  /** Owner-authored subjects, services, or product categories; never a scope whitelist. */
  portfolio: string;
}

export interface ProfilePresetValues {
  role: string;
  purpose: string;
  audience: string;
  task: string;
  tone: string;
  context: string;
}

export const PROFILE_PRESET_INPUT_LIMITS = {
  siteName: 120,
  sitePurpose: 4000,
  audience: 2000,
  portfolio: 4000,
} as const;

export type ProfilePresetErrors = Partial<Record<keyof ProfilePresetInputs | "preset" | "context", string>>;
export type ProfilePresetPreview =
  | { ok: true; values: ProfilePresetValues }
  | { ok: false; errors: ProfilePresetErrors };

const CONTEXT_START = "<!-- wpsuite:answers-preset-context:start -->";
const CONTEXT_END = "<!-- wpsuite:answers-preset-context:end -->";

function normalizeInput(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function containsControlText(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 9 && code !== 10) || code === 127;
  });
}

/** Only our complete marked block is replaceable; all other owner text is kept. */
function updatePresetContext(current: string, section: string): string | null {
  const start = current.indexOf(CONTEXT_START);
  const end = current.indexOf(CONTEXT_END);
  if (start === -1 && end === -1) {
    return `${current}${current ? "\n\n" : ""}${section}`;
  }
  if (start === -1 || end < start ||
    current.indexOf(CONTEXT_START, start + CONTEXT_START.length) !== -1 ||
    current.indexOf(CONTEXT_END, end + CONTEXT_END.length) !== -1) return null;
  return `${current.slice(0, start)}${section}${current.slice(end + CONTEXT_END.length)}`;
}

/** Build a local preview; this function performs no save and never changes its inputs. */
export function buildProfilePresetPreview(
  presetId: string,
  inputs: ProfilePresetInputs,
  current: { context: string },
): ProfilePresetPreview {
  const preset = ANSWERS_PROFILE_PRESETS.find((item) => item.id === presetId);
  const errors: ProfilePresetErrors = {};
  if (!preset) errors.preset = "Choose a starting point before previewing changes.";
  const normalized: ProfilePresetInputs = {
    siteName: normalizeInput(inputs.siteName),
    sitePurpose: normalizeInput(inputs.sitePurpose),
    audience: normalizeInput(inputs.audience),
    portfolio: normalizeInput(inputs.portfolio),
  };
  const labels = { siteName: "Site name", sitePurpose: "Site purpose", audience: "Audience", portfolio: "Topics or portfolio" };
  for (const key of Object.keys(PROFILE_PRESET_INPUT_LIMITS) as (keyof ProfilePresetInputs)[]) {
    const value = normalized[key];
    if ((key === "siteName" || key === "sitePurpose") && !value) {
      errors[key] = `${labels[key]} is required.`;
    } else if (inputs[key].length > PROFILE_PRESET_INPUT_LIMITS[key]) {
      errors[key] = `${labels[key]} allows at most ${PROFILE_PRESET_INPUT_LIMITS[key].toLocaleString()} characters.`;
    } else if (containsControlText(value) || value.includes("wpsuite:answers-preset-context:")) {
      errors[key] = `${labels[key]} contains unsupported control text.`;
    } else if (/\{\{[^}]*\}\}/.test(value)) {
      errors[key] = `Replace template placeholders in ${labels[key].toLowerCase()} with your actual site details.`;
    }
  }
  if (Object.keys(errors).length || !preset) return { ok: false, errors };
  const section = [
    CONTEXT_START,
    "## Site background supplied during Answers setup",
    `Site: ${normalized.siteName}`,
    `Purpose: ${normalized.sitePurpose}`,
    ...(normalized.audience ? [`Audience: ${normalized.audience}`] : []),
    ...(normalized.portfolio ? [
      "### Topics and portfolio described by the site owner",
      normalized.portfolio,
      "This describes the site's focus. It is not an exhaustive catalog, availability statement, or restriction on allowed topics.",
    ] : []),
    "Use the configured sources for factual claims. This background does not verify prices, availability, policies, or connected capabilities.",
    CONTEXT_END,
  ].join("\n\n");
  const context = updatePresetContext(current.context, section);
  if (context === null) return {
    ok: false,
    errors: { context: "The earlier setup section has incomplete or duplicate markers. Review General context before applying a starting point." },
  };
  if (context.length > 50000) return {
    ok: false,
    errors: { context: "The resulting General context exceeds 50,000 characters. Shorten the existing context or setup details before applying." },
  };
  return {
    ok: true,
    values: {
      role: `You are ${preset.role} for ${normalized.siteName}.`,
      purpose: normalized.sitePurpose,
      audience: normalized.audience,
      task: preset.tasks.join("\n"),
      tone: preset.tone,
      context,
    },
  };
}

/** Explicit application touches only guided behavior fields, including a preserved context. */
export function applyProfilePresetPreview<T extends ProfilePresetValues>(
  draft: T,
  preview: Extract<ProfilePresetPreview, { ok: true }>,
): T {
  return { ...draft, ...preview.values };
}
