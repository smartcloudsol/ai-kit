<?php

declare(strict_types=1);

// Exercise the real local-only storage implementation without real credentials.
$fixture = sys_get_temp_dir() . '/aikit-file-store-' . bin2hex(random_bytes(8));
mkdir($fixture, 0700);
mkdir($fixture . '/webroot', 0700);
mkdir($fixture . '/keys', 0700);
define('ABSPATH', $fixture . '/webroot/');
define('SMARTCLOUD_AI_KIT_KB_SYNC_KEY_DIRECTORY', $fixture . '/keys');
require_once __DIR__ . '/../admin/php/kb/knowledge-sync-transport.php';

use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncFilePrivateKeyStore;

function file_store_expect(bool $value, string $message): void
{
    if (!$value) { throw new RuntimeException($message); }
}

try {
    $store = new KnowledgeSyncFilePrivateKeyStore(7);
    $other = new KnowledgeSyncFilePrivateKeyStore(8);
    file_store_expect($store->readCurrent() === null && $store->readPending() === null, 'An empty store must not fabricate a key.');
    $store->writePending('fixture-first-not-a-private-key');
    file_store_expect($store->readPending() === 'fixture-first-not-a-private-key', 'Pending fixture contents must round-trip exactly.');
    file_store_expect($other->readPending() === null, 'Blog identity must isolate each local key path.');
    clearstatcache();
    file_store_expect((fileperms($fixture . '/keys/knowledge-sync-blog-7.pending.pem') & 0777) === 0600, 'Pending key publication must be owner-only.');
    $store->promotePending();
    file_store_expect($store->readCurrent() === 'fixture-first-not-a-private-key' && $store->readPending() === null, 'Promotion must atomically consume the pending path.');
    $store->writePending('fixture-second-not-a-private-key');
    $store->promotePending();
    file_store_expect($store->readCurrent() === 'fixture-second-not-a-private-key', 'Rotation must publish the new exact contents.');
    clearstatcache();
    file_store_expect((fileperms($fixture . '/keys/knowledge-sync-blog-7.pem') & 0777) === 0600, 'Promoted key must remain owner-only.');
    file_store_expect(count(glob($fixture . '/keys/*')) === 1, 'Rotation must leave no temporary PEM or backup behind.');
    $store->writePending('fixture-rejected-not-a-private-key');
    $rejected = false;
    try { $store->promotePending(function (): void { throw new RuntimeException('Synthetic binding publication failed'); }); }
    catch (RuntimeException $error) { $rejected = true; }
    file_store_expect($rejected && $store->readCurrent() === 'fixture-second-not-a-private-key', 'Failed binding publication must restore the exact previous file key.');
    file_store_expect($store->readPending() === 'fixture-rejected-not-a-private-key', 'The rejected candidate stays pending until explicit caller cleanup.');
    $store->discardPending();
    $store->writePending('fixture-discard-not-a-private-key');
    $store->discardPending();
    file_store_expect($store->readPending() === null && $store->readCurrent() === 'fixture-second-not-a-private-key', 'Discard must retain the enrolled current key.');
    file_put_contents($fixture . '/keys/unrelated.txt', 'owned-by-another-producer');
    $store->deleteAll();
    file_store_expect($store->readCurrent() === null && is_file($fixture . '/keys/unrelated.txt'), 'Removal must target only this blog\'s PEM paths.');
    echo "Knowledge-sync local file-store atomic rotation and permissions: PASS\n";
} finally {
    foreach (glob($fixture . '/keys/*') as $path) { unlink($path); }
    rmdir($fixture . '/keys');
    rmdir($fixture . '/webroot');
    rmdir($fixture);
}
