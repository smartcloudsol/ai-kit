import { Autocomplete, createTheme, Modal, MultiSelect, NumberInput, Select, Textarea, TextInput } from "@mantine/core";

const inputWrapperOrder = ["label", "input", "description", "error"] as const;

/** Shared by every AI Kit admin mount, including the Answers surface. */
export const adminTheme = createTheme({
  respectReducedMotion: true,
  components: {
    Modal: Modal.extend({ classNames: { root: "wpsuite-ai-kit-dialog" } }),
    TextInput: TextInput.extend({ defaultProps: { inputWrapperOrder: [...inputWrapperOrder] } }),
    Autocomplete: Autocomplete.extend({ defaultProps: { inputWrapperOrder: [...inputWrapperOrder], comboboxProps: { zIndex: 100020 } } }),
    Select: Select.extend({ defaultProps: { inputWrapperOrder: [...inputWrapperOrder], comboboxProps: { zIndex: 100020 } } }),
    MultiSelect: MultiSelect.extend({ defaultProps: { inputWrapperOrder: [...inputWrapperOrder], comboboxProps: { zIndex: 100020 } } }),
    NumberInput: NumberInput.extend({ defaultProps: { inputWrapperOrder: [...inputWrapperOrder] } }),
    Textarea: Textarea.extend({
      defaultProps: { resize: "vertical", inputWrapperOrder: [...inputWrapperOrder] },
      styles: {
        input: { resize: "vertical", overflowY: "auto", maxHeight: "min(600px, 70vh)" },
      },
    }),
  },
});
