<?php

declare(strict_types=1);

// Supply an installed WordPress fixture root as argv[1]. No database connection
// or credentials are needed: the real wpdb::prepare algorithm remains intact.
$wordpress = $argv[1] ?? '';
if (!is_file($wordpress . '/wp-includes/class-wpdb.php')) {
    fwrite(STDERR, "Usage: php knowledge-sync-sql-prepare.test.php <wordpress-fixture-root>\n");
    exit(1);
}
define('ABSPATH', $wordpress . '/');
require_once $wordpress . '/wp-includes/class-wpdb.php';
require_once __DIR__ . '/../admin/php/kb/knowledge-sync.php';

function current_time(string $kind, bool $gmt = false): string { return '2026-10-12 10:00:00'; }
function sanitize_key(string $value): string { return preg_replace('/[^a-z0-9_-]/', '', strtolower($value)); }
function sql_prepare_expect(bool $value, string $message): void { if (!$value) { throw new RuntimeException($message); } }
function _doing_it_wrong(mixed ...$arguments): void { throw new RuntimeException('wpdb::prepare rejected placeholder alignment.'); }
function __(string $text, string $domain = ''): string { return $text; }

final class KnowledgeSyncRealPrepareFixture extends wpdb
{
    public array $sql = array();
    public function __construct() { $this->prefix = 'wp_'; }
    // Override only connection-dependent escaping and execution, NOT prepare.
    public function _real_escape($value) { return addslashes((string) $value); }
    public function add_placeholder_escape($query) { return $query; }
    public function get_col($query = null, $x = 0) { $this->sql[] = $query; return array(11, 29); }
    public function query($query) { $this->sql[] = $query; return 2; }
    public function get_results($query = null, $output = OBJECT) { $this->sql[] = $query; return array(); }
    public function get_var($query = null, $x = 0, $y = 0) { $this->sql[] = $query; return 1; }
}

$wpdb = new KnowledgeSyncRealPrepareFixture();
$repository = new SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncOutboxRepository();
foreach (array(false, true) as $gate) {
    $wpdb->sql = array();
    $repository->claimBatch(25, 300, "lease'owner", 7, 'post', $gate);
    sql_prepare_expect(count($wpdb->sql) === 3, 'Claim must select, conditionally update, and read back the won IDs.');
    [$select, $update, $readback] = $wpdb->sql;
    sql_prepare_expect(str_contains($select, 'o.blog_id = 7') && str_contains($select, "o.post_type = 'post'") && str_contains($select, 'LIMIT 25'), 'Scoped selection values must bind in the correct order.');
    sql_prepare_expect(str_contains($update, 'o.id IN (11, 29)') && str_contains($update, "lease_owner = 'lease\\'owner'"), 'Lease values and all selected IDs must bind before the gate identifier.');
    foreach (array($select, $update, $readback) as $sql) {
        sql_prepare_expect(!preg_match('/%[ids]/', $sql), 'No unresolved placeholder may reach the database executor.');
        sql_prepare_expect(str_contains($sql, '`wp_smartcloud_ai_kit_kb_sync_outbox`'), 'Owned queue identifiers must be escaped by wpdb %i.');
    }
    foreach (array($select, $update) as $sql) {
        sql_prepare_expect(str_contains($sql, '`wp_smartcloud_ai_kit_kb_sync_release_cursors`') === $gate, 'Release cursor table must be escaped and present only when gating is enabled.');
    }
    $repository->leaseIsCurrentAndEligible(11, "lease'owner", $gate);
    $eligibility = end($wpdb->sql);
    sql_prepare_expect(str_contains($eligibility, 'o.id = 11') && str_contains($eligibility, "o.lease_owner = 'lease\\'owner'"), 'Last-moment eligibility must bind the exact lease identity.');
    sql_prepare_expect(str_contains($eligibility, '`wp_smartcloud_ai_kit_kb_sync_release_cursors`') === $gate && !preg_match('/%[ids]/', $eligibility), 'Eligibility must bind the optional cursor identifier after the lease values.');
}
$repository->releaseGateWaitingCount();
$waiting = end($wpdb->sql);
sql_prepare_expect(str_contains($waiting, '`wp_smartcloud_ai_kit_kb_sync_release_cursors`') && !preg_match('/%[ids]/', $waiting), 'Waiting aggregate must prepare both table identifiers.');
echo "Knowledge-sync real WordPress SQL preparation and gate ordering: PASS\n";
