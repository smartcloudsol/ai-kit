import { Anchor, Code, Drawer, List, Stack, Text, Title } from "@mantine/core";
import { useEffect, useRef } from "react";
import classes from "./main.module.css";

const pages = {
  general: (
    <>
      <Title order={2}>AI-Kit settings</Title>
      <Text>
        This sidebar explains the options available on the AI-Kit admin screen.
        Click the <strong>info</strong> icon next to any field to jump to its
        description here.
      </Text>
      <Title order={3} mt="md" id="shared-context">
        <span className="highlightable">Shared context</span>
      </Title>
      <Text>
        Optional. A global piece of context that AI-Kit sends along with your AI
        requests. Use it to enforce your preferred style and constraints across
        the whole site.
      </Text>
      <Text mt="xs">
        <strong>Language tip:</strong> write this either in your site’s frontend
        language or in English. If you generate content in multiple languages
        (for example with Write, Rewrite, or SEO metadata), keep the shared
        context in <strong>English</strong> to stay consistent across languages
        and avoid confusing the model.
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          Example: <Code>Write in a friendly, concise tone. Avoid hype.</Code>
        </List.Item>
        <List.Item>
          Example: <Code>Use British English and our brand terminology.</Code>
        </List.Item>
      </List>
      <Title order={3} mt="md" id="default-output-language">
        <span className="highlightable">Default output language</span>
      </Title>
      <Text>
        Sets the preferred language for AI-generated text (where applicable). If
        you don’t change it, AI-Kit defaults to <strong>English</strong>. This
        is useful on multilingual sites, or when the browser/back-end can’t
        reliably infer what language the output should be.
      </Text>{" "}
      <Title order={3} mt="md" id="recaptcha-site-key">
        <span className="highlightable">Google reCAPTCHA (v3) site key</span>
      </Title>
      <Text>
        Optional. Adds bot protection for AI-triggered actions (for example
        operations initiated from the editor UI). Create a v3 key in Google
        reCAPTCHA or reCAPTCHA Enterprise and paste the <em>site key</em> here.
      </Text>
      <Title order={3} mt="md" id="use-recaptcha-enterprise">
        <span className="highlightable">Use reCAPTCHA Enterprise</span>
      </Title>
      <Text>
        Enable this if your site key was generated in{" "}
        <Anchor
          href="https://console.cloud.google.com/security/recaptcha"
          target="_blank"
          rel="noreferrer"
        >
          reCAPTCHA Enterprise
        </Anchor>
        . Leave it off for classic reCAPTCHA v3.
      </Text>
      <Title order={3} mt="md" id="use-recaptcha-net">
        <span className="highlightable">Use recaptcha.net</span>
      </Title>
      <Text>
        When enabled, the reCAPTCHA script is loaded from{" "}
        <Code>recaptcha.net</Code> instead of <Code>google.com</Code>. This is
        useful in regions where <Code>google.com</Code> may be blocked.
      </Text>
      <Title order={3} mt="md" id="recaptcha-chat-ttl-seconds">
        <span className="highlightable">
          reCAPTCHA chat verification window (seconds)
        </span>
      </Title>
      <Text>
        Optimizes multi-turn chats (for example a chatbot conversation). After a
        successful reCAPTCHA verification, AI-Kit will reuse that result for a
        short time window and won’t request/verify new reCAPTCHA tokens on every
        message.
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          Default: <Code>120</Code> seconds.
        </List.Item>
        <List.Item>
          Set to <Code>0</Code> to disable the window (verify every message).
        </List.Item>
        <List.Item>
          Range: <Code>0</Code>–<Code>3600</Code> seconds.
        </List.Item>
      </List>
      <Title order={3} mt="md" id="hide-powered-by-ai-kit">
        <span className="highlightable">Hide “Powered by AI-Kit”</span>
      </Title>
      <Text>
        Controls whether AI-Kit shows a small attribution link in places where
        AI-Kit renders UI (where applicable). You can hide it for a cleaner
        appearance.
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
        <span className="highlightable">Chat title</span>
      </Title>
      <Text>
        The title shown at the top of the chat modal. If empty, the default
        localized title is used.
      </Text>

      <Title order={3} mt="md" id="chatbot-placeholder">
        <span className="highlightable">Placeholder</span>
      </Title>
      <Text>
        The placeholder text in the message input. Keep it short, as it appears
        in a compact area.
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

      <Title order={3} mt="md" id="chatbot-max-images">
        <span className="highlightable">Max images</span>
      </Title>
      <Text>
        Limits how many images a user can attach in a single message. Set to 0
        to effectively disable image uploads.
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
        <span className="highlightable">KB Sources List</span>
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
        <span className="highlightable">Metadata Configuration</span>
      </Title>
      <Text>
        The <strong>KB Configuration</strong> section allows you to manage the
        metadata schema used by all KB documents. This includes:
      </Text>
      <List size="sm" spacing="xs" mt="xs" withPadding>
        <List.Item>
          <strong>Categories and Subcategories:</strong> Hierarchical
          classification for documents
        </List.Item>
        <List.Item>
          <strong>Tags:</strong> Flat taxonomy for cross-cutting topics
        </List.Item>
        <List.Item>
          <strong>YAML format:</strong> The configuration is stored as YAML in
          S3 for easy editing
        </List.Item>
      </List>
      <Text mt="xs">
        You can edit the metadata configuration directly in the Monaco editor.
        Click the <strong>Compare</strong> button to see a diff between your
        current configuration and the metadata derived from all enabled KB
        sources. This helps you keep the taxonomy in sync with your actual
        content.
      </Text>

      <Title order={3} mt="md" id="kb-config-prompts">
        <span className="highlightable">Prompt Templates</span>
      </Title>
      <Text>
        Prompt templates control how the backend processes KB queries and
        generates responses. Each template is a markdown-formatted prompt with
        placeholders and instructions for AI models.
      </Text>
      <Text mt="xs">
        Templates are stored in S3 and loaded at runtime by the backend. Changes
        take effect immediately after saving.
      </Text>

      <Title order={4} mt="md">
        <strong>Retrieval Templates (RAG Pipeline):</strong>
      </Title>

      <Text mt="xs">
        <strong>QUERY template:</strong> The model uses this to build the KB
        retrieval query. It analyzes the user&apos;s question and selects
        relevant categories, subcategories, and tags for metadata filtering.
        Output must be JSON format (query, categories, subCategories, tags).
      </Text>

      <Text mt="xs">
        <strong>RERANK template:</strong> Used to rerank KB retrieval results.
        Semantically evaluates which passages are most relevant to the
        user&apos;s question, enabling more accurate answers. Output must be
        JSON format with passage IDs and scores.
      </Text>

      <Text mt="xs">
        <strong>SUMMARY template:</strong> When conversation history grows too
        long, this template summarizes previous messages and context so the
        model can remember prior conversation without reprocessing every old
        message.
      </Text>

      <Title order={4} mt="md">
        <strong>Answer Templates (Chatbot Mode):</strong>
      </Title>

      <Text mt="xs">
        <strong>ANSWER template:</strong> Default answer template in Chatbot
        mode when KB retrieval returned one or more snippets. The assistant must
        answer using the retrieved snippets/shared context according to the
        effective grounding policy.
      </Text>

      <Text mt="xs">
        <strong>ANSWER-AMBIGUOUS-SOURCES template:</strong> Used when the KB
        query/filter step indicates multiple similarly relevant top-level
        categories. The assistant must ask exactly one short clarification
        question (no answer yet) to disambiguate which category the user needs.
      </Text>

      <Text mt="xs">
        <strong>ANSWER-KB-ONLY template:</strong> Used when grounding is
        required and fallback without KB is not allowed (requiresGrounding
        &amp;&amp; !allowFallbackWithoutKb). The assistant explicitly states
        that the documentation does not contain the requested information and
        does not fall back to general knowledge.
      </Text>

      <Text mt="xs">
        <strong>ANSWER-ASK-WHEN-NO-KB template:</strong> Used when grounding is
        not required, but fallback without KB is not allowed (!requiresGrounding
        &amp;&amp; !allowFallbackWithoutKb). The assistant asks clarifying
        questions instead of guessing or using general knowledge.
      </Text>

      <Text mt="xs">
        <strong>ANSWER-KB-PREFERRED template:</strong> Used when grounding is
        not required and fallback without KB is allowed (!requiresGrounding
        &amp;&amp; allowFallbackWithoutKb). The assistant may answer from
        general knowledge, clearly labeled as not found in docs.
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
        <strong>Note:</strong> The backend automatically selects the appropriate
        answer template based on retrieval results and the category grounding
        policy defined in metadata-config.yaml. Chatbot mode uses ANSWER when
        snippets are found, and switches to fallback templates (AMBIGUOUS,
        KB-ONLY, ASK-WHEN-NO-KB, KB-PREFERRED) when retrieval returns no
        snippets or needs disambiguation.
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
  page: keyof typeof pages;
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
