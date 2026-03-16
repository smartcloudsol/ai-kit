/**
 * AI-Kit KB Source Quick Edit & Bulk Edit
 * Handles KB Source enable/disable in WordPress post list quick edit
 */
(function ($) {
    'use strict';

    if (typeof inlineEditPost === 'undefined') {
        return;
    }

    // Store original edit function
    var wp_inline_edit = inlineEditPost.edit;

    /**
     * Override inlineEditPost.edit to populate KB source field
     */
    inlineEditPost.edit = function (id) {
        // Call original edit function
        wp_inline_edit.apply(this, arguments);

        // Get post ID
        var post_id = 0;
        if (typeof id === 'object') {
            post_id = parseInt(this.getId(id));
        }

        if (post_id > 0) {
            // Get current KB enabled status from hidden field in row
            var $row = $('#post-' + post_id);
            var $kbStatus = $row.find('.aikit-kb-enabled-value');
            var isEnabled = $kbStatus.val() === '1';

            // Set quick edit dropdown to current value
            var $quickEditRow = $('#edit-' + post_id);
            var $select = $quickEditRow.find('.aikit-kb-source-select');

            // Reset to "No Change" but show current state in some way
            // We could add a note or just rely on the column display
            $select.val('');
        }
    };

    /**
     * Bulk Edit: Intercept Update button and use AJAX to update KB sources
     * This ensures reliable operation across different WordPress configurations
     */
    $(document).on('click', '#bulk_edit', function (e) {
        var $bulkRow = $('#bulk-edit');
        var kbAction = $bulkRow.find('.aikit-kb-source-bulk-select').val();

        // If no KB source action selected, let WordPress handle normally
        if (!kbAction || kbAction === '') {
            return;
        }

        // Prevent default WordPress bulk edit for KB source field
        // We'll handle it with AJAX instead
        e.preventDefault();

        // Get selected post IDs
        var post_ids = [];
        $bulkRow.find('#bulk-titles .ntdelbutton').each(function () {
            var id = $(this).attr('id');
            if (id) {
                id = id.replace(/^_/, '').replace(/_$/, '');
                if (id && !isNaN(id)) {
                    post_ids.push(parseInt(id));
                }
            }
        });

        if (post_ids.length === 0) {
            alert('No posts selected');
            return;
        }

        // Show loading indicator
        var $button = $(this);
        var originalText = $button.val();
        $button.val('Updating KB Sources...').prop('disabled', true);

        // Send AJAX request
        $.ajax({
            url: aikitKBQuickEdit.ajaxUrl,
            type: 'POST',
            data: {
                action: 'smartcloud_ai_kit_bulk_edit_kb_source',
                nonce: aikitKBQuickEdit.nonce,
                post_ids: post_ids,
                kb_action: kbAction
            },
            success: function (response) {
                if (response.success) {
                    // Show success message
                    var message = response.data.message;
                    if (response.data.errors && response.data.errors.length > 0) {
                        message += '\n\nErrors:\n' + response.data.errors.join('\n');
                    }

                    // Reload the page to show updated status
                    window.location.reload();
                } else {
                    alert('Error: ' + (response.data.message || 'Unknown error'));
                    $button.val(originalText).prop('disabled', false);
                }
            },
            error: function (xhr, status, error) {
                alert('AJAX error: ' + error);
                $button.val(originalText).prop('disabled', false);
            }
        });
    });

    /**
     * Add inline status indicator update after row action
     * (Optional enhancement - updates the column display immediately)
     */
    $(document).on('change', '.aikit-kb-source-select', function () {
        var $select = $(this);
        var newValue = $select.val();
        var $row = $select.closest('tr');

        if (newValue === 'enable') {
            $row.find('.aikit-kb-status').html(
                '<span style="color: #46b450; font-weight: 600;">✓ ' +
                aikitKBQuickEdit.enabledText +
                '</span>'
            );
        } else if (newValue === 'disable') {
            $row.find('.aikit-kb-status').html(
                '<span style="color: #999;">—</span>'
            );
        }
    });
})(jQuery);
