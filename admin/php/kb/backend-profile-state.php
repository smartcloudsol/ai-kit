<?php
/** Backend-only state isolation. Shared WordPress content remains unmodified. */
namespace SmartCloud\WPSuite\AiKit\KnowledgeBase;

if (!defined('ABSPATH')) { exit; }

final class BackendProfileState
{
    public static function context(): ?array
    {
        $context = function_exists('apply_filters') ? apply_filters('smartcloud_wpsuite_backend_profile_context', null) : null;
        if (!is_array($context) || ($context['enabled'] ?? false) !== true) return null;
        if (!is_int($context['bindingRevision'] ?? null) || $context['bindingRevision'] < 1
            || !in_array($context['id'] ?? '', ['production', 'development'], true)
            || !in_array($context['namespace'] ?? null, ['', 'production', 'development'], true)
            || ($context['namespace'] !== '' && $context['namespace'] !== $context['id'])) {
            throw new \RuntimeException('Invalid backend profile context.');
        }
        return $context;
    }

    public static function optionName(string $name): string
    {
        $context = self::context();
        return $context === null || $context['namespace'] === '' ? $name : 'wpsuite-profile/' . $context['id'] . '/' . $name;
    }

    /** Browser form identity includes the selection generation; queued jobs deliberately do not. */
    public static function requestContextJson(): string
    {
        $context = self::context();
        return $context === null ? '' : json_encode(['id' => $context['id'], 'generation' => $context['generation'],
            'bindingRevision' => $context['bindingRevision']], JSON_THROW_ON_ERROR);
    }

    /** Reuse the Hub's atomic REST lease for these plugin-owned classic/AJAX mutations. */
    public static function assertClassicMutation(bool $explicit = false): void
    {
        if (self::context() === null) return;
        if (!$explicit && ((!function_exists('is_admin') || !is_admin()) || !isset($_SERVER['REQUEST_METHOD'])
            || (defined('REST_REQUEST') && REST_REQUEST) || (defined('WP_CLI') && WP_CLI)
            || (function_exists('wp_doing_cron') && wp_doing_cron()))) return;
        $payload = $_POST['smartcloud_ai_kit_backend_profile'] ?? $_GET['smartcloud_ai_kit_backend_profile'] ?? '';
        $tuple = [];
        if (is_string($payload) && strlen($payload) <= 1024) {
            $decoded = json_decode(function_exists('wp_unslash') ? wp_unslash($payload) : $payload, true);
            if (is_array($decoded)) $tuple = $decoded;
        }
        $manager = '\\SmartCloud\\WPSuite\\Hub\\BackendProfiles';
        $result = null;
        if (class_exists($manager) && class_exists('\\WP_REST_Request') && is_callable([$manager, 'guardRequest'])) {
            $request = new \WP_REST_Request('POST', '/smartcloud-ai-kit/v1/kb-classic-mutation');
            foreach (['Profile' => 'id', 'Generation' => 'generation', 'Binding-Revision' => 'bindingRevision'] as $suffix => $field) {
                $header = 'X-WPSuite-Backend-' . $suffix;
                $serverKey = 'HTTP_' . strtoupper(str_replace('-', '_', $header));
                $value = $_SERVER[$serverKey] ?? $tuple[$field] ?? '';
                $request->set_header($header, is_string($value) || is_int($value) ? (string) $value : '');
            }
            $result = $manager::guardRequest(null, null, $request);
            if ($result === null) return;
        }
        $message = 'The backend profile changed or is missing. Reload this page before saving.';
        if (function_exists('wp_doing_ajax') && wp_doing_ajax()) wp_send_json_error(['message' => $message, 'code' => 'backend_profile_changed'], 409);
        wp_die($message, '', ['response' => 409]);
    }

    public static function tablePrefix(): string
    {
        global $wpdb;
        $context = self::context();
        $suffix = $context === null || $context['namespace'] === '' ? '' : ($context['id'] === 'production' ? 'bp_p_' : 'bp_d_');
        $prefix = $wpdb->prefix . 'smartcloud_ai_kit_' . $suffix;
        if (strlen($prefix . 'kb_sync_release_cursors') > 64) throw new \RuntimeException('Knowledge table prefix exceeds the database limit.');
        return $prefix;
    }

    public static function table(string $suffix): string
    {
        if (!preg_match('/^kb_[a-z_]+$/D', $suffix)) throw new \InvalidArgumentException('Invalid knowledge table.');
        $table = self::tablePrefix() . $suffix;
        if (strlen($table) > 64) throw new \RuntimeException('Knowledge table name exceeds the database limit.');
        return $table;
    }

    public static function fileSuffix(): string
    {
        $context = self::context();
        return $context === null || $context['namespace'] === '' ? '' : '-profile-' . $context['id'];
    }

    /** Stable cron identity: switching away/back does not create duplicate schedules. */
    public static function capture(): ?array
    {
        $context = self::context();
        return $context === null ? null : ['id' => $context['id'], 'bindingRevision' => (int) ($context['bindingRevision'] ?? 0)];
    }

    public static function cronArgs(): array
    {
        $context = self::capture();
        return $context === null ? [] : [$context];
    }

    /** Old argless jobs belong to the original state owner, never the active destination. */
    public static function runScheduled(?array $captured, callable $callback): mixed
    {
        $manager = '\\SmartCloud\\WPSuite\\Hub\\BackendProfiles';
        if ($captured === null && self::context() === null) return $callback();
        if (!class_exists($manager) || !is_callable([$manager, 'runWithContext'])) {
            throw new \RuntimeException('Backend profile job context is unavailable.');
        }
        if ($captured === null) {
            if (!is_callable([$manager, 'legacyContext'])) throw new \RuntimeException('Legacy job owner is unavailable.');
            $captured = $manager::legacyContext();
            if (!is_array($captured)) throw new \RuntimeException('Legacy job owner is unavailable.');
        }
        return $manager::runWithContext($captured, $callback);
    }
}
