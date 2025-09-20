// Lightweight description formatter for item detail overlay.
// Rules:
// - Lines starting with '>': bold block (without the '>').
// - Lines starting with '**': italic block (without the '**').
// - Lines starting with a single '*' (but not '**'): small italic note.
// - Consecutive lines starting with '- ' form a bullet list.
// - URLs (http/https) are linkified.
// - Blank lines create paragraph breaks.
// Returns an array of React elements ready to render.
import React from 'react';
import { decodeEntities } from '@/lib/format';

function linkify(text) {
  const parts = [];
  const urlRegex = /(https?:\/\/[^\s)]+)([),.]?)/gi;
  let lastIndex = 0;
  let m;
  while ((m = urlRegex.exec(text)) !== null) {
    if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
    const url = m[1];
    const trailing = m[2] || '';
    parts.push(
      <a
        key={parts.length + url}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-dotted underline-offset-2 hover:text-blue-600 dark:hover:text-blue-400"
      >{url}</a>
    );
    if (trailing) parts.push(trailing);
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length ? parts : [text];
}

export default function formatDescription(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const text = decodeEntities(raw).replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const out = [];
  let bufferBullets = [];
  const flushBullets = () => {
    if (!bufferBullets.length) return;
    if (bufferBullets.length >= 2) {
      out.push(
        <ul key={out.length + '-ul'} className="mb-2 list-disc pl-5 space-y-1 text-sm text-gray-700 dark:text-gray-300 marker:text-gray-500 dark:marker:text-gray-400">
          {bufferBullets.map((li, i) => <li key={i}>{linkify(li)}</li>)}
        </ul>
      );
    } else {
      // Single leading "- " line: treat as a normal paragraph to avoid unintended bullets
      const only = bufferBullets[0] || '';
      out.push(
        <p key={out.length + '-p-single-bullet'} className="mb-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
          {linkify('- ' + only)}
        </p>
      );
    }
    bufferBullets = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const lineOrig = lines[i];
    const line = lineOrig.trimEnd();
    if (!line.trim()) { // blank line -> paragraph break
      flushBullets();
      continue;
    }
    if (line.startsWith('- ')) {
      bufferBullets.push(line.slice(2).trim());
      continue;
    }
    flushBullets();

    if (line.startsWith('>')) {
      const content = line.replace(/^>\s?/, '').trim();
      out.push(
        <p key={out.length + '-quote'} className="mb-2 font-semibold text-gray-900 dark:text-gray-100">
          {linkify(content)}
        </p>
      );
      continue;
    }
    if (line.startsWith('**') && line.length > 2 && !line.startsWith('***')) {
      const content = line.slice(2).trim();
      out.push(
        <p key={out.length + '-italic-2'} className="mb-2 italic text-gray-800 dark:text-gray-200">
          {linkify(content)}
        </p>
      );
      continue;
    }
    if (line.startsWith('*') && !line.startsWith('**')) {
      const content = line.slice(1).trim();
      out.push(
        <p key={out.length + '-note'} className="mb-2 italic text-xs text-gray-600 dark:text-gray-400">
          {linkify(content)}
        </p>
      );
      continue;
    }

    // Default paragraph line: we may want to merge consecutive plain lines into one paragraph unless blank lines separate them
    // For simplicity, treat each as its own paragraph unless next line is continuation (no blank between). We'll merge sequential plain lines.
    let para = line;
    while (i + 1 < lines.length && lines[i + 1] && !/^\s*$/.test(lines[i + 1]) && !/^(>|\*\*|\*|-\s)/.test(lines[i + 1])) {
      para += ' ' + lines[i + 1].trim();
      i++;
    }
    out.push(
      <p key={out.length + '-p'} className="mb-2 text-sm leading-relaxed text-gray-700 dark:text-gray-300">
        {linkify(para)}
      </p>
    );
  }
  flushBullets();
  if (!out.length) return null;
  // Remove trailing margin of last block via last:mb-0 utility wrapper
  return <div className="formatted-description [&>*:last-child]:mb-0">{out}</div>;
}
