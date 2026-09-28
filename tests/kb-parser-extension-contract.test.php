<?php

declare(strict_types=1);

$source = file_get_contents(__DIR__ . '/../admin/php/kb/parser.php');
if (!is_string($source)) {
    throw new RuntimeException('KB parser source is not readable.');
}

$sync_runtime = file_get_contents(__DIR__ . '/../admin/php/kb/knowledge-sync-runtime.php');
if (!is_string($sync_runtime) || !str_contains($sync_runtime, "'smartcloud_ai_kit_knowledge_sync_markdown'")) {
    throw new RuntimeException('The durable knowledge-sync projection is missing its dynamic markdown boundary.');
}
if (!str_contains($sync_runtime, '(new EffectiveContentRenderer())->render($post)')) {
    throw new RuntimeException('The durable knowledge-sync projection does not render effective public content.');
}

foreach (
    array(
        "'smartcloud_ai_kit_kb_section_markdown'",
        "'smartcloud_ai_kit_kb_referenced_post_ids'",
        "array_map('absint'",
        '$section[\'origin_hash\'] = $this->calculateOriginHash($section);',
    ) as $required
) {
    if (!str_contains($source, $required)) {
        throw new RuntimeException('Missing dynamic KB extension boundary: ' . $required);
    }
}

if (substr_count($source, '$this->content_renderer->render($post)') < 2) {
    throw new RuntimeException('Simple block and classic KB parsing must use effective public content.');
}

$markdown_filter = strpos($source, "'smartcloud_ai_kit_kb_section_markdown'");
$rehash = strpos($source, '$section[\'origin_hash\'] = $this->calculateOriginHash($section);');
if (false === $markdown_filter || false === $rehash || $rehash <= $markdown_filter) {
    throw new RuntimeException('The parser must recalculate origin hashes after dynamic markdown filtering.');
}

echo "KB parser extension contract tests passed.\n";
