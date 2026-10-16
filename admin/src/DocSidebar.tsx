import { Anchor, Code, Drawer, List, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef, type ReactNode } from "react";
import type { AiKitAdminPage } from "./admin-page";
import classes from "./main.module.css";
import "./doc-sidebar.css";

const pages: Record<AiKitAdminPage, ReactNode> = {
  general: (
    <>
      <Title order={2}>AI-Kit settings</Title>
      <Text>
        This sidebar explains the options available on the AI-Kit admin screen.
        Click the <strong>info</strong> icon next to any field to jump to its
        description here.
      </Text>
      <Title order={3} mt="md" id="default-output-language">
        <span className="highlightable">Default output language</span>
      </Title>
      <Text>
        Sets the preferred language for AI-generated text (where applicable). If
        you don’t change it, AI-Kit defaults to <strong>English</strong>. This
        is useful on multilingual sites, or when the browser/back-end can’t
        reliably infer what language the output should be.
      </Text>
      <Title order={3} mt="md" id="hide-powered-by-ai-kit">
        <span className="highlightable">Hide “Powered by AI-Kit”</span>
      </Title>
      <Text>
        Controls whether AI-Kit shows a small attribution link in places where
        AI-Kit renders UI (where applicable). You can hide it for a cleaner
        appearance.
      </Text>
      <Title order={3} mt="md" id="developer-settings">
        <span className="highlightable">Developer Settings</span>
      </Title>
      <Text>Advanced settings for developers and debugging purposes.</Text>
      <Title order={3} mt="md" id="enable-debug-logging">
        <span className="highlightable">Enable Debug Logging</span>
      </Title>
      <Text>
        When enabled, AI-Kit writes detailed debug information to WordPress
        debug logs. This is useful for troubleshooting issues or understanding
        how AI-Kit processes requests.
      </Text>
      <Text mt="xs">
        <strong>Requirements:</strong> Debug logging only works when both{" "}
        <Code>WP_DEBUG</Code> and <Code>WP_DEBUG_LOG</Code> are set to{" "}
        <Code>true</Code> in your <Code>wp-config.php</Code> file.
      </Text>
      <Text mt="xs">
        Logs will appear in <Code>wp-content/debug.log</Code>. Log entries are
        prefixed with <Code>[AI-Kit]</Code> and include the severity level
        (DEBUG, INFO, WARNING, ERROR).
      </Text>
      <Text mt="xs" c="orange">
        <strong>Note:</strong> Enable this only when troubleshooting. Debug
        logging can generate large log files and may impact performance on
        high-traffic sites.
      </Text>
    </>
  ),

  "api-settings": (
    <>
      <Title order={2} id="api-settings">
        <span className="highlightable">API Settings</span>
      </Title>
      <Text>
        Configure how AI-Kit reaches its backend for AI features (for example
        chat, summarization, and image metadata generation). You can run fully
        local, use the backend as a fallback, or force backend-only execution.
      </Text>

      <Title order={3} mt="md" id="aikit-api-mode">
        <span className="highlightable">Mode</span>
      </Title>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          <strong>Local only</strong>: AI-Kit will not call the backend.
        </List.Item>
        <List.Item>
          <strong>Backend fallback</strong>: try local first, then call the
          backend if local is unavailable.
        </List.Item>
        <List.Item>
          <strong>Backend only</strong>: always call the backend.
        </List.Item>
      </List>

      <Title order={3} mt="md" id="aikit-api-backend-transport">
        <span className="highlightable">Backend transport</span>
      </Title>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          <strong>Gatey / Amplify</strong>: uses REST API names from the Amplify
          configuration exposed by Gatey (read from{" "}
          <Code>getAmplifyConfig().API.REST</Code>).
        </List.Item>
        <List.Item>
          <strong>Fetch (base URL)</strong>: calls your backend directly using a
          base URL (useful for custom endpoints or non-Amplify setups).
        </List.Item>
      </List>

      <Title order={3} mt="md" id="aikit-api-backend-api-name">
        <span className="highlightable">Backend API name</span>
      </Title>
      <Text>
        Shown when using <strong>Gatey / Amplify</strong>. Select one of the
        REST API keys found in <Code>getAmplifyConfig().API.REST</Code>.
      </Text>

      <Title order={3} mt="md" id="aikit-api-backend-base-url">
        <span className="highlightable">Backend base URL</span>
      </Title>
      <Text>
        Shown when using <strong>Fetch (base URL)</strong>. Provide the base URL
        of your backend, e.g.{" "}
        <Code>https://xyz.execute-api.eu-central-1.amazonaws.com/prod</Code>.
      </Text>

      <Title order={3} mt="md" id="aikit-ai-spend-policy">
        <span className="highlightable">Backend-wide AI spend policy</span>
      </Title>
      <Text>
        Sets an operational monthly USD limit shared by every site and feature
        that uses the selected AI Kit backend. Leave the field empty to inherit
        the infrastructure hard cap. The admin value may lower that cap but
        cannot raise it.
      </Text>
      <Text mt="xs">
        The displayed usage is AI Kit&apos;s UTC-month estimate, not an AWS bill
        or a real-time AWS Budgets total. The safety percentage is applied
        before the configured ceiling to leave room for delayed and concurrent
        requests.
      </Text>
      <Title order={4} mt="md" id="aikit-ai-emergency-pause">
        <span className="highlightable">Emergency pause</span>
      </Title>
      <Text>
        Immediately rejects new backend model calls while leaving non-AI
        administration available. Turn it off explicitly when model access may
        resume; the monthly reset does not clear this switch.
      </Text>
    </>
  ),

  "chatbot-settings": (
    <>
      <Title order={2} id="chatbot-settings">
        <span className="highlightable">Chatbot Settings</span>
      </Title>
      <Text>
        Configure how the on-site chatbot looks and behaves: its title and
        language, theme, open button placement, and a few safety limits.
      </Text>

      <Title order={3} mt="md" id="chatbot-preview">
        <span className="highlightable">Preview</span>
      </Title>
      <Text>
        Shows a live preview of your current settings. This is preview-only: to
        apply changes on your site, enable the chatbot and save the settings.
      </Text>

      <Title order={3} mt="md" id="chatbot-enable">
        <span className="highlightable">Enable chatbot</span>
      </Title>
      <Text>
        Turns the chatbot on or off for your site. When disabled, the chatbot UI
        will not load on the frontend.
      </Text>

      <Title order={3} mt="md" id="chatbot-title">
        <span className="highlightable">Assistant name</span>
      </Title>
      <Text>
        The assistant name shown at the top of the chat modal. This is also the
        name mirrored into the conversation profile when a compatible backend
        is available. A separate conversation name is not edited. If empty,
        the default localized UI title is used.
      </Text>

      <Title order={3} mt="md" id="chatbot-placeholder">
        <span className="highlightable">Placeholder</span>
      </Title>
      <Text>
        The placeholder text in the message input. Keep it short, as it appears
        in a compact area.
      </Text>

      <Title order={3} mt="md" id="chatbot-ai-disclosure">
        <span className="highlightable">AI disclosure</span>
      </Title>
      <Text>
        Sets the notice shown directly above the message input to identify the
        chatbot as AI and remind visitors to verify important information. Use
        <code>{"{name}"}</code> to insert the localized chat title, or leave the
        field empty to use the localized default notice.
      </Text>

      <Title order={3} mt="md" id="chatbot-language">
        <span className="highlightable">Language</span>
      </Title>
      <Text>
        The UI language of the chatbot (labels, buttons, and default messages).
        Leave empty to use the built-in defaults.
      </Text>

      <Title order={3} mt="md" id="chatbot-direction">
        <span className="highlightable">Direction</span>
      </Title>
      <Text>
        Text direction of the chat UI. Use <strong>auto</strong> to follow the
        document direction, or force <strong>LTR</strong> / <strong>RTL</strong>
        for specific languages.
      </Text>

      <Title order={3} mt="md" id="chatbot-history-storage">
        <span className="highlightable">History storage</span>
      </Title>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          <strong>Local storage</strong>: persists across page reloads and new
          tabs in the same browser.
        </List.Item>
        <List.Item>
          <strong>Session storage</strong>: persists during the current tab
          session only.
        </List.Item>
        <List.Item>
          <strong>No storage</strong>: does not persist history (every open is a
          fresh chat).
        </List.Item>
      </List>
      <Text mt="xs">
        AI-Kit automatically clears stored chat history after the retention
        window.
      </Text>

      <Title order={3} mt="md" id="chatbot-history-retention">
        <span className="highlightable">History retention</span>
      </Title>
      <Text>
        Choose how many days chat history and messages stay in the browser
        before being cleared. Set this to the same positive integer as the
        backend <Code>SessionTTLDays</Code> parameter so the UI and DynamoDB TTL
        expire records in sync.
      </Text>

      <Title order={3} mt="md" id="chatbot-color-mode">
        <span className="highlightable">Color mode</span>
      </Title>
      <Text>
        Controls whether the chatbot uses a light or dark theme. Use
        <strong> auto</strong> to follow the site’s active color scheme.
      </Text>

      <Title order={3} mt="md" id="chatbot-primary-color">
        <span className="highlightable">Primary color</span>
      </Title>
      <Text>
        The main accent color used by the chatbot (buttons, highlights, focus
        states). You can also pick from custom colors you add below.
      </Text>

      <Title order={3} mt="md" id="chatbot-primary-shade-light">
        <span className="highlightable">Primary shade (light)</span>
      </Title>
      <Text>
        The shade index (0–9) used for the primary color in light mode. Lower
        numbers are lighter; higher numbers are darker.
      </Text>

      <Title order={3} mt="md" id="chatbot-primary-shade-dark">
        <span className="highlightable">Primary shade (dark)</span>
      </Title>
      <Text>
        The shade index (0–9) used for the primary color in dark mode.
      </Text>

      <Title order={3} mt="md" id="chatbot-theme-overrides">
        <span className="highlightable">Theme Overrides</span>
      </Title>
      <Text>
        Optional scoped CSS injected into the chatbot’s root container.
        Primarily intended for overriding exposed design tokens (e.g. --ai-kit*,
        --mantine*), but you can also add extra rules to fine-tune spacing,
        borders, and typography when the built-in options aren’t enough. For
        example:{" "}
        <Code>
          {
            ":host, #ai-kit-inline-root, #ai-kit-portal-root { --ai-kit-chat-border-radius: 16px; }"
          }
        </Code>{" "}
        to round the chat window.
      </Text>

      <Title order={3} mt="md" id="chatbot-custom-colors">
        <span className="highlightable">Custom colors</span>
      </Title>
      <Text>
        Define named hex colors (for example <Code>brand</Code> →
        <Code>#228be6</Code>) that you can later select as the primary color.
        Use this to match the chatbot to your brand palette.
      </Text>

      <Title order={3} mt="md" id="chatbot-openbutton-position">
        <span className="highlightable">Open button position</span>
      </Title>
      <Text>
        Where the floating chatbot open button appears on the page (for example
        bottom-right). Choose a corner that doesn’t conflict with other floating
        UI elements.
      </Text>

      <Title order={3} mt="md" id="chatbot-openbutton-label">
        <span className="highlightable">Open button label</span>
      </Title>
      <Text>
        The text shown on the open button (for example “Ask me”). If empty, the
        default localized label is used.
      </Text>

      <Title order={3} mt="md" id="chatbot-openbutton-icon-layout">
        <span className="highlightable">Open button icon layout</span>
      </Title>
      <Text>
        Controls where the icon sits relative to the label
        (top/bottom/left/right).
      </Text>

      <Title order={3} mt="md" id="chatbot-openbutton-icon">
        <span className="highlightable">Open button icon (base64)</span>
      </Title>
      <Text>
        A Data URL for the icon (for example
        <Code>data:image/svg+xml;base64,...</Code>). Leave empty to use the
        default icon. For best results, use a simple, single-color SVG.
      </Text>

      <Title order={3} mt="md" id="chatbot-openbutton-show-title">
        <span className="highlightable">Show open button title</span>
      </Title>
      <Text>Toggles whether the label text is visible on the open button.</Text>

      <Title order={3} mt="md" id="chatbot-openbutton-show-icon">
        <span className="highlightable">Show open button icon</span>
      </Title>
      <Text>Toggles whether the icon is visible on the open button.</Text>

      <Title order={3} mt="md" id="chatbot-label-overrides">
        <span className="highlightable">Label overrides</span>
      </Title>
      <Text>
        Override any built-in UI label (buttons, status texts, etc.). Only the
        labels you change are stored; removing an override restores the default
        translation for the selected language.
      </Text>

      <Title order={3} mt="md" id="chatbot-max-tokens">
        <span className="highlightable">Max output tokens</span>
      </Title>
      <Text>
        Optional per-reply output cap for backend chatbot responses. Leave it
        empty to use the backend default. Lower values reduce response length
        and cost; higher values allow longer answers before the model hits a
        <Code>max_tokens</Code> stop reason.
      </Text>

      <Title order={3} mt="md" id="chatbot-max-images">
        <span className="highlightable">Max images</span>
      </Title>
      <Text>
        Image attachments are disabled by default because not every frontend
        model is multimodal. Set a positive limit only when the configured
        frontend model supports image input; leave the value empty or set it
        to 0 otherwise.
      </Text>

      <Title order={3} mt="md" id="chatbot-max-image-bytes">
        <span className="highlightable">Max image bytes</span>
      </Title>
      <Text>
        Maximum allowed image size in bytes. This helps avoid large uploads and
        keeps requests within backend limits.
      </Text>
    </>
  ),

  "conversation-profile": (
    <>
      <Title order={2}>Conversation Profile</Title>
      <Text>
        Defines the server-owned policy used for every visitor conversation.
        Changes take effect without sending the profile from the browser with
        each chat request.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-presets">
        <span className="highlightable">Start with a useful assistant profile</span>
      </Title>
      <Text>
        In Answers setup, or when editing the profile, choose a starting point:
        Site guide, Services and enquiries, Product discovery, or Customer
        support. These are editable behavior templates, not verified knowledge
        or a connection to a service.
      </Text>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          Enter your site or business name and describe what visitors should
          achieve in one or two sentences. Optionally describe your audience
          and main topics, services, or product categories. Use your own words
          and replace any placeholders with your actual information.
        </List.Item>
        <List.Item>
          Select Preview assistant profile and review the role, purpose, tasks,
          tone, audience, and resulting general context. Selecting a preset or
          previewing it does not change saved settings.
        </List.Item>
        <List.Item>
          Apply reviewed profile copies those behavior fields into your draft.
          Existing general context outside the setup background section is
          retained. Model settings, tools, grounding, guardrails, and other
          detailed policy remain unchanged.
        </List.Item>
        <List.Item>
          Edit the draft if needed, then choose Finish setup in the wizard or
          Save profile in detailed settings. Applying a preview alone does not
          save the profile. Repeating setup follows the same review and save
          steps.
        </List.Item>
      </List>
      <Text mt="xs">
        A product-discovery starting point does not enable a catalog or cart.
        Connect live information separately. Prices, stock, service terms, and
        support policies must come from your configured sources, not the short
        business description.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-identity-scope">
        <span className="highlightable">Identity and scope</span>
      </Title>
      <Text>
        Describe the assistant&apos;s role, the site&apos;s purpose, audience, and
        the topics it may or must not cover. Put one topic per line. The
        configured scope keeps answers relevant to the site rather than acting
        as a general-purpose assistant.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-out-of-scope">
        <span className="highlightable">Out-of-scope behavior</span>
      </Title>
      <Text>
        Choose whether unrelated requests are declined, redirected toward an
        allowed topic, or escalated. Escalation can publish a structured
        backend event for a support workflow when that integration is enabled.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-common-context">
        <span className="highlightable">Common context</span>
      </Title>
      <Text>
        Store durable site-owned background in Markdown. Use headings and
        lists to separate product facts, policies, and guidance. Claims that
        require evidence still follow the grounding settings.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-response-guidance">
        <span className="highlightable">Response and guidance</span>
      </Title>
      <Text>
        Controls the default language, tone, response style, primary goals,
        conversion goals, and the directions the assistant should prefer.
        These are guidance, not permission to invent facts or bypass grounding.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-language">
        <span className="highlightable">Visitor-language messages</span>
      </Title>
      <Text>
        Out-of-scope and escalation messages express the intended meaning. The
        agent is instructed to render normal out-of-scope replies in the latest
        visitor language. Guardrail intervention bypasses the model, so the
        backend translates that configured fallback using the request locale
        and uses the original text if translation is unavailable.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-actions">
        <span className="highlightable">Suggested visitor actions</span>
      </Title>
      <Text>
        These entries tell the assistant which next steps it may recommend in
        its replies. Use unique, stable IDs, a visitor-facing label, a clear
        description, and optional topic guidance. Enabling an action does not
        create a button, call an API or MCP tool, or connect an account.
      </Text>

      <Title order={4} mt="md" id="conversation-profile-action-kind">
        <span className="highlightable">Kind and examples</span>
      </Title>
      <Text>
        Kind describes the recommendation to the assistant. It is not an
        execution mode. The examples below use placeholder destinations;
        replace them with your own approved pages.
      </Text>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          <strong>Link</strong>: <Code>read-docs</Code>, “Read the setup guide,”
          target <Code>https://example.com/docs</Code>. Recommend it when a
          visitor wants installation steps.
        </List.Item>
        <List.Item>
          <strong>Contact</strong>: <Code>contact-sales</Code>, “Contact sales,”
          target <Code>https://example.com/contact</Code>. Recommend it for a
          pricing or purchase discussion.
        </List.Item>
        <List.Item>
          <strong>Human handoff</strong>: <Code>talk-to-support</Code>, “Talk to
          support,” target <Code>https://example.com/support</Code>. Recommend
          the human support route for a complex issue. This catalog entry alone
          does not publish <Code>chat.escalation.requested</Code>; that event
          belongs to the separate escalation tool and policy.
        </List.Item>
        <List.Item>
          <strong>Custom recommendation</strong>: <Code>request-demo</Code>,
          “Request a demo,” target <Code>https://example.com/demo</Code>.
          Describe a site-specific next step that does not fit the other kinds.
          It remains a recommendation, not a custom API call.
        </List.Item>
      </List>

      <Title order={4} mt="md" id="conversation-profile-action-target">
        <span className="highlightable">Target</span>
      </Title>
      <Text>
        Optional destination text passed to the assistant with the action.
        Typically this is a public HTTPS page or contact route. The backend
        does not fetch the target, validate it as a tool endpoint, or use it for
        authentication. Configure callable capabilities under Tools; OAuth,
        pairing, and credentials are not configured in the action catalog.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-model">
        <span className="highlightable">Model</span>
      </Title>
      <Text>
        Selects the model or inference profile, reasoning effort, response
        limit, and temperature. Automatic inference-profile selection follows
        the backend Region and the profiles available there.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-tools">
        <span className="highlightable">Tools</span>
      </Title>
      <Text>
        Enables the capabilities the model may call. Automatic policy lets the
        model decide when evidence or computation is necessary; requiring a
        tool forces at least one tool call for each request.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-presentation">
        <span className="highlightable">Display templates</span>
      </Title>
      <Text>
        Add template opens a new draft. Its optional preset supplies initial
        presentation defaults; it is not a source filter, permission or permanent
        template type. Existing custom templates do not need a preset.
        Select an approved read source and a compact list, cards or carousel
        layout. Map its own output fields with JSON Pointers; empty selects the
        root. Templates do not authorize new tools, run code or accept raw HTML.
        Identity and title are required. Optional descriptions, images, typed
        attributes and navigation links appear only when the verified source
        supplies them. Images and links also need approved public HTTPS origin
        or path prefixes. Never use a model-generated URL, price or time slot.
      </Text>
      <Text>
        Headings and button labels use the shared translation catalog in the
        chatbot UI language. Missing translations retain the authored source;
        the model does not translate these labels. The answer can follow a
        different question language. The template list opens an editor for each template. Add, remove
        or move attribute and navigation mappings to control visibility and
        order; removing a mapping never deletes source data. Apply to profile
        draft accepts the editor changes but does not save them to the backend.
        Cancel discards changes in the editor only. Save conversation profile
        activates the full profile draft, including confirmed template removals.
        Each applied template change carries one new revision and shows at most six items.
        Missing images or prices do not prevent a valid title from appearing.
      </Text>
      <Text>
        WordPress structured content can share one template across several
        approved content types. Pointer suggestions come from their approved
        field mappings; for example, target key specialty becomes
        <Code>/fields/specialty</Code>. Observed sample fields are labelled
        separately and are not a guarantee for every record. Advanced pointers
        remain editable. Missing fields are omitted, not invented.
      </Text>
      <Text>
        Navigation can read a complete verified HTTPS URL, or use a profile-owned
        fixed HTTPS destination with required query parameters mapped to public
        source identifiers. The latter needs verified display-policy version 3;
        it does not change the response transport contract. Identifier values are
        encoded, not evaluated. Missing required identifiers omit the link;
        optional identifiers omit their query parameter rather than inventing
        a value. Optional exact-string conditions can restrict a navigation
        mapping to matching source records. Every condition must match, and
        missing condition fields omit the link. These conditions require the
        same version 3 policy capability and never grant source access. Never map
        passwords, access tokens or personal data into public navigation.
      </Text>
      <Text>
        Preview executes a bounded authenticated read of the approved source,
        not a model call. Enter its declared lookup arguments, never pasted
        output. For WordPress, use the entity reference and expected source
        version of an already synchronized record. These identify the record
        to read; they are not example card data. Observed fields describe only that fresh sample and are not an
        output schema. Any profile, connection, mapping or argument change
        invalidates the preview. A navigation link opens a page; it does not
        place an order or book an appointment. Save the profile after review.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-workflows">
        <span className="highlightable">Tool workflows and list drafts</span>
      </Title>
      <Text>
        A workflow connects approved reads in one assistant turn. Inputs describe
        the values supplied by the assistant; steps bind these inputs or earlier
        verified results to tool arguments. Dependencies, not visual order,
        decide when steps can run. Independent steps may run concurrently.
        Expand an item to edit it, then Apply to draft. Cancel keeps the last
        applied item. Removing an item asks for confirmation and affects only
        the draft; review dependent steps after renaming or removal.
        Save conversation profile activates the complete configuration.
        Suggested visitor actions guide replies; they do not execute tools.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-connections">
        <span className="highlightable">Connect live information</span>
      </Title>
      <Text>
        Guided connections are optional. Choose a service from the list
        supplied by your backend, enter its connection details, then check and
        review the available reads. Your WordPress content remains a separate
        knowledge source. Opening this section does not install a plugin,
        create an account, or enable any operation.
      </Text>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          For a supported product catalog, find the store&apos;s own domain in
          its administration. Shopify uses the shop&apos;s
          <Code>myshopify.com</Code> domain; copy the domain rather than an admin
          page, product URL, or JSON export. The preset derives the supported
          endpoint and reviewed input shapes for you.
        </List.Item>
        <List.Item>
          Country selects the selling market. Fallback catalog language selects
          the language used without visitor-language binding. Use the
          visitor&apos;s language sends the resolved reply language when the
          service supports it; it does not change country or currency. Actual
          product translations must be published in the service.
        </List.Item>
        <List.Item>
          Connection details includes the public agent profile used for
          protocol negotiation. Prefer the owned profile URL supplied by the
          selected compatible backend. It must be publicly reachable by the
          service and describe capabilities supported by your backend. It is
          not an account password or API token; do not paste secrets or use a
          tutorial profile as your permanent production identity.
        </List.Item>
        <List.Item>
          Check connection and available reads initializes the remote service
          and lists its available tool schemas. It does not call a catalog
          search or another tool, modify store data, or save a profile. Review
          the service identity, endpoint, and operations shown in the result.
        </List.Item>
        <List.Item>
          Explicitly approve the listed read-only operations, then Add reviewed
          connection to draft. Finish setup or Save profile persists that
          draft. Cart, checkout, and order changes are not enabled by this
          approval. Changing connection details requires a new check.
        </List.Item>
      </List>
      <Text mt="xs">
        If guided discovery is unavailable, update the selected backend to a
        compatible release or use a reviewed custom configuration in detailed
        Tools settings. Existing connections are retained. Saving a connection
        does not prove answer quality; test a known item, its details, a missing
        item, and the intended visitor language against the source service.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-shopify-storefront">
        <span className="highlightable">Shopify catalog and advanced data</span>
      </Title>
      <Text>
        Guided setup connects the Shopify UCP catalog. For complementary
        product search, details and shop capabilities, choose the separate
        <Code> shopify-storefront </Code> REST adapter in detailed Tools settings.
        It is not an MCP server. A compatible backend and installed Shopify app
        with approved Storefront access are required.
      </Text>
      <Text mt="xs">
        Expand a tool, enter its original <Code>myshopify.com</Code> domain,
        choose one fixed read operation and provide an app-owned SSM parameter
        reference, never a token. Market, language and shipping consent are
        separate optional sections. The backend owns the GraphQL request.
        Changes remain in the draft until <strong>Save profile</strong>.
      </Text>
      <Text mt="xs">
        Availability does not prove an exact stock count; missing quantity and
        ratings remain unknown. Combined conditions must match the same variant.
        Native filters require Shopify filter configuration. Check published
        products, markets and translations in the shop; a connection does not
        guarantee fulfillment, shipping dates or payment methods.
      </Text>
      <Text mt="xs">
        Shipping quotes are off by default and require approved Storefront scopes
        <Code> unauthenticated_read_checkouts </Code> and
        <Code> unauthenticated_write_checkouts</Code>. The visitor reviews the
        selected items and delivery details before explicitly confirming a
        temporary quote cart. No order or payment is made. Missing rates and
        pending calculations remain explicit, not delivery promises.
      </Text>
      <Text mt="xs">
        Opening settings does not install an app, grant scopes or save changes.
        See the <Anchor href="https://wpsuite.io/docs/ai-kit/answers-setup" target="_blank" rel="noopener noreferrer">general Answers setup guide</Anchor> for the existing onboarding overview.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-product-pages">
        <span className="highlightable">Product pages on your website</span>
      </Title>
      <Text>
        Your catalog can supply current prices and availability while visitors
        read the full product information on your own WordPress website. Choose
        whether to keep the original store links, prefer your WordPress pages,
        or use only WordPress pages. Existing profiles keep their original links
        until you change this setting. Local page resolution needs a compatible backend.
      </Text>
      <List size="sm" spacing="xs" withPadding>
        <List.Item>
          Search the approved live catalog by a product name and select a result.
          The product ID is filled from the service; no JSON export or identifier
          lookup is needed. Check the displayed ID for similarly named products.
        </List.Item>
        <List.Item>
          Search published WordPress pages and select the page dedicated to that
          product. Only public pages without passwords are offered. A collection
          page is not automatically a dedicated product page. No page is created
          or published by the assistant.
        </List.Item>
        <List.Item>
          Review the pair and add it to the draft. An optional language tag limits
          it to that visitor language; leave it empty for a shared page. Exact
          language, base language, then shared page determine the match. Finish
          setup or Save profile saves the pairs with your other settings.
        </List.Item>
        <List.Item>
          Local integrations may suggest pages using verified product IDs. Review
          them before adding. Explicit pairs take precedence. Recognition depends
          on the installed integration; unsupported Shopify plugins use the manual
          picker. Names and URL slugs are never guessed as product identities.
        </List.Item>
        <List.Item>
          Prefer WordPress pages falls back to the original product link when no
          local pair matches. WordPress pages only omits that external link. Prices,
          variants and availability remain facts from the live catalog in either mode.
        </List.Item>
      </List>
      <Text mt="xs">
        Keep up to 50 pairs per connection. After moving or unpublishing a page,
        review its saved pair; discovery does not automatically rewrite profiles.
        The profile is shared by clients using this backend, so choose their intended
        public website. These settings do not enable cart or checkout operations.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-mcp-json">
        <span className="highlightable">Custom MCP configuration and JSON</span>
      </Title>
      <Text>
        Custom configurations describe operations approved by the site owner.
        The server ID is your unique local name; the pinned server name comes
        from the MCP initialize response. The endpoint comes from the
        service&apos;s official documentation. The purpose and tool descriptions
        explain the intended allowed use in your own words.
      </Text>
      <Text mt="xs">
        The remote tool name and inputSchema come from the service&apos;s MCP
        tools/list response. Review them before approval. An approved snapshot
        combines that remote schema with your approved description, policy
        class, and explicit read-only confirmation. It is not an arbitrary
        product export or a JSON document generated from a prompt. The backend
        validates the saved schema and checks the service identity and schema
        during use; a remote change can require renewed review.
      </Text>
      <Text mt="xs">
        A reviewed model inputSchema may narrow or reshape the permitted input
        through a shipped adapter. In that case, remoteInputSchema records the
        actual remote schema used for compatibility checks. Protocol-adapter
        and provider-preset configuration are data for code shipped with your
        backend, not executable scripts. Use only documented adapter fields.
        Visitor-language binding uses a declared string field in every
        approved model input schema; a guided connection supplies its pointer.
      </Text>
      <Text mt="xs">
        Reviewed server import stages a disabled, unsaved configuration for
        inspection. Check the identity, endpoint, operations, descriptions,
        read-only approval, and adapter details before enabling and saving it.
        Example configuration files illustrate one captured and reviewed
        service version; they are not guaranteed to match your service and are
        not Shopify exports. Keep custom snapshots up to date when the remote
        service changes.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-product-actions">
        <span className="highlightable">Catalog answers and future cart actions</span>
      </Title>
      <Text>
        The catalog connection supplies read-only evidence for replies and
        references. Approved display templates can render verified products as
        cards or a carousel; they do not enable a shopping cart or checkout
        actions. A site&apos;s commerce plugin and
        an MCP or UCP cart do not automatically share a cart or visitor session.
        Any future cart integration needs a supported driver and an explicit
        visitor action; the assistant must not claim a cart change succeeded
        from a text recommendation alone.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-kb-tool">
        <span className="highlightable">Knowledge Base and metadata</span>
      </Title>
      <Text>
        The Knowledge Base tool receives the backend metadata configuration so
        it knows the available categories, tags, and their grounding policies.
        Profile metadata keys can further restrict which filters the model may
        construct; they cannot expand the backend configuration.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-url-prefixes">
        <span className="highlightable">Allowed HTTPS URL prefixes</span>
      </Title>
      <Text>
        Web grounding can fetch only URLs below these prefixes. Enter one
        absolute HTTPS URL per line, without credentials, a query string, or a
        fragment. A root prefix such as <Code>https://example.com/</Code>
        permits the full host. A path prefix such as{" "}
        <Code>https://aws.amazon.com/marketplace/</Code> permits only that
        section and its descendants.
      </Text>
      <Text mt="xs">
        This is approved-page retrieval, not unrestricted web search. Add only
        the public pages or sections you want the assistant to consult. Guided
        setup stages this access separately from other connections. If the
        current evidence policy permits only Knowledge Base sources, enabling
        web grounding also requires explicit approval of the compatible policy
        change. Existing grounding and safety policy is otherwise retained.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-grounding-safety">
        <span className="highlightable">Grounding, guardrails, and escalation</span>
      </Title>
      <Text>
        Evidence policy decides when the assistant must use grounded sources
        and what happens when evidence is missing. Metadata category policies
        may require stricter grounding for selected subjects. Guardrails add
        independent input and output checks; pin a numbered guardrail version
        together with its identifier.
      </Text>

      <Title order={3} mt="md" id="conversation-profile-memory">
        <span className="highlightable">Conversation memory</span>
      </Title>
      <Text>
        Topic tracking separates context changes without deleting history.
        Summaries keep long conversations within model limits, while evidence
        references can be retained so earlier grounded claims remain traceable.
      </Text>
    </>
  ),

  "kb-admin": (
    <>
      <Title order={2}>Knowledge Base Admin</Title>
      <Text>
        The Knowledge Base (KB) Admin interface allows you to transform your
        WordPress posts and pages into structured knowledge base documents that
        can be published to your AI-Kit backend for use in chatbots and other AI
        features.
      </Text>

      <Title order={3} mt="md" id="kb-admin-overview">
        <span className="highlightable">Overview</span>
      </Title>
      <Text>
        KB Admin treats WordPress as the single source of truth. Any post or
        page can be enabled as a KB source. The system automatically generates
        markdown documents from your content, which you can review, customize,
        and publish to your backend.
      </Text>
      <Text>
        Automatic Knowledge Sync manages ongoing publication using approved
        content-type policies. Source review and manual publishing provides
        individual document previews, overrides and immediate publish/withdraw
        controls. It does not replace the automatic policy: review that policy
        when a source must stay excluded. Metadata configuration layers supply
        defaults and overrides for classification, not a separate publisher.
      </Text>
      <Text>
        In Content policy, Public content type selects the policy being edited
        below it. In the field list, checking a field approves mirroring;
        selecting its name opens that field&apos;s settings. Source text format
        can explicitly declare HTML rich text or Markdown. Save the policy and
        synchronize a new source version before testing. A template must also
        opt into safe rich-text formatting; otherwise display stays plain text.
      </Text>

      <Title order={3} mt="md" id="kb-settings-base-url">
        <span className="highlightable">Base URL Override</span>
      </Title>
      <Text>
        Optional. Overrides the WordPress site URL in source links embedded in
        KB documents. This is useful when your development environment URL
        differs from your production URL.
      </Text>
      <Text mt="xs">
        <strong>Example:</strong> If you develop on{" "}
        <Code>http://localhost:10004</Code> but deploy to{" "}
        <Code>https://example.com</Code>, set this field to{" "}
        <Code>https://example.com</Code>. This ensures that all source links in
        published KB documents point to your production site instead of
        localhost.
      </Text>
      <Text mt="xs">
        Leave empty to use the default WordPress site URL from settings.
      </Text>

      <Title order={3} mt="md" id="kb-sources-list">
        <span className="highlightable">Source review and manual publishing</span>
      </Title>
      <Text>
        The sources list shows all posts and pages that are enabled as KB
        sources. Each source displays its current status, last update time, and
        publish state.
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          <strong>Post Status:</strong> Whether the WordPress post is published
          (Live) or in draft state
        </List.Item>
        <List.Item>
          <strong>KB Status:</strong> The review and publish state of the KB
          document (Needs Review, Ready to Publish, Published)
        </List.Item>
        <List.Item>
          <strong>Filters:</strong> Search by title, filter by post type,
          status, or KB status to quickly find sources
        </List.Item>
      </List>

      <Title order={3} mt="md" id="kb-add-source">
        <span className="highlightable">Adding a KB Source</span>
      </Title>
      <Text>
        Click <strong>Add Source</strong> to enable a post or page as a KB
        source. You can either:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          Search for a post by title and select it from the results
        </List.Item>
        <List.Item>Enter a post ID directly if you know it</List.Item>
      </List>
      <Text mt="xs">
        Once enabled, the system automatically generates KB documents from the
        post content. These documents will be marked as{" "}
        <strong>Needs Review</strong> until you approve them.
      </Text>

      <Title order={3} mt="md" id="kb-document-sections">
        <span className="highlightable">Documents and Sections</span>
      </Title>
      <Text>
        When you select a KB source, you&apos;ll see its generated documents and
        sections. The system automatically converts your post content into
        markdown format.
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          <strong>Documents:</strong> Each post generates at least one base
          document. Using special KB section blocks in Gutenberg or Elementor,
          you can create multiple documents from a single post
        </List.Item>
        <List.Item>
          <strong>Sections:</strong> Documents are divided into sections for
          granular control. Each section can have its own metadata (title,
          category, tags)
        </List.Item>
        <List.Item>
          <strong>Override:</strong> You can edit any section&apos;s content or
          metadata. Overridden sections are marked as &quot;locked&quot; and
          won&apos;t be regenerated automatically
        </List.Item>
      </List>

      <Title order={3} mt="md" id="kb-section-blocks">
        <span className="highlightable">KB Section Blocks and Widgets</span>
      </Title>
      <Text>
        To have fine-grained control over how your posts are converted to KB
        documents, you can use special <strong>KB Section</strong> container
        blocks (in Gutenberg) or widgets (in Elementor) within your source
        posts.
      </Text>
      <Text mt="xs">
        <strong>The KB Section block/widget allows you to:</strong>
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          <strong>Create separate documents:</strong> Mark any section to
          generate its own standalone KB document with unique metadata
          (category, subcategory, tags) different from the main post
        </List.Item>
        <List.Item>
          <strong>Exclude sections:</strong> Completely omit certain sections
          from KB document generation (useful for site-specific content that
          shouldn&apos;t be in the knowledge base)
        </List.Item>
        <List.Item>
          <strong>Designate override targets:</strong> Mark sections where you
          plan to set permanent overrides that won&apos;t be affected by future
          KB document regenerations
        </List.Item>
        <List.Item>
          <strong>Custom metadata per section:</strong> Assign specific
          categories, subcategories, and tags to individual sections for better
          organization in your knowledge base
        </List.Item>
      </List>
      <Text mt="xs">
        <strong>Gutenberg:</strong> Look for the{" "}
        <Code>smartcloud-ai-kit/kb-section</Code> container block in the block
        inserter. Add it to your post and wrap the content you want to control.
      </Text>
      <Text mt="xs">
        <strong>Elementor:</strong> Find the &quot;AI-Kit KB Section&quot;
        container widget in the widget panel. Drag it onto your page and add
        elements inside it.
      </Text>
      <Text mt="xs">
        Both the block and widget include settings for mode (inherit /
        separate_doc / exclude), document key, and metadata overrides.
      </Text>

      <Title order={3} mt="md" id="kb-section-override">
        <span className="highlightable">Section Overrides</span>
      </Title>
      <Text>
        Overrides let you customize the generated markdown or metadata for any
        section. This is useful when:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          The automatic conversion doesn&apos;t capture your formatting
          correctly
        </List.Item>
        <List.Item>
          You want to add extra context or explanations for AI consumers
        </List.Item>
        <List.Item>
          You need to adjust metadata like title, category, or tags
        </List.Item>
      </List>
      <Text mt="xs">
        <strong>Locking behavior:</strong> When you save an override, that
        section becomes &quot;locked.&quot; Future regenerations won&apos;t
        overwrite your custom content. If the source post changes, the section
        will be marked as <strong>Needs Review</strong> so you can decide
        whether to update your override or keep it as-is.
      </Text>

      <Title order={3} mt="md" id="kb-regenerate">
        <span className="highlightable">Regenerating Content</span>
      </Title>
      <Text>
        Click <strong>Regenerate</strong> to re-parse the source post and update
        all non-locked sections. This is useful when:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>You&apos;ve edited the source post in WordPress</List.Item>
        <List.Item>
          You want to refresh the generated markdown to pick up changes
        </List.Item>
        <List.Item>
          You&apos;ve adjusted your KB section blocks (mode, metadata)
        </List.Item>
      </List>
      <Text mt="xs">
        Locked (overridden) sections will not be regenerated. They&apos;ll be
        flagged for review if their source content has changed.
      </Text>

      <Title order={3} mt="md" id="kb-approve">
        <span className="highlightable">Approving Documents</span>
      </Title>
      <Text>
        Before publishing, you must approve documents. Click{" "}
        <strong>Approve for Publishing</strong> to mark all documents in the
        post as <strong>Ready to Publish</strong>. This confirms that
        you&apos;ve reviewed the content and it&apos;s ready to be sent to the
        backend.
      </Text>
      <Text mt="xs">
        This step prevents accidental publication of unreviewed or incomplete
        content.
      </Text>

      <Title order={3} mt="md" id="kb-publish">
        <span className="highlightable">Publishing to Backend</span>
      </Title>
      <Text>
        Click <strong>Publish to KB</strong> to upload all approved documents to
        your AI-Kit backend. The documents are:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          Uploaded to S3 with metadata (post ID, URL, account/site info)
        </List.Item>
        <List.Item>
          Ingested by the backend for use in AI features (with debouncing to
          avoid duplicate processing)
        </List.Item>
        <List.Item>
          Tracked in the publish state table so you know what&apos;s currently
          live
        </List.Item>
      </List>
      <Text mt="xs">
        The system automatically handles orphaned documents (documents that were
        previously published but are no longer part of the post) by deleting
        them from the backend.
      </Text>

      <Title order={3} mt="md" id="kb-config-metadata">
        <span className="highlightable">Metadata Configuration Layers</span>
      </Title>
      <Text>
        The effective metadata configuration is materialized from three
        separately owned inputs:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          <strong>Manual policy:</strong> authored defaults, restrictions,
          aliases, exclusions, locks, and other YAML fields
        </List.Item>
        <List.Item>
          <strong>External vocabularies:</strong> fixed, named JSON sources
          such as Docusaurus product and content-type terms
        </List.Item>
        <List.Item>
          <strong>WordPress-derived vocabulary:</strong> a read-only,
          machine-owned union of the taxonomies selected in Knowledge Sync
        </List.Item>
      </List>
      <Text mt="xs">
        Edit only the layer you own. The Effective result and Provenance tabs
        are read-only. Every save validates the complete merge before replacing
        the last-known-valid effective YAML; ETags prevent concurrent admin
        edits from silently overwriting one another.
      </Text>

      <Title order={3} mt="md" id="kb-knowledge-sync">
        <span className="highlightable">Automatic Knowledge Sync</span>
      </Title>
      <Text>
        Configure the backend URL, environment, private-key storage, and batch
        sizes under <strong>Connection and runner</strong>. Save those settings,
        then create a one-time pairing code and enroll the site. The private
        signing key remains in WordPress.
      </Text>
      <Text mt="xs">
        Under <strong>Content policy</strong>, select a public post type, enable
        synchronization, choose its approval policy, and select the public
        taxonomies that should become document metadata. Enabling a policy
        creates a paginated baseline; later publish, update, taxonomy,
        unpublish, trash, restore, and delete transitions are coalesced in the
        local durable outbox.
      </Text>
      <Text mt="xs">
        WordPress pseudo-cron runs a pass every five minutes while work is in
        scope. Use <strong>Run one sync pass</strong> for an immediate check and
        review the Operational status panel for the baseline, outbox,
        WordPress-vocabulary version, and last runner result. A real system cron
        that invokes WordPress cron remains the reliable production choice for
        low-traffic sites.
      </Text>

      <Title order={3} mt="md" id="kb-config-prompts">
        <span className="highlightable">Prompt Templates</span>
      </Title>
      <Text>
        These templates serve DocSearch, conversation history summaries, and
        prompt requests without a conversation profile. Configure the
        chatbot&apos;s main instructions in <strong>Conversation profile</strong>,
        not in this template editor. Each template contains model instructions
        and placeholders.
      </Text>
      <Text mt="xs">
        Templates are stored in S3 and loaded at runtime by the backend. A
        running backend instance may retain a cached copy until its template
        cache refreshes after saving.
      </Text>

      <Title order={4} mt="md">
        <strong>Retrieval and History Templates:</strong>
      </Title>

      <Text mt="xs">
        <strong>QUERY template:</strong> Builds the KB retrieval query and
        metadata filters for prompt requests without a conversation profile.
        Output must be JSON (query, categories, subCategories, tags).
        Profile-driven chat and DocSearch do not use this query template.
      </Text>

      <Text mt="xs">
        <strong>SUMMARY template:</strong> When conversation history grows too
        long, this template summarizes previous messages and context so the
        model can retain earlier context without reprocessing every old
        message. This includes profile-driven chat, but is separate from the
        standalone summarize operation.
      </Text>

      <Title order={4} mt="md">
        <strong>Answers Without a Conversation Profile:</strong>
      </Title>

      <Text mt="xs">
        <strong>ANSWER template:</strong> Default answer instructions for
        prompt requests without a conversation profile. Profile-driven chat
        uses the conversation profile and backend instructions instead.
      </Text>

      <Text mt="xs">
        <strong>ANSWER-KB-ONLY template:</strong> Fallback for non-profile
        requests when no KB evidence is available, grounding is required, and
        answering without KB evidence is disabled. It states that the requested
        information is unavailable rather than guessing.
      </Text>

      <Text mt="xs">
        <strong>ANSWER-ASK-WHEN-NO-KB template:</strong> Fallback for non-profile
        requests when no KB evidence is available, grounding is optional, and
        answering without KB evidence is disabled. It asks for clarification
        instead of guessing.
      </Text>

      <Title order={4} mt="md">
        <strong>DocSearch Mode:</strong>
      </Title>

      <Text mt="xs">
        <strong>ANSWER-KB-RAG template:</strong> DocSearch-specific synthesis
        prompt used in KB research/search mode. This mode may combine evidence
        across multiple top-level categories and produce an AI Summary grounded
        in the retrieved snippets.
      </Text>

      <Text mt="xs" c="dimmed" size="sm">
        <strong>Note:</strong> The backend selects the active answer path from
        the request mode, conversation profile, retrieval results, and grounding
        policy. The two missing-source fallback templates above do not control
        profile-driven chat. Grounding policies remain configurable independently
        of these template files.
      </Text>

      <Title order={3} mt="md" id="kb-disable-source">
        <span className="highlightable">Disabling a KB Source</span>
      </Title>
      <Text>
        To remove a post from KB sources, click the <strong>Disable</strong>{" "}
        action. This will:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>Remove the post from the KB sources list</List.Item>
        <List.Item>
          Delete all published documents from the backend (S3 cleanup)
        </List.Item>
        <List.Item>
          Clear the publish state from the WordPress database
        </List.Item>
      </List>
      <Text mt="xs">
        This is a destructive action and requires confirmation. The source post
        itself remains unchanged in WordPress.
      </Text>

      <Title order={3} mt="md" id="kb-backend-requirements">
        <span className="highlightable">Backend Requirements</span>
      </Title>
      <Text>
        KB Admin requires a configured backend connection. Make sure you&apos;ve
        set up API settings with either:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          <strong>Gatey transport:</strong> Amplify REST via WP Suite (easiest)
        </List.Item>
        <List.Item>
          <strong>Fetch transport:</strong> Direct base URL to your API Gateway
        </List.Item>
      </List>
      <Text mt="xs">
        If the backend is not available, you&apos;ll see an alert in the KB
        Admin interface with details about why it&apos;s unavailable.
      </Text>
    </>
  ),
};

interface DocSidebarProps {
  opened: boolean;
  close: () => void;
  page: AiKitAdminPage;
  scrollToId: string;
}

export default function DocSidebar({
  opened,
  close,
  page,
  scrollToId,
}: DocSidebarProps) {
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrollHighlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (scrollHighlightTimeoutRef.current) {
      clearTimeout(scrollHighlightTimeoutRef.current);
      scrollHighlightTimeoutRef.current = null;
    }
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      highlightTimeoutRef.current = null;
    }

    document
      .querySelectorAll(classes["highlighted-doc-item"])
      .forEach((el) => el.classList.remove(classes["highlighted-doc-item"]));

    if (!opened || !scrollToId) {
      return;
    }

    scrollHighlightTimeoutRef.current = setTimeout(() => {
      const targetElement = document.getElementById(scrollToId);

      if (!targetElement) {
        scrollHighlightTimeoutRef.current = null;
        return;
      }

      targetElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      const highlightableEl = targetElement.querySelector(".highlightable");

      if (highlightableEl) {
        highlightableEl.classList.add(classes["highlighted-doc-item"]);

        highlightTimeoutRef.current = setTimeout(() => {
          highlightableEl.classList.remove(classes["highlighted-doc-item"]);
          highlightTimeoutRef.current = null;
        }, 2000);
      }

      scrollHighlightTimeoutRef.current = null;
    }, 0);

    return () => {
      if (scrollHighlightTimeoutRef.current) {
        clearTimeout(scrollHighlightTimeoutRef.current);
        scrollHighlightTimeoutRef.current = null;
      }
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
        highlightTimeoutRef.current = null;
      }
      document
        .querySelectorAll(classes["highlighted-doc-item"])
        .forEach((el) => el.classList.remove(classes["highlighted-doc-item"]));
    };
  }, [opened, scrollToId]);

  return (
    <Drawer
      classNames={{ content: "wpsuite-doc-sidebar" }}
      opened={opened}
      onClose={close}
      position="right"
      title="Help"
      zIndex={999999}
    >
      <Stack>{pages[page]}</Stack>
    </Drawer>
  );
}
