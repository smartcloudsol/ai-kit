<?php
declare(strict_types=1);

function metadata_check(bool $condition, string $message): void {
    if (!$condition) { throw new RuntimeException($message); }
}
function metadata_length(string $text): int {
    return function_exists('mb_strlen') ? mb_strlen($text, 'UTF-8') : preg_match_all('/./us', $text);
}
foreach (array('ai-kit', 'gatey') as $plugin) {
    $readme = file_get_contents(__DIR__ . '/../../' . $plugin . '/readme.txt');
    metadata_check(is_string($readme), $plugin . ': readme must be readable.');
    $notices = explode('== Upgrade Notice ==', $readme, 2)[1] ?? '';
    preg_match_all('/^= ([^\n]+) =\n([\s\S]*?)(?=\n= |$)/m', $notices, $matches, PREG_SET_ORDER);
    metadata_check(count($matches) > 0, $plugin . ': upgrade notices must remain available.');
    foreach ($matches as $match) {
        metadata_check(metadata_length(trim($match[2])) <= 300, $plugin . ' ' . $match[1] . ': upgrade notice exceeds 300 characters.');
    }
    if ($plugin === 'ai-kit') {
        $changelog = explode('== Upgrade Notice ==', explode('== Changelog ==', $readme, 2)[1], 2)[0];
        metadata_check(metadata_length(trim($changelog)) <= 5000, 'AI Kit: changelog must fit WordPress.org display limits.');
        metadata_check(str_contains($changelog, 'https://github.com/smartcloudsol/ai-kit/blob/main/CHANGELOG-HISTORY.md'), 'AI Kit: full historical guidance must remain discoverable.');
    }
}
$history = file_get_contents(__DIR__ . '/../CHANGELOG-HISTORY.md');
metadata_check(is_string($history) && str_contains($history, '= 1.5.9 =') && str_contains($history, '= 1.0.0 ='), 'AI Kit: older changelog entries must remain archived.');
metadata_check(str_contains($history, 'a source workspace ID is not an AWS account ID') && str_contains($history, 'Remote field removal or disabling is confirmed only after backend acknowledgment.'), 'AI Kit: detailed upgrade safety guidance must remain archived.');
echo "WordPress.org readme metadata limits: PASS\n";
