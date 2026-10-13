<?php
declare(strict_types=1);

require __DIR__ . '/structured-content.test.php';

use SmartCloud\WPSuite\AiKit\KnowledgeBase\KnowledgeSyncStructuredContent as Structured;

$leaf = static fn(string $type, string $description = 'Registered data'): array => ['type' => $type, 'description' => $description];
$closed = static fn(array $properties): array => ['type' => 'object', 'additionalProperties' => false, 'properties' => $properties];
$catalog_registration = $closed([
    'heading' => $leaf('string'),
    'groups' => ['type' => 'array', 'items' => $closed([
        'label' => $leaf('string'),
        'entries' => ['type' => 'array', 'items' => $closed([
            'amount' => ['type' => 'number'],
            'currency' => $leaf('string'),
            'available' => $leaf('boolean'),
            'destination' => $leaf('string'),
            'secret_token' => $leaf('string'),
            'write_only' => ['type' => 'string', 'writeOnly' => true],
            'apiToken' => $leaf('string'),
            'internalWriteOnly' => ['type' => 'string', 'writeOnly' => true],
        ])],
    ])],
    'password' => $leaf('string'),
    'write_only' => ['type' => 'string', 'writeOnly' => true],
]);
$GLOBALS['structured_registered']['post']['catalog_field'] = [
    'single' => true, 'type' => 'object', 'description' => 'Registered own catalog',
    'show_in_rest' => ['schema' => $catalog_registration],
];
$discover = static function (): array {
    return array_column(array_filter(Structured::candidates('post'), static fn(array $candidate): bool => isset($candidate['sourceMetaKey'])), null, 'sourceMetaKey');
};
$candidate = $discover()['catalog_field'];
expect($candidate['type'] === 'object' && $candidate['properties'] instanceof stdClass, 'Nested candidates expose explicit JSON object schemas.');
expect(!isset($candidate['properties']->password, $candidate['properties']->write_only), 'Top-level secret and write-only children are never selectable.');
$entry_schema = $candidate['properties']->groups['items']['properties']->entries['items']['properties'];
expect(!isset($entry_schema->secret_token, $entry_schema->write_only), 'Secret and write-only filtering applies recursively inside list items.');
expect(!isset($entry_schema->apiToken, $entry_schema->internalWriteOnly), 'Secret/write-only registration names are excluded even when their spelling is not an allowed output key.');
expect($entry_schema->amount['description'] === 'Registered amount field.', 'Missing child descriptions have bounded registration-derived guidance.');
$field = json_decode(json_encode($candidate), true);
$field['targetKey'] = 'catalog_data';
$field['description'] = 'Authored public catalog structure';
$policy = ['enabled' => true, 'fields' => [$field]];
expect(Structured::requiresDocumentV2($policy) && !Structured::requiresDocumentV2($selection), 'Only nested selections require document-v2 capability.');
$normalized = Structured::normalizePolicy('post', $policy, true);
$expected = ['groups' => [['entries' => [['amount' => 0, 'available' => false, 'currency' => 'EUR', 'destination' => 'https://example.org/info']], 'label' => 'Group']], 'heading' => 'Catalog'];
$source = ['heading' => 'Catalog', 'groups' => [['label' => 'Group', 'entries' => [[
    'amount' => 0, 'currency' => 'EUR', 'available' => false, 'destination' => 'https://example.org/info',
    'secret_token' => 'never-export', 'write_only' => 'never-export',
    'apiToken' => 'never-export', 'internalWriteOnly' => 'never-export', 'unused-name' => 'never-export',
]]]], 'password' => 'never-export', 'write_only' => 'never-export'];
$source['unselected'] = new class implements JsonSerializable {
    public function jsonSerialize(): mixed { throw new RuntimeException('Unselected serialization hooks must never execute.'); }
};
$GLOBALS['structured_values'][42]['catalog_field'] = $source;
$GLOBALS['structured_reads'] = [];
$projection = Structured::project(42, 'post', $policy);
expect($projection['schemaVersion'] === 2 && $projection['fields']->catalog_data instanceof stdClass, 'Nested own data emits inner schema 2 and native JSON maps.');
expect(json_decode(json_encode($projection['fields']->catalog_data), true) === $expected, 'Nested map/list projection preserves zero, boolean false and exact typed values.');
expect(strpos(json_encode($projection), 'never-export') === false && $GLOBALS['structured_reads'] === [[42, 'catalog_field']], 'Only one approved own metadata source is read, and excluded children never serialize.');
expect(!str_contains(json_encode($projection['fieldSchema']), 'additionalProperties'), 'Wire schemas contain only the shared contract keys.');

// A selected schema may narrow readable registered properties and string URLs, not widen them.
$narrow = $field;
unset($narrow['properties']['heading'], $narrow['properties']['groups']['items']['properties']['label']);
$narrow['properties']['groups']['items']['properties']['entries']['items']['properties']['destination']['type'] = 'url';
$narrow_policy = ['enabled' => true, 'fields' => [$narrow]];
$narrowed = Structured::project(42, 'post', $narrow_policy);
expect(!isset($narrowed['fields']->catalog_data->heading, $narrowed['fields']->catalog_data->groups[0]->label), 'Unselected registered children are withheld recursively.');
foreach ([
    ['unknown', $leaf('string')], ['secret_token', $leaf('string')], ['write_only', $leaf('string')], ['amount', $leaf('boolean')],
] as [$name, $schema]) {
    $bad = $field;
    $bad['properties']['groups']['items']['properties']['entries']['items']['properties'][$name] = $schema;
    structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$bad]], true), 'policy');
}
$retained_extra = ['sourceMetaKey' => 'number_field', 'targetKey' => 'other_data', 'type' => 'number', 'description' => 'Other data'];
$previous = Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$narrow, $retained_extra]], true);
$next = Structured::normalizePolicy('post', $narrow_policy, true);
expect(Structured::isFieldRemoval($previous, $next), 'An exact nested retained schema remains a pure removal.');
$broadened = Structured::normalizePolicy('post', $policy, true);
expect(!Structured::isFieldRemoval($previous, $broadened), 'Removing one field while adding nested children cannot bypass capability approval.');
$changed_items = $narrow;
$changed_items['properties']['groups']['items']['description'] = 'Changed authored meaning';
expect(!Structured::isFieldRemoval($previous, Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$changed_items]], true)), 'Array-item meaning edits cannot masquerade as pure removal.');

$GLOBALS['structured_test_capability'] = ['status' => 'verified', 'version' => 1];
structured_reject(fn() => $policies->saveForPostType('post', ['enabled' => true, 'reviewPolicy' => 'wordpress-publish-is-approval', 'structuredContent' => $policy]), 'policy');
$GLOBALS['structured_test_capability']['documentVersion'] = 1;
expect($policies->saveForPostType('post', ['enabled' => true, 'reviewPolicy' => 'wordpress-publish-is-approval', 'structuredContent' => $policy])['structuredContent'] === $normalized, 'Document-v2 capability permits newly selected nested fields.');

foreach ([null, '0', true, [0 => 'not-an-object'], new ArrayObject($source), new class implements JsonSerializable {
    public function jsonSerialize(): mixed { throw new RuntimeException('Custom serialization must never execute.'); }
}] as $bad) {
    $GLOBALS['structured_values'][42]['catalog_field'] = $bad;
    structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_value_invalid');
}
foreach ([['amount' => '0'], ['amount' => 9007199254740992], ['amount' => INF], ['amount' => NAN],
    ['available' => '1'], ['available' => 0], ['currency' => null], ['currency' => str_repeat('x', 4097)]] as $replacement) {
    $bad = $source;
    $bad['groups'][0]['entries'][0] = array_replace($bad['groups'][0]['entries'][0], $replacement);
    $GLOBALS['structured_values'][42]['catalog_field'] = $bad;
    structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_value_invalid');
}
foreach ([[1 => $source['groups'][0]], array_fill(0, 65, $source['groups'][0]), (object) $source['groups'], [null]] as $bad_groups) {
    $GLOBALS['structured_values'][42]['catalog_field'] = array_replace($source, ['groups' => $bad_groups]);
    structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_value_invalid');
}
foreach (['constructor', '__proto__', 'prototype', 9] as $bad_key) {
    $GLOBALS['structured_values'][42]['catalog_field'] = array_replace($source, [$bad_key => 'invalid key']);
    structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_value_invalid');
}
$GLOBALS['structured_values'][42]['catalog_field'] = (object) ['groups' => [], 'heading' => 'Catalog'];
expect(json_encode(Structured::project(42, 'post', $policy)['fields']->catalog_data) === '{"groups":[],"heading":"Catalog"}', 'Plain stdClass inputs preserve empty lists as lists.');
$GLOBALS['structured_values'][42]['catalog_field'] = [];
expect(json_encode(Structured::project(42, 'post', $policy)['fields']->catalog_data) === '{}', 'An empty WordPress associative value becomes an empty JSON object.');
$GLOBALS['structured_values'][42]['catalog_field'] = new stdClass();
expect(json_encode(Structured::project(42, 'post', $policy)['fields']->catalog_data) === '{}', 'An empty stdClass remains an empty JSON object.');

$deep = $leaf('string');
for ($i = 0; $i < 7; $i++) { $deep = ['type' => 'array', 'description' => 'Nested list', 'items' => $deep]; }
expect(Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [array_merge(['sourceMetaKey' => 'catalog_field', 'targetKey' => 'deep_data'], $deep)]])['enabled'], 'Depth-eight selected schemas remain valid.');
$deep = ['type' => 'array', 'description' => 'One level too deep', 'items' => $deep];
$deep_field = array_merge(['sourceMetaKey' => 'catalog_field', 'targetKey' => 'deep_data'], $deep);
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$deep_field]]), 'policy');
$many_properties = [];
for ($i = 0; $i < 33; $i++) { $many_properties['value_' . $i] = $leaf('number'); }
$wide_field = array_replace($field, ['properties' => $many_properties]);
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => [$wide_field]]), 'policy');
$many_schema_fields = [];
for ($i = 0; $i < 5; $i++) {
    $many_schema_fields[] = ['sourceMetaKey' => 'field_' . $i, 'targetKey' => 'value_' . $i, 'type' => 'object', 'description' => 'Bounded object', 'properties' => array_slice($many_properties, 0, 26)];
}
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => $many_schema_fields]), 'policy');
$at_limit = [];
for ($i = 0; $i < 4; $i++) {
    $at_limit[] = ['sourceMetaKey' => 'field_' . $i, 'targetKey' => 'value_' . $i, 'type' => 'object', 'description' => 'Bounded object', 'properties' => array_slice($many_properties, 0, 31)];
}
expect(count(Structured::normalizePolicy('post', ['enabled' => true, 'fields' => $at_limit])['fields']) === 4, 'Exactly 128 selected schema nodes are accepted.');
$at_limit[] = ['sourceMetaKey' => 'extra_field', 'targetKey' => 'extra_value', 'type' => 'string', 'description' => 'One node too many'];
structured_reject(fn() => Structured::normalizePolicy('post', ['enabled' => true, 'fields' => $at_limit]), 'policy');
$GLOBALS['structured_values'][42]['catalog_field'] = ['groups' => array_fill(0, 64, ['entries' => array_fill(0, 64, ['amount' => 0])])];
structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_value_invalid');
$GLOBALS['structured_values'][42]['catalog_field'] = ['groups' => [['entries' => array_fill(0, 20, ['currency' => str_repeat('x', 4096)])]]];
structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_too_large');
$GLOBALS['structured_values'][42]['catalog_field'] = ['groups' => [['entries' => array_fill(0, 3, ['currency' => str_repeat('x', 4096)])]]];
expect(strlen(json_encode(Structured::project(42, 'post', $policy))) > Structured::MAX_PAYLOAD_BYTES, 'Nested documents may exceed the legacy 8KiB budget while staying within 64KiB.');
$GLOBALS['structured_registered']['post']['matrix_field'] = ['single' => true, 'type' => 'array',
    'show_in_rest' => ['schema' => ['type' => 'array', 'items' => ['type' => 'array', 'items' => ['type' => 'string']]]]];
$matrix_field = json_decode(json_encode($discover()['matrix_field']), true);
$matrix_field['targetKey'] = 'matrix_data';
$matrix_policy = ['enabled' => true, 'fields' => [$matrix_field]];
$matrix = array_fill(0, 64, array_fill(0, 31, ''));
$matrix[63] = array_fill(0, 30, '');
$GLOBALS['structured_values'][42]['matrix_field'] = $matrix;
expect(Structured::project(42, 'post', $matrix_policy)['schemaVersion'] === 2, 'Exactly 2048 selected value nodes are accepted.');
$matrix[63][] = '';
$GLOBALS['structured_values'][42]['matrix_field'] = $matrix;
structured_reject(fn() => Structured::project(42, 'post', $matrix_policy), 'structured_content_value_invalid');
$cycle = new stdClass();
$cycle->heading = $cycle;
$GLOBALS['structured_values'][42]['catalog_field'] = $cycle;
structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_value_invalid');
$array_cycle = [];
$array_cycle['heading'] = &$array_cycle;
$GLOBALS['structured_values'][42]['catalog_field'] = $array_cycle;
structured_reject(fn() => Structured::project(42, 'post', $policy), 'structured_content_value_invalid');

// Discovery cannot infer an allowlist from an open, untyped or unsupported registration.
foreach ([['type' => 'object', 'properties' => ['value' => $leaf('string')]],
    ['type' => 'object', 'additionalProperties' => true, 'properties' => ['value' => $leaf('string')]],
    ['type' => 'array'], ['type' => 'array', 'items' => ['type' => ['string', 'null']]],
    $closed(['unsupported' => ['type' => 'object']]), $closed(['unsupported' => ['type' => 'string', 'oneOf' => []]]),
] as $unsupported) {
    $GLOBALS['structured_registered']['post']['unsupported_field'] = ['single' => true, 'type' => $unsupported['type'], 'show_in_rest' => ['schema' => $unsupported]];
    expect(!isset($discover()['unsupported_field']), 'Open, untyped or ambiguous registered schemas are not offered.');
}
$GLOBALS['structured_registered']['post']['empty_map'] = ['single' => true, 'type' => 'object', 'show_in_rest' => ['schema' => $closed([])]];
$empty_field = json_decode(json_encode($discover()['empty_map']), true);
$empty_field['targetKey'] = 'empty_data';
$GLOBALS['structured_values'][42]['empty_map'] = new stdClass();
$empty_projection = Structured::project(42, 'post', ['enabled' => true, 'fields' => [$empty_field]]);
expect(json_encode($empty_projection['fieldSchema']->empty_data['properties']) === '{}', 'Even empty selected property schemas encode as maps, not lists.');
$revocation = Structured::project(42, 'post', ['enabled' => false, 'fields' => [$field]]);
expect($revocation['schemaVersion'] === 1 && json_encode($revocation['fields']) === '{}' && json_encode($revocation['fieldSchema']) === '{}', 'Nested disable emits backward-compatible empty v1 revocation.');

echo "Nested registered schema discovery, exact projection, capability and structural-bound tests passed.\n";
