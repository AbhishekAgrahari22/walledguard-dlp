'use strict';

// DevTools' "via-inspector" stylesheet applies response color even when an
// individual website's CSP rejects a dynamically appended <style> element.
// Restrict it to assistant-specific containers, never arbitrary page text.
const ASSISTANT_ROOTS = Object.freeze([
  '[data-message-author-role="assistant"]',
  'article[data-turn="assistant"]',
  'section[data-turn="assistant"]',
  '[data-conversation-role="assistant"]',
  '[data-testid="assistant-message"]',
  '.agent-turn',
  '[data-workflow-final-text]',
  '[data-testid="answer"]',
  '[data-testid="answer-content"]',
  '[data-testid="perplexity-answer"]',
  '[data-testid="assistant"]',
  '[data-renderer="lm"]',
  '.walledguard-ai-response'
]);
const TEXT_ELEMENTS = 'p,li,span,strong,em,b,i,h1,h2,h3,h4,h5,h6,a,pre,code,blockquote,td,th,div,mark,small,label,summary,dl,dt,dd';
const BLUE_RESPONSE_CSS = `${ASSISTANT_ROOTS.flatMap(selector => [selector, `${selector} :is(${TEXT_ELEMENTS})`]).join(',\n')} { color: #1263d6 !important; -webkit-text-fill-color: #1263d6 !important; }`;

module.exports = { ASSISTANT_ROOTS, BLUE_RESPONSE_CSS };
