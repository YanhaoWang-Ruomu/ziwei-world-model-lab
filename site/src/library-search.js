(function (root) {
  // Query normalization is deliberately separate from the preserved quotations.
  const OpenCC = typeof module !== 'undefined' && module.exports ? require('opencc-js') : root.OpenCC;
  const convert = OpenCC.Converter({from:'t',to:'cn'});

  function normalize(text) {
    return convert(String(text).normalize('NFKC').toLowerCase()).replace(/[\p{P}\p{S}\s]/gu, '');
  }

  function sourceMatch(record, source, query) {
    const normalized = normalize(query);
    if (!normalized) return null;
    const quote = normalize(source.quote);
    if (quote.includes(normalized)) {
      const literal = source.quote.includes(query.trim());
      return { score: 100, label: literal ? '原文命中' : '简繁 / 标点匹配' };
    }
    const fields = [source.section, source.bookTitle, record.title, ...record.keywords].map(normalize);
    if (fields.some(field => field.includes(normalized))) return { score: 80, label: '关键词相关' };
    if (record.queryAliases.some(alias => normalize(alias) === normalized)) return { score: 75, label: '近似表述' };
    const tokens = query.trim().split(/[\s,，、;；]+/u).filter(Boolean).map(normalize).filter(Boolean);
    if (tokens.length > 1 && tokens.every(token => quote.includes(token) || fields.some(field => field.includes(token)))) {
      return { score: 65, label: '关键词组合' };
    }
    return null;
  }

  function search(records, query, book = 'all') {
    // Punctuation alone must never act as an all-records wildcard.
    const empty = !query.trim();
    if (!empty && !normalize(query)) return [];
    return records.flatMap(record => {
      const matches = record.sources
        .filter(source => book === 'all' || source.bookId === book)
        .map(source => ({ source, match: empty ? { score: 0, label: '已收录引文' } : sourceMatch(record, source, query) }))
        .filter(item => item.match)
        .sort((a, b) => b.match.score - a.match.score);
      if (!matches.length) return [];
      return [{ record, source: matches[0].source, sources: matches.map(item => item.source), ...matches[0].match }];
    }).sort((a, b) => b.score - a.score);
  }

  function citation(record, source) {
    return `《${source.bookTitle}》｜${source.section}｜PDF 第 ${source.pdfPage} 页\n${source.quote}\n校核：AI 对照原图，待人工验收。引文保留原字、未加标点。`;
  }

  const api = { normalize, search, citation };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ZiweiBookSearch = api;
})(typeof window === 'undefined' ? globalThis : window);
