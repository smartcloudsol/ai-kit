import { SetStateAction } from "react";
export type ShadowBoundaryMode = "local" | "overlay";
export type ShadowBoundaryProps = {
    /** Stylesheets to inject into the shadow root (as <link rel="stylesheet">). */
    stylesheets: string[];
    /** ID of the element inside the shadow root used as the portal target. */
    rootElementId: string;
    /** Variation of the shadow boundary behavior. */
    variation?: "default" | "modal";
    /**
     * Where to create the shadow root:
     * - "local": attach shadow to this component's host element (keeps layout positioning).
     * - "overlay": attach shadow to a singleton element in top (or self) document (always on top).
     */
    mode?: ShadowBoundaryMode;
    /**
     * For mode="overlay": host id in the top (or self) document.
     * Same id everywhere => singleton overlay host.
     */
    overlayRootId?: string;
    setHost: React.Dispatch<SetStateAction<HTMLElement | null>>;
    children: (api: {
        /** Portal target element inside the shadow root. */
        rootElement: HTMLDivElement;
        /** Shadow root instance. */
        shadowRoot: ShadowRoot;
    }) => React.ReactNode;
};
export declare function ShadowBoundary({ stylesheets, children, rootElementId, mode, overlayRootId, setHost, }: ShadowBoundaryProps): import("react/jsx-runtime").JSX.Element;
