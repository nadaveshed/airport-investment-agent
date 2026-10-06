import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** The model answers in markdown; it is sanitized before it reaches the DOM. */
export function renderMarkdown(text: string): string {
  return DOMPurify.sanitize(marked.parse(text, { async: false }));
}

/** Plain text for speech, so tables and bold markers aren't read aloud. */
export function markdownToText(text: string): string {
  return new DOMParser().parseFromString(renderMarkdown(text), 'text/html').body.textContent ?? '';
}
