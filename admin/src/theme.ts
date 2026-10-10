import { createTheme, Textarea } from "@mantine/core";

/** Shared by every AI Kit admin mount, including the Answers surface. */
export const adminTheme = createTheme({
  respectReducedMotion: true,
  components: {
    Textarea: Textarea.extend({
      defaultProps: { resize: "vertical" },
      styles: {
        input: { resize: "vertical", overflowY: "auto", maxHeight: "min(600px, 70vh)" },
      },
    }),
  },
});
