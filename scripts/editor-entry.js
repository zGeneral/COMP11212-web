// scripts/editor-entry.js — entry point for the CodeMirror 6 editor bundle.
//
// Bundled by scripts/build-editor.mjs into static/editor-bundle.js. Exposes
// a small API on window.CMEditor that editor.js consumes.

import { EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  drawSelection,
  dropCursor,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import {
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  defaultHighlightStyle,
} from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// ─────────────────────────────────────────────────────────────────────────────
// While stream parser
// ─────────────────────────────────────────────────────────────────────────────

const KEYWORDS = new Set([
  'while', 'do', 'if', 'then', 'else', 'skip',
]);
const ATOMS = new Set(['tt', 'ff']);

const whileLanguage = StreamLanguage.define({
  name: 'while',
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null;

    // multi-char operators
    if (stream.match(':=')) return 'definitionOperator';
    if (stream.match('<=')) return 'compareOperator';

    // single-char punctuation / operators
    const ch = stream.peek();
    if (ch === ';') { stream.next(); return 'punctuation'; }
    if (ch === '(' || ch === ')') { stream.next(); return 'paren'; }
    if (ch === ',') { stream.next(); return 'punctuation'; }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') { stream.next(); return 'arithmeticOperator'; }
    if (ch === '=') { stream.next(); return 'compareOperator'; }
    if (ch === '!' || ch === '&' || ch === '|') { stream.next(); return 'logicOperator'; }

    // numbers
    if (stream.match(/^\d+/)) return 'number';

    // identifiers / keywords / atoms
    if (stream.match(/^[a-zA-Z_][a-zA-Z0-9_]*/)) {
      const word = stream.current();
      if (KEYWORDS.has(word)) return 'keyword';
      if (ATOMS.has(word)) return 'atom';
      return 'variableName';
    }

    stream.next();
    return null;
  },
  tokenTable: {
    definitionOperator: t.definitionOperator,
    compareOperator:    t.compareOperator,
    arithmeticOperator: t.arithmeticOperator,
    logicOperator:      t.logicOperator,
    keyword:            t.keyword,
    atom:               t.atom,
    number:             t.number,
    variableName:       t.variableName,
    punctuation:        t.punctuation,
    paren:              t.paren,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// IDE-flavoured highlight theme — matches the trace pane palette so the
// editor and the trace look like the same language.
// ─────────────────────────────────────────────────────────────────────────────

const whileHighlight = HighlightStyle.define([
  { tag: t.keyword,            color: '#1565c0', fontWeight: '600' },
  { tag: t.atom,               color: '#5e35b1', fontWeight: '600' },
  { tag: t.number,             color: '#00838f' },
  { tag: t.variableName,       color: '#1a1a1a', fontStyle: 'italic' },
  { tag: t.definitionOperator, color: '#d32f2f', fontWeight: '600' },
  { tag: t.compareOperator,    color: '#b85c00' },
  { tag: t.arithmeticOperator, color: '#b85c00' },
  { tag: t.logicOperator,      color: '#b85c00' },
  { tag: t.paren,              color: '#888' },
  { tag: t.punctuation,        color: '#888' },
]);

const editorTheme = EditorView.theme({
  '&': {
    fontSize: '14px',
    height: '100%',
    backgroundColor: 'transparent',
  },
  '.cm-content': {
    fontFamily: '"Cascadia Mono", "JetBrains Mono", "Fira Code", "Consolas", monospace',
    padding: '10px 0',
    minHeight: '240px',
    caretColor: '#1565c0',
  },
  '.cm-gutters': {
    backgroundColor: '#f5f5f5',
    color: '#9e9e9e',
    border: 'none',
    borderRight: '1px solid #e0e0e0',
  },
  '.cm-activeLine':       { backgroundColor: 'rgba(21, 101, 192, 0.05)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(21, 101, 192, 0.1)' },
  '.cm-selectionMatch':   { backgroundColor: '#fff59d' },
  '.cm-cursor':           { borderLeftColor: '#1565c0' },
  '.cm-scroller':         { overflow: 'auto' },
  '.cm-matchingBracket':  { color: '#d32f2f', fontWeight: 'bold' },
});

// ─────────────────────────────────────────────────────────────────────────────
// Public API: window.CMEditor
// ─────────────────────────────────────────────────────────────────────────────

function create(parent, initialDoc, onChange) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: initialDoc || '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        history(),
        bracketMatching(),
        indentOnInput(),
        drawSelection(),
        dropCursor(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        whileLanguage,
        syntaxHighlighting(whileHighlight),
        syntaxHighlighting(defaultHighlightStyle),
        editorTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged && onChange) {
            onChange(view.state.doc.toString());
          }
        }),
      ],
    }),
  });
  return view;
}

function getValue(view) {
  return view ? view.state.doc.toString() : '';
}

function setValue(view, value) {
  if (!view) return;
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value || '' },
  });
}

function focus(view) {
  if (view) view.focus();
}

window.CMEditor = { create, getValue, setValue, focus };
