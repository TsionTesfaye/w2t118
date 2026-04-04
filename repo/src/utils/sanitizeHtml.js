/**
 * Minimal HTML sanitizer for user-generated rich text content.
 * Whitelists a safe subset of formatting tags. Strips all attributes
 * and any tag not in the allowed set. Used before rendering via v-html.
 *
 * Security model:
 *  - DROP_TAGS: entirely removed (tag + all children). Covers script, style,
 *    iframe and other executable/injection vectors.
 *  - Unknown tags not in DROP_TAGS: unwrapped (tag removed, text children kept).
 *  - ALLOWED_TAGS: kept with attribute sanitization.
 *  - Attribute allowlist per tag; all others stripped.
 *  - <a href> checked against javascript: pattern; rel forced to noopener.
 */

/** Tags removed entirely — content is NOT preserved. */
const DROP_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed',
  'noscript', 'form', 'input', 'button', 'select', 'textarea', 'base',
]);

/** Tags kept as-is (after attribute sanitization). */
const ALLOWED_TAGS = new Set(['b', 'i', 'strong', 'em', 'ul', 'ol', 'li', 'p', 'br', 'a']);

/** Per-tag attribute allowlist. Tags not listed here get all attributes stripped. */
const ALLOWED_ATTRS = {
  a: ['href', 'target', 'rel'],
};

/**
 * Returns sanitized HTML string safe for use with v-html.
 * Only allows basic formatting tags; strips all attributes and unknown tags.
 *
 * @param {string} html - Raw HTML string
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return '';
  const container = document.createElement('div');
  container.innerHTML = html;
  _sanitizeNode(container);
  return container.innerHTML;
}

function _sanitizeNode(node) {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;

    const tag = child.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) {
      // Completely remove the element AND its children (no content rescue)
      node.removeChild(child);
      continue;
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown tag: unwrap (preserve text/element children, discard the tag itself)
      while (child.firstChild) {
        node.insertBefore(child.firstChild, child);
      }
      node.removeChild(child);
      continue;
    }

    // Allowed tag — strip attributes down to the per-tag allowlist
    const allowed = ALLOWED_ATTRS[tag] || [];
    Array.from(child.attributes).forEach(attr => {
      if (!allowed.includes(attr.name)) {
        child.removeAttribute(attr.name);
      }
    });

    // Extra enforcement on <a>
    if (tag === 'a') {
      const href = child.getAttribute('href') || '';
      // Block javascript: and data: URIs in href
      if (/^\s*(javascript|data):/i.test(href)) {
        child.removeAttribute('href');
      }
      // Force safe relationship — prevents tab-napping
      child.setAttribute('rel', 'noopener noreferrer');
    }

    _sanitizeNode(child);
  }
}
