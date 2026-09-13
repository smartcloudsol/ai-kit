export interface LocalizedOption {
  value: string;
  label: string;
}

function createLabelCollator(locale: string): Intl.Collator {
  const options: Intl.CollatorOptions = {
    numeric: true,
    sensitivity: "base",
  };

  try {
    return new Intl.Collator(locale || undefined, options);
  } catch {
    return new Intl.Collator(undefined, options);
  }
}

/** Keep canonical filter values while ordering options by their visible labels. */
export function buildLocalizedOptions(
  values: string[],
  translate: (value: string) => string,
  locale: string,
): LocalizedOption[] {
  const collator = createLabelCollator(locale);

  return values
    .map((value) => ({ value, label: translate(value) }))
    .sort(
      (left, right) =>
        collator.compare(left.label, right.label) ||
        collator.compare(left.value, right.value),
    );
}
