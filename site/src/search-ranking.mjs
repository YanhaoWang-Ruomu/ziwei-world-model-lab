// Matching uses a separate folded copy; source text is never rewritten.
export function queryParts(query, normalize) {
  const q = normalize(query);
  const tokens = [...new Set(String(query).trim().split(/[\s,，、;；]+/u).map(normalize).filter(Boolean))].slice(0, 8);
  const chars = [...new Set(Array.from(q))];
  const letters = Array.from(q), pairs = [...new Set(letters.slice(1).map((c, i) => letters[i] + c))];
  const sample = values => values.length <= 32 ? values : Array.from({length:32}, (_, i) => values[Math.floor(i * (values.length - 1) / 31)]);
  return {q, tokens, chars:sample(chars), pairs:sample(pairs), fuzzy:letters.length >= 3 && chars.length >= 3};
}

export function rankText(text, query, normalize, {similar = true} = {}) {
  const parts = typeof query === 'string' ? queryParts(query, normalize) : query;
  const value = normalize(text);
  if (!parts.q || !value) return 0;
  if (value.includes(parts.q)) return 100;
  if (parts.tokens.length > 1 && parts.tokens.every(t => value.includes(t))) return 94;
  if (!similar || !parts.fuzzy) return 0;
  const coverage = values => values.filter(t => value.includes(t)).length / Math.max(1, values.length);
  const score = Math.round(89 * (.65 * coverage(parts.pairs) + .35 * coverage(parts.chars)));
  return score >= 55 ? score : 0;
}

export function matchLabel(score) {
  return score >= 100 ? '全文匹配' : score === 97 ? '书名匹配' : score >= 94 ? '关键词组合' : '近似文字';
}

export function bestSnippet(text, query, normalize, limit = 150) {
  if (!query.trim()) return String(text || '').slice(0, limit);
  const original = String(text || ''), parts = queryParts(query, normalize);
  // Overlapping windows find a near match even in articles without line breaks.
  let best = {score:0, start:0};
  for (let i = 0; i < original.length; i += 70) {
    const score = rankText(original.slice(i, i + Math.max(limit, parts.q.length + 20)), parts, normalize);
    if (score > best.score) best = {score, start:i};
    if (score === 100) break;
  }
  return (best.start ? '…' : '') + original.slice(best.start, best.start + limit) + (best.start + limit < original.length ? '…' : '');
}

// Identical scoring in SQL keeps pagination globally ordered, without downloading
// the library into a browser or discarding lower-ranked pages via a candidate cap.
export function rankingSql(parts, similar, field = 'searchable') {
  if (!parts.q) return {sql:'0', args:[]};
  const args = [parts.q];
  let sql = `CASE WHEN instr(${field},?)>0 THEN 100`;
  if (parts.tokens.length > 1) {
    sql += ' WHEN ' + parts.tokens.map(() => `instr(${field},?)>0`).join(' AND ') + ' THEN 94';
    args.push(...parts.tokens);
  }
  if (similar && parts.fuzzy) {
    const terms = values => '(' + values.map(() => `(instr(${field},?)>0)`).join('+') + ')';
    sql += ` ELSE ROUND(89*(0.65*${terms(parts.pairs)}/${parts.pairs.length}+0.35*${terms(parts.chars)}/${parts.chars.length})) END`;
    args.push(...parts.pairs, ...parts.chars);
  } else sql += ' ELSE 0 END';
  return {sql, args};
}
