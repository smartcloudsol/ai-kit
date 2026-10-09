export function resolveChatWelcome(
  greeting: string | undefined,
  starterQuestions: string[] | undefined,
  translate: (text: string) => string,
): { greeting: string; questions: string[] } {
  const authoredGreeting = typeof greeting === "string" ? greeting.trim() : "";
  const questions = Array.isArray(starterQuestions)
    ? starterQuestions
        .filter((question): question is string => typeof question === "string")
        .map((question) => question.trim())
        .filter(Boolean)
        .slice(0, 6)
        .map((question) => translate(question).trim())
        .filter(Boolean)
    : [];

  return {
    greeting: authoredGreeting ? translate(authoredGreeting).trim() : "",
    questions,
  };
}
