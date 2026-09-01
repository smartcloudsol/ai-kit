export const normalizeInitialFilterValues = (
  values: readonly string[] | undefined,
): string[] =>
  Array.from(
    new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
