import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('');
const domPurify = DOMPurify(window);

export function sanitizeHtml(html: string): string {
  return domPurify.sanitize(html);
}
