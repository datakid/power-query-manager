(function () {
  const UI = window.UI;
  const MKW = new Set(['and', 'as', 'each', 'else', 'error', 'false', 'if', 'in', 'is', 'let', 'meta', 'not', 'null', 'or', 'otherwise', 'section', 'shared', 'then', 'true', 'try', 'type', 'catch', 'optional', 'nullable']);
  const MHASH = new Set(['#binary', '#date', '#datetime', '#datetimezone', '#duration', '#infinity', '#nan', '#sections', '#shared', '#table', '#time']);
  const VKW = new Set(['sub', 'function', 'end', 'dim', 'if', 'then', 'else', 'elseif', 'for', 'each', 'next', 'to', 'step', 'do', 'loop', 'while', 'wend', 'until', 'with', 'select', 'case', 'private', 'public', 'friend', 'static', 'const', 'as', 'new', 'set', 'let', 'get', 'property', 'byval', 'byref', 'optional', 'paramarray', 'exit', 'goto', 'gosub', 'return', 'on', 'error', 'resume', 'call', 'redim', 'preserve', 'option', 'explicit', 'compare', 'base', 'type', 'enum', 'implements', 'event', 'raiseevent', 'withevents', 'nothing', 'true', 'false', 'empty', 'null', 'and', 'or', 'not', 'xor', 'is', 'like', 'mod', 'me', 'integer', 'long', 'string', 'boolean', 'double', 'single', 'variant', 'object', 'date', 'currency', 'byte', 'longlong', 'longptr', 'declare', 'lib', 'alias', 'ptrsafe', 'in', 'stop', 'debug', 'attribute', 'global', 'typeof', 'addressof', 'erase', 'open', 'close', 'print', 'input', 'output', 'append', 'binary', 'random', 'line', 'write', 'kill']);

  function span(cls, text) {
    if (!cls) return document.createTextNode(text);
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    return s;
  }

  function lexMLine(line, state, out) {
    let i = 0;
    const n = line.length;
    let buf = '';
    const flush = () => { if (buf) { out.push(span(null, buf)); buf = ''; } };
    while (i < n) {
      if (state === 'comment') {
        const j = line.indexOf('*/', i);
        const end = j < 0 ? n : j + 2;
        out.push(span('tk-com', line.slice(i, end)));
        i = end;
        if (j >= 0) state = 'code';
        continue;
      }
      if (state === 'str' || state === 'qid') {
        let j = i;
        while (j < n) { if (line[j] === '"') { if (line[j + 1] === '"') { j += 2; continue; } j++; state = 'code'; break; } j++; }
        out.push(span(state === 'qid' || (state === 'code' && line.lastIndexOf('#"', i) >= 0 && false) ? 'tk-qid' : (out._q ? 'tk-qid' : 'tk-str'), line.slice(i, j)));
        if (state === 'code') out._q = false;
        i = j;
        continue;
      }
      const c = line[i];
      if (c === '/' && line[i + 1] === '/') { flush(); out.push(span('tk-com', line.slice(i))); break; }
      if (c === '/' && line[i + 1] === '*') { flush(); state = 'comment'; continue; }
      if (c === '"') { flush(); let j = i + 1; let closed = false; while (j < n) { if (line[j] === '"') { if (line[j + 1] === '"') { j += 2; continue; } j++; closed = true; break; } j++; } out.push(span('tk-str', line.slice(i, j))); if (!closed) { state = 'str'; out._q = false; } i = j; continue; }
      if (c === '#' && line[i + 1] === '"') { flush(); let j = i + 2; let closed = false; while (j < n) { if (line[j] === '"') { if (line[j + 1] === '"') { j += 2; continue; } j++; closed = true; break; } j++; } out.push(span('tk-qid', line.slice(i, j))); if (!closed) { state = 'str'; out._q = true; } i = j; continue; }
      if (c === '#') { flush(); let j = i + 1; while (j < n && /[A-Za-z]/.test(line[j])) j++; const w = line.slice(i, j); out.push(span(MHASH.has(w) ? (w === '#date' || w === '#datetime' || w === '#time' || w === '#duration' || w === '#datetimezone' ? 'tk-num' : 'tk-kw') : null, w)); i = j; continue; }
      if (/[0-9]/.test(c)) { flush(); const m = /^(0x[0-9a-fA-F]+|\d+(\.\d+)?([eE][+-]?\d+)?)/.exec(line.slice(i)); out.push(span('tk-num', m[0])); i += m[0].length; continue; }
      if (/[A-Za-z_\u00C0-\uFFFF]/.test(c)) {
        flush();
        const m = /^[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_\u00C0-\uFFFF]*(\.[A-Za-z_\u00C0-\uFFFF][A-Za-z0-9_\u00C0-\uFFFF]*)*/.exec(line.slice(i));
        const w = m[0];
        let cls = null;
        if (MKW.has(w)) cls = 'tk-kw';
        else if (window.M && M.lib && Object.prototype.hasOwnProperty.call(M.lib.table, w)) cls = 'tk-fn';
        else if (/^[A-Z]\w*\.[A-Z]/.test(w)) cls = 'tk-fn';
        out.push(span(cls, w));
        i += w.length;
        continue;
      }
      if ('=<>+-*/&()[]{},;?@!'.includes(c)) { flush(); let j = i + 1; while (j < n && '=<>.?'.includes(line[j]) && j - i < 3) j++; out.push(span('tk-op', line.slice(i, j))); i = j; continue; }
      if (c === '.') { flush(); out.push(span('tk-op', c)); i++; continue; }
      buf += c;
      i++;
    }
    flush();
    return state;
  }

  function lexVLine(line, state, out) {
    let i = 0;
    const n = line.length;
    let buf = '';
    const flush = () => { if (buf) { out.push(span(null, buf)); buf = ''; } };
    while (i < n) {
      const c = line[i];
      if (c === "'") { flush(); out.push(span('tk-com', line.slice(i))); break; }
      if (/^rem(\s|$)/i.test(line.slice(i)) && /^\s*$/.test(line.slice(0, i))) { flush(); out.push(span('tk-com', line.slice(i))); break; }
      if (c === '"') { flush(); let j = i + 1; while (j < n) { if (line[j] === '"') { if (line[j + 1] === '"') { j += 2; continue; } j++; break; } j++; } out.push(span('tk-str', line.slice(i, j))); i = j; continue; }
      if (c === '#' && /^#\d/.test(line.slice(i))) { const j = line.indexOf('#', i + 1); if (j > 0) { flush(); out.push(span('tk-num', line.slice(i, j + 1))); i = j + 1; continue; } }
      if (/[0-9]/.test(c) && !/[A-Za-z_]/.test(line[i - 1] || '')) { flush(); const m = /^(&H[0-9A-Fa-f]+&?|\d+(\.\d+)?([eE][+-]?\d+)?[#!@&%^]?)/.exec(line.slice(i)); out.push(span('tk-num', m[0])); i += m[0].length; continue; }
      if (c === '&' && /^&H/i.test(line.slice(i))) { flush(); const m = /^&H[0-9A-Fa-f]+&?/i.exec(line.slice(i)); out.push(span('tk-num', m[0])); i += m[0].length; continue; }
      if (/[A-Za-z_]/.test(c)) { flush(); const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(line.slice(i)); const w = m[0]; out.push(span(VKW.has(w.toLowerCase()) ? 'tk-kw' : null, w)); i += w.length; continue; }
      if ('=<>+-*/\\&^(),.:'.includes(c)) { flush(); out.push(span('tk-op', c)); i++; continue; }
      buf += c;
      i++;
    }
    flush();
    return state;
  }

  function highlightLines(text, lang) {
    const lines = text.split('\n');
    let state = 'code';
    const lexer = lang === 'vba' ? lexVLine : lexMLine;
    return lines.map(line => {
      const out = [];
      state = lexer(line, state, out);
      return out;
    });
  }

  UI.highlight = { highlightLines, span };
})();
