import { AiKitConfig } from "@smart-cloud/ai-kit-core";
import { type Site } from "../main";

export type Config = Omit<AiKitConfig, "subscriptionType">;

export async function saveSettings(
  apiUrl: string,
  accountId: string,
  siteId: string,
  siteKey: string,
  config: Config
) {
  const response = await fetch(
    `${apiUrl}/account/${accountId}/site/${siteId}/settings`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Site-Key": siteKey,
        "X-Plugin": "ai-kit",
      },
      body: JSON.stringify({ settings: config }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `HTTP error! status: ${response.status}`);
  }

  const data = (await response.json()) as Site;
  return data.settings as AiKitConfig;
}
