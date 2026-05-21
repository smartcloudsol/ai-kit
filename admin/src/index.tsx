import { MantineProvider, createTheme } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { Notifications } from "@mantine/notifications";
import {
  AiKitConfig,
  getAiKitPlugin,
  getStore,
  type Store,
} from "@smart-cloud/ai-kit-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import Main from "./main";
import Diagnostics from "./diagnostics";

export const signUpAttributes = [
  "name",
  "family_name",
  "given_name",
  "middle_name",
  "nickname",
  "preferred_username",
  "birthdate",
  "email",
  "phone_number",
  "profile",
  "website",
];

const production = process.env?.NODE_ENV === "production";
if (!production) {
  import("./index.css");
}

const theme = createTheme({
  respectReducedMotion: true,
});

declare global {
  const wp: {
    data: {
      select: (store: Store) => {
        getConfig: () => AiKitConfig | null;
      };
    };
    media: {
      attachment: (id: number) => {
        fetch: () => void;
      } | null;
    };
  };
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: false,
      retryDelay: 0,
    },
  },
});

const aiKit = getAiKitPlugin();
if (!aiKit) {
  throw new Error("AiKit plugin is not available");
}
getStore().then(async (store) => {
  const view = aiKit?.view ?? "settings";
  const root = createRoot(document.getElementById("smartcloud-ai-kit-admin")!);
  if (view === "diagnostics") {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MantineProvider theme={theme}>
            <Notifications position="top-right" zIndex={100002} />
            <ModalsProvider modalProps={{ zIndex: 100001 }}>
              <Diagnostics />
            </ModalsProvider>
          </MantineProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
  } else {
    root.render(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <MantineProvider theme={theme}>
            <Notifications position="top-right" zIndex={100002} />
            <ModalsProvider modalProps={{ zIndex: 100001 }}>
              <Main {...aiKit} store={store} />
            </ModalsProvider>
          </MantineProvider>
        </QueryClientProvider>
      </StrictMode>,
    );
  }
});
