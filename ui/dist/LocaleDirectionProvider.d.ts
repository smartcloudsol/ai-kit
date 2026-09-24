import { type PropsWithChildren } from "react";
/** Controlled per-root direction: never reads or changes documentElement.dir. */
export declare function LocaleDirectionProvider({ initialDirection, children }: PropsWithChildren<{
    initialDirection?: "ltr" | "rtl";
}>): import("react").JSX.Element;
