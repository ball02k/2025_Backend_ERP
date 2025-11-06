/**
 * Template Rendering Utility
 *
 * Provides simple variable substitution for email templates and other text templates.
 * Supports dot notation for nested properties (e.g., {{project.name}}).
 *
 * Example:
 *   const ctx = { supplier: { name: 'ACME Corp' }, rfx: { title: 'Q4 Project' } };
 *   renderTemplate('Hello {{supplier.name}}, regarding {{rfx.title}}', ctx);
 *   // => 'Hello ACME Corp, regarding Q4 Project'
 */

/**
 * Render a template string by replacing {{variable}} placeholders with values from context.
 *
 * @param {string} str - Template string with {{placeholders}}
 * @param {object} ctx - Context object with values for substitution
 * @returns {string} - Rendered string with variables replaced
 *
 * @example
 * renderTemplate('Dear {{contact.firstName}}, your link: {{link}}', {
 *   contact: { firstName: 'John' },
 *   link: 'https://example.com/respond/abc123'
 * });
 * // => 'Dear John, your link: https://example.com/respond/abc123'
 */
function renderTemplate(str, ctx) {
  // Handle null/undefined input
  if (str == null) return '';

  // Convert to string if not already
  const template = String(str);

  // Replace all {{variable}} or {{nested.path}} patterns
  return template.replace(/\{\{\s*([\w\.]+)\s*\}\}/g, (match, path) => {
    // Split path by dots for nested access
    const parts = path.split('.');
    let val = ctx;

    // Navigate through nested properties
    for (const p of parts) {
      if (val && Object.prototype.hasOwnProperty.call(val, p)) {
        val = val[p];
      } else {
        // Property doesn't exist, return empty string
        val = null;
        break;
      }
    }

    // Return the value or empty string if null/undefined
    return val == null ? '' : String(val);
  });
}

module.exports = { renderTemplate };
