// The judging rule shared by the static check (lib/literals.mjs) and the render audit (lib/render-audit.mjs).
// `judge` must not reference outer variables: the render audit sends it into the browser with toString().

// Is the value made of tokens only? Returns a reason string when it is not, otherwise null.
// names: defined token names. allowed: values allowed without a token, per category.
export function judge(prop, raw, names, allowed) {
  const SPACING = /^(padding|margin)(-(top|right|bottom|left|block|inline)(-(start|end))?)?$|^(gap|row-gap|column-gap)$/;
  const RADIUS = /^border(-(top|bottom|start|end)-(left|right|start|end))?-radius$/;
  const TYPE = /^(font-size|font-weight|line-height|letter-spacing|font)$/;
  const COLOR = /^(color|background|background-color|background-image|border|border-(top|right|bottom|left|block|inline)(-(start|end))?(-color)?|border-color|border-(block|inline)-color|outline|outline-color|fill|stroke|box-shadow|text-shadow|text-decoration|text-decoration-color|caret-color|accent-color|column-rule|column-rule-color)$/;
  const GLOBAL = ['inherit', 'initial', 'unset', 'revert', 'revert-layer'];
  const ALLOWED = allowed || { spacing: ['0', 'auto'], radius: ['0', '50%', '999px'], 'line-height': ['1'], 'letter-spacing': ['0'] };
  // Words in color properties that are not colors (border styles, shadow keywords, ...)
  const NON_COLOR_WORDS = ['none', 'hidden', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset', 'thin', 'medium', 'thick', 'transparent', 'currentcolor', 'underline', 'overline', 'line-through', 'wavy', 'no-repeat', 'repeat', 'center', 'top', 'bottom', 'left', 'right', 'cover', 'contain', 'url', 'T', 'to', 'at', 'circle', 'ellipse', 'closest-side', 'farthest-corner'];
  const known = new Set(names);
  const v = String(raw).replace(/!important/gi, '').trim();
  const cat = SPACING.test(prop) ? 'spacing' : RADIUS.test(prop) ? 'radius' : TYPE.test(prop) ? 'type' : COLOR.test(prop) ? 'color' : prop.startsWith('--') ? 'local' : null;
  if (!cat) return null;
  if (GLOBAL.includes(v.toLowerCase())) return null;

  // var(): the name must be defined; a fallback value follows the same rule
  let rest = v, m;
  const VAR = /var\(\s*(--[\w-]+)\s*(?:,\s*((?:[^()]|\([^()]*\))*))?\)/;
  while ((m = rest.match(VAR))) {
    if (!known.has(m[1])) return `undefined token ${m[1]}`;
    if (m[2] !== undefined && m[2].trim()) {
      const inner = judge(prop.startsWith('--') ? '--x' : prop, m[2].trim(), names, allowed);
      if (inner) return `literal in var() fallback (${inner})`;
    }
    rest = rest.slice(0, m.index) + ' T ' + rest.slice(m.index + m[0].length);
  }
  rest = rest.replace(/url\([^)]*\)/g, ' url ');

  const atoms = rest.match(/[a-z-]+\(|[()*/+,]|-?[\d.]+[a-z%]*|#[0-9a-f]+|[a-z_][\w-]*|\S/gi) || [];
  const isNum = (a) => /^-?[\d.]+[a-z%]*$/i.test(a);
  // A unitless number inside calc() is allowed only when it multiplies or divides a token directly
  const multiplier = (i) => (['*', '/'].includes(atoms[i - 1]) && atoms[i - 2] === 'T') || (atoms[i + 1] === '*' && atoms[i + 2] === 'T');
  let depth = 0;
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i], low = a.toLowerCase();
    if (a.endsWith('(') && cat === 'color' && /^(repeating-)?(linear|radial|conic)-gradient\($/i.test(a)) { depth++; continue; }
    if (a.endsWith('(')) { if (!/^(calc|min|max|clamp)\($/i.test(a)) { if (cat === 'color' || cat === 'local') return 'color literal'; return 'literal function'; } depth++; continue; }
    if (a === ')') { depth--; continue; }
    if (['*', '/', '+', ',', 'T', 'url'].includes(a) || a === '-') continue;
    if (/^#/.test(a)) return 'color literal';
    if (isNum(a)) {
      if (depth > 0 && /^-?[\d.]+$/.test(a) && multiplier(i)) continue;
      if (cat === 'color') continue; // border width, shadow offsets: only the color is judged
      if (cat !== 'local' && (ALLOWED[cat] || ALLOWED[prop] || []).includes(low)) continue;
      // zero is zero in any unit (the browser reports 0 as 0px)
      if (parseFloat(a) === 0 && (cat === 'spacing' || cat === 'radius' || prop === 'letter-spacing')) continue;
      return depth > 0 ? 'literal in calc()' : cat === 'local' ? 'literal in a local token' : 'literal';
    }
    if (cat === 'color') { if (!NON_COLOR_WORDS.includes(low) && !GLOBAL.includes(low)) return 'color literal'; continue; }
    if (cat === 'local') return 'literal in a local token';
    if (GLOBAL.includes(low)) continue;
    if ((ALLOWED[cat] || ALLOWED[prop] || []).includes(low)) continue;
    return 'literal';
  }
  return null;
}
