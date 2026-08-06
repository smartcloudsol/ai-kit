<?php

declare(strict_types=1);

define('ABSPATH', __DIR__ . '/');

$options = [];
$add_option_calls = 0;

function expect(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function add_option(string $name, mixed $value = '', string $deprecated = '', ?bool $autoload = null): bool
{
    global $options, $add_option_calls;
    $add_option_calls++;

    if (array_key_exists($name, $options)) {
        return false;
    }

    $options[$name] = $value;
    return true;
}

function get_option(string $name, mixed $default = false): mixed
{
    global $options;
    return $options[$name] ?? $default;
}

function delete_option(string $name): bool
{
    global $options;
    $existed = array_key_exists($name, $options);
    unset($options[$name]);
    return $existed;
}

function current_time(string $type): string
{
    return '2026-08-06 12:00:00';
}

require_once __DIR__ . '/../admin/php/kb/review-notice.php';

use SmartCloud\WPSuite\AiKit\KnowledgeBase\ReviewNotice;

expect(ReviewNotice::isPending() === false, 'The notice should initially be absent.');
expect(ReviewNotice::markPending() === true, 'The first transition should create the notice.');
expect(ReviewNotice::isPending() === true, 'The created notice should be pending.');
expect(ReviewNotice::markPending() === false, 'A repeated transition must not create another notice.');
expect($add_option_calls === 2, 'Both creation attempts should use the atomic option operation.');
expect(count($options) === 1, 'Bulk or repeated saves must retain only one notice record.');

ReviewNotice::acknowledge();
expect(ReviewNotice::isPending() === false, 'Acknowledging the notice should clear it.');

expect(ReviewNotice::markPending() === true, 'A later transition may create a new notice after acknowledgement.');
expect(ReviewNotice::isPending() === true, 'The new notice should be pending.');

echo "KB review notice deduplication tests passed.\n";
