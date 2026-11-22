// Fast drop-in for csv-reader 1.0.0 (make.fun's reference CSV reader).
//
// run(input) returns exactly what csv-reader 1.0.0 returns for {text, header}:
// {columns, rows, errors} — but it reads the text with regex/indexOf scans and
// slice/split instead of one character at a time.
//
// Semantics (mirroring the reference, char for char):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (error stray_cr);
//   - a field opening with a quote runs to the next quote that is not doubled
//     ("" inside it is one quote; each CRLF or lone CR inside it reads as LF);
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk, when the field ends); a quote that
//     never closes is a literal character and the text after it is read again
//     as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it (every record when header is false), each padded with ""
//     (short_row, with fields: its field count) or cut (long_row, with extra:
//     the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met; line is the 1-based
//     line its record starts on, row its record's index in rows (null for the
//     header).

const COMMA = 44; // ','
const LF = 10; // '\n'
const CR = 13; // '\r'
const QUOTE = 34; // '"'
const BOM = 0xfeff;

/** How a field ended. */
const ENDED_COMMA = 0;
const ENDED_BREAK = 1;
const ENDED_END = 2;

// One forward scan for the next delimiter of an unquoted field, and one for
// the next character that can end a quote-free line. A single regex scan
// stops at the nearest of the set, where separate indexOf calls would each
// run to the next occurrence of their own character (or the end of the text).
const DELIM = /[,\r\n]/g;
const SPECIAL = /["\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === BOM) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` up to the next comma or line break:
  // a CR not followed by LF is dropped (stray_cr). Returns {value, ended, added}
  // where `added` counts the characters kept (for the quote_junk check).
  function readUnquoted(value) {
    const base = value.length;
    let start = pos;
    for (;;) {
      DELIM.lastIndex = start;
      const m = DELIM.exec(text);
      if (m === null) {
        if (start < n) value += text.slice(start);
        pos = n;
        return { value, ended: ENDED_END, added: value.length - base };
      }
      const i = m.index;
      const ch = text.charCodeAt(i);
      if (ch === COMMA) {
        if (i > start) value += text.slice(start, i);
        pos = i + 1;
        return { value, ended: ENDED_COMMA, added: value.length - base };
      }
      if (ch === LF) {
        if (i > start) value += text.slice(start, i);
        pos = i + 1;
        line += 1;
        return { value, ended: ENDED_BREAK, added: value.length - base };
      }
      // CR: a line break when followed by LF, else a stray CR that is dropped.
      if (i + 1 < n && text.charCodeAt(i + 1) === LF) {
        if (i > start) value += text.slice(start, i);
        pos = i + 2;
        line += 1;
        return { value, ended: ENDED_BREAK, added: value.length - base };
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (i > start) value += text.slice(start, i);
      start = i + 1;
    }
  }

  // Appends text[s..q) to `value`, reading each CRLF or lone CR inside it as one
  // LF and counting every LF, CRLF and lone CR as a line. The common case (no
  // line break inside) is a plain slice.
  function appendSegment(value, s, q) {
    SPECIAL.lastIndex = s;
    const m = SPECIAL.exec(text);
    if (m !== null && m.index < q) return appendSegmentSlow(value, s, q);
    return value + text.slice(s, q);
  }

  function appendSegmentSlow(value, s, q) {
    const seg = text.slice(s, q);
    // One line per LF, CRLF and lone CR: a CRLF counts once, not twice.
    let count = 0;
    for (let i = 0; i < seg.length; i++) {
      const c = seg.charCodeAt(i);
      if (c === CR) {
        count += 1;
        if (seg.charCodeAt(i + 1) === LF) i += 1;
      } else if (c === LF) {
        count += 1;
      }
    }
    line += count;
    return value + seg.replace(/\r\n?/g, '\n');
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let s = pos + 1;
    for (;;) {
      const q = text.indexOf('"', s);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after
        // it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      if (q + 1 < n && text.charCodeAt(q + 1) === QUOTE) {
        // A doubled quote: one quote in the value, and the field goes on.
        value = appendSegment(value, s, q);
        value += '"';
        s = q + 2;
        continue;
      }
      // The closing quote.
      value = appendSegment(value, s, q);
      pos = q + 1;
      if (pos >= n) return { value, ended: ENDED_END, added: 0 };
      const c = text.charCodeAt(pos);
      if (c === COMMA) {
        pos += 1;
        return { value, ended: ENDED_COMMA, added: 0 };
      }
      if (c === LF) {
        pos += 1;
        line += 1;
        return { value, ended: ENDED_BREAK, added: 0 };
      }
      if (c === CR && pos + 1 < n && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
        return { value, ended: ENDED_BREAK, added: 0 };
      }
      // What follows the closing quote is appended as it stands, up to the next
      // comma or line break.
      const junk = readUnquoted(value);
      if (junk.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return junk;
    }
  }

  // Finishes one record's fields: width, short/long rows, header.
  function finishRecord(fields, quoted) {
    if (fields.length === 1 && fields[0] === '' && !quoted) return; // a line left with no characters
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && pos + 1 < n && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: this line holds no quote and no stray CR, so the record is
    // the line split on commas. The first quote, CR or LF at or after pos
    // decides: LF ends the line, a CR followed by LF is the CRLF break, and
    // anything else sends the record to the general reader.
    SPECIAL.lastIndex = pos;
    const sp = SPECIAL.exec(text);
    if (sp === null) {
      // No quote, CR or LF left: the rest of the text is one last record.
      finishRecord(text.slice(pos).split(','), false);
      pos = n;
      continue;
    }
    const si = sp.index;
    const sc = text.charCodeAt(si);
    if (sc === LF) {
      finishRecord(text.slice(pos, si).split(','), false);
      pos = si + 1;
      line += 1;
      continue;
    }
    if (sc === CR && si + 1 < n && text.charCodeAt(si + 1) === LF) {
      finishRecord(text.slice(pos, si).split(','), false);
      pos = si + 2;
      line += 1;
      continue;
    }

    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === QUOTE;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === ENDED_COMMA);
    finishRecord(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
