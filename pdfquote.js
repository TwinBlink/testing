/* Quotation PDF in the firm's one-page layout.
   Vendor - Freehold RM338k is the measurement source. */
(function (root, factory) {
  const fonts = typeof module === "object" && module.exports ? require("./fonts.js") : root.QuoteFonts;
  const api = factory(fonts);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QuotePdf = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (fonts) {
  const PAGE_W = 595.2;
  const PAGE_H = 841.68;
  const LEFT = 53.2;
  const VALUE_X = 131.5;
  const COL = { excl: 419.3, sst: 477.6, inc: 535.9 };
  const RULE_L = 51.6;
  const RULE_R = 537.6;
  const TOTAL_RULE_L = 362.5;
  const TOTAL_WORD = 344;

  function b64dec(b64) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const FONT = {
    regular: Object.assign({ id: "F1", bytes: b64dec(fonts.regular.b64) }, fonts.regular),
    bold: Object.assign({ id: "F2", bytes: b64dec(fonts.bold.b64) }, fonts.bold),
    italic: Object.assign({ id: "F3", bytes: b64dec(fonts.italic.b64) }, fonts.italic),
  };

  function widthOf(str, key, size) {
    const widths = FONT[key].widths;
    let u = 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      u += c >= 32 && c <= 126 ? widths[c - 32] : widths[0];
    }
    return (u / 1000) * size;
  }

  function fmt(n) {
    if (n == null || !isFinite(Number(n))) return "-";
    const neg = Number(n) < -0.0001;
    const v = Math.abs(Math.round(Number(n) * 100) / 100);
    const parts = v.toFixed(2).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + parts[0] + "." + parts[1];
  }

  function fmtRM(n) {
    if (n == null || !isFinite(Number(n))) return "";
    return "RM" + fmt(n);
  }

  function esc(str) {
    let o = "";
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c === 92 || c === 40 || c === 41) o += "\\" + s.charAt(i);
      else if (c < 32 || c > 126) o += "?";
      else o += s.charAt(i);
    }
    return o;
  }

  function wrap(text, key, size, maxW) {
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const trial = line ? line + " " + w : w;
      if (line && widthOf(trial, key, size) > maxW) {
        lines.push(line);
        line = w;
      } else line = trial;
    });
    if (line) lines.push(line);
    return lines;
  }

  function buildQuotePdf(model) {
    const cmds = [];
    function n(v) {
      return (Math.round(v * 100) / 100).toString();
    }
    function baseline(top, size, key) {
      return PAGE_H - top - (FONT[key].ascent / 1000) * size;
    }
    function text(str, x, top, key, size) {
      const y = baseline(top, size, key);
      cmds.push("BT /" + FONT[key].id + " " + n(size) + " Tf 1 0 0 1 " + n(x) + " " + n(y) + " Tm (" + esc(str) + ") Tj ET");
    }
    function textRight(str, right, top, key, size) {
      text(str, right - widthOf(str, key, size), top, key, size);
    }
    function textCenter(str, top, key, size) {
      text(str, (PAGE_W - widthOf(str, key, size)) / 2, top, key, size);
    }
    function hline(x1, x2, top, weight) {
      const y = PAGE_H - top;
      cmds.push(n(weight || 0.8) + " w " + n(x1) + " " + n(y) + " m " + n(x2) + " " + n(y) + " l S");
    }
    function underline(str, x, top, key, size, lineTop) {
      text(str, x, top, key, size);
      const w = widthOf(str, key, size);
      hline(x, x + w, lineTop == null ? top + 7 : lineTop, 0.7);
    }
    function colHeads(top) {
      ["EXCL. SST (RM)", "8% SST (RM)", "INC. SST (RM)"].forEach((label, i) => {
        const right = [COL.excl, COL.sst, COL.inc][i];
        const w = widthOf(label, "bold", 8);
        const x = right - w;
        text(label, x, top, "bold", 8);
        hline(x, right, top + 7, 0.7);
      });
    }
    function amounts(top, excl, sst, inc, incKey, incSize, incTop) {
      textRight(fmt(excl), COL.excl, top, "regular", 8);
      textRight(fmt(sst), COL.sst, top, "regular", 8);
      textRight(fmt(inc), COL.inc, incTop == null ? top : incTop, incKey || "regular", incSize || 8);
    }
    function rows(list, top) {
      list.forEach((row, i) => {
        const y = top + i * 11.3;
        text(String(i + 1), LEFT, y, "regular", 8);
        text(row.label, 77.6, y, "regular", 8);
        amounts(y, row.excl, row.sst, row.inc);
      });
      return top + Math.max(0, list.length - 1) * 11.3;
    }

    textCenter("ESTIMATED LEGAL COSTS", 34.4, "bold", 9);
    const estW = widthOf("ESTIMATED LEGAL COSTS", "bold", 9);
    const estX = (PAGE_W - estW) / 2;
    hline(estX, estX + estW, 42.1, 0.8);
    textCenter("New Scale Quotation based on SRO 2023", 44.2, "bold", 11);
    text('SALE AND PURCHASE AGREEMENT ("SPA")', LEFT, 58.2, "bold", 8);

    const party = model.party === "purchaser" ? "Purchaser" : "Vendor";
    text(party, LEFT, 80.8, "bold", 8);
    if (model.name) text(model.name, VALUE_X, 80.8, "bold", 8);

    let shift = 0;
    if (model.persons && model.persons !== 1) {
      shift += 11.3;
      text("Persons:", LEFT, 80.8 + 22.6, "bold", 8);
      text(String(model.persons), VALUE_X, 80.8 + 22.6, "bold", 8);
    }

    const propertyTop = 103.5 + shift;
    text("Property:", LEFT, propertyTop, "bold", 8);
    const propertyLines = model.property ? wrap(model.property, "bold", 8, RULE_R - VALUE_X) : [];
    propertyLines.forEach((line, i) => text(line, VALUE_X, propertyTop + i * 11.3, "bold", 8));
    const propertyExtra = Math.max(0, propertyLines.length - 1);

    const priceTop = 114.8 + shift + propertyExtra * 11.3;
    text("Purchase Price:", LEFT, priceTop, "bold", 8);
    if (model.price != null) text(fmtRM(model.price), VALUE_X, priceTop, "bold", 8);

    let lastTop = priceTop;
    if (model.loanOn) {
      lastTop = priceTop + 11.3;
      text("Loan Amount:", LEFT, lastTop, "bold", 8);
      if (model.loanAmount != null) text(fmtRM(model.loanAmount), VALUE_X, lastTop, "bold", 8);
    }

    const ruleTop = lastTop + 19.3;
    hline(RULE_L, RULE_R, ruleTop, 0.9);

    const intro1 = ruleTop + 2.6;
    const introBold = "TO OUR PROFESSIONAL CHARGES";
    const introRest = " for and in connection with rendering of legal advice, preparation, drafting of agreements and all services";
    text(introBold, LEFT, intro1, "bold", 8);
    text(introRest, LEFT + widthOf(introBold, "bold", 8), intro1, "regular", 8);
    text("rendered in respect of the above matter:-", LEFT, intro1 + 10.8, "regular", 8);

    const headTop = intro1 + 10.8 + 22.3;
    underline("LEGAL FEES", LEFT, headTop, "bold", 8, headTop + 7);
    colHeads(headTop);

    const fees = model.fees || [];
    const firstFee = headTop + 11.3;
    const lastFee = fees.length ? rows(fees, firstFee) : firstFee - 11.3;
    const feeTotalTop = (fees.length ? lastFee : headTop) + 11.3;
    hline(TOTAL_RULE_L, RULE_R, feeTotalTop - 1.9, 0.9);
    text("Total", TOTAL_WORD, feeTotalTop, "bold", 8);
    amounts(feeTotalTop, model.feeExcl, model.feeSst, model.feeInc);

    const disbHead = feeTotalTop + 22.6;
    underline("DISBURSEMENT", LEFT, disbHead, "bold", 8, disbHead + 7);
    const disb = model.disb || [];
    const firstDisb = disbHead + 11.2;
    const lastDisb = disb.length ? rows(disb, firstDisb) : firstDisb - 11.3;
    const disbTotalTop = (disb.length ? lastDisb : disbHead) + 11.3;
    hline(TOTAL_RULE_L, RULE_R, disbTotalTop - 1.9, 0.9);
    text("Total", TOTAL_WORD, disbTotalTop, "bold", 8);
    amounts(disbTotalTop, model.disbExcl, model.disbSst, model.disbInc);

    const grandTop = disbTotalTop + 36.1;
    hline(TOTAL_RULE_L, RULE_R, grandTop - 4.2, 0.9);
    text("Total", TOTAL_WORD, grandTop, "bold", 8);
    const incDrop = (FONT.bold.ascent / 1000) * 2;
    amounts(grandTop, model.grandExcl, model.grandSst, model.grandInc, "bold", 10, grandTop - incDrop);
    hline(TOTAL_RULE_L, RULE_R, grandTop + 8.4, 0.9);
    hline(TOTAL_RULE_L, RULE_R, grandTop + 10.3, 0.9);

    let noteTop = 594.3;
    if (grandTop + 28 > 560) noteTop = grandTop + 46;
    const notes = [
      "Note 1 : This quotation is prepared based on information provided and it might varies according to actual facts of the said case.",
      "Note 2 : This quotation is only valid for one (1) month from the date of issuance.",
      "Note 3 : Only 50% of the Legal Fees is refundable in the event that the transaction is aborted.",
    ];
    notes.forEach((line, i) => text(line, LEFT, noteTop + i * 10.55, "italic", 8));

    return pack(cmds.join("\n"));
  }

  function pack(content) {
    const contentBytes = new TextEncoder().encode(content);
    const objects = [];
    function add(body) {
      objects.push(body);
      return objects.length;
    }
    function strObj(s) {
      return add(new TextEncoder().encode(s));
    }

    const toUnicode =
      "/CIDInit /ProcSet findresource begin\n" +
      "12 dict begin\n" +
      "begincmap\n" +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n" +
      "/CMapName /Adobe-Identity-UCS def\n" +
      "/CMapType 2 def\n" +
      "1 begincodespacerange\n<20> <7E> endcodespacerange\n" +
      "95 beginbfchar\n" +
      rangeUnicode() +
      "endbfchar\n" +
      "endcmap\n" +
      "CMapName currentdict /CMap defineresource pop\n" +
      "end\n" +
      "end\n";

    const catalogId = strObj("<< /Type /Catalog /Pages 2 0 R >>");
    const pagesId = strObj("<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
    const pageId = strObj(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] " +
      "/Resources << /Font << /F1 6 0 R /F2 9 0 R /F3 12 0 R >> >> /Contents 4 0 R >>"
    );
    const contentId = add(streamObj(contentBytes, "<< /Length " + contentBytes.length + " >>"));
    const uniId = add(streamObj(new TextEncoder().encode(toUnicode), null));

    const order = ["regular", "bold", "italic"];
    const fontIds = {};
    order.forEach((key) => {
      const font = FONT[key];
      const flags = key === "italic" ? 96 : 32;
      const fileId = add(streamObj(font.bytes, "<< /Length " + font.bytes.length + " /Length1 " + font.bytes.length + " >>"));
      const descId = strObj(
        "<< /Type /FontDescriptor /FontName /" + font.name +
        " /Flags " + flags +
        " /FontBBox [" + font.bbox.join(" ") + "]" +
        " /ItalicAngle " + font.italicAngle +
        " /Ascent " + font.ascent +
        " /Descent " + font.descent +
        " /CapHeight " + font.capHeight +
        " /StemV " + (key === "bold" ? 140 : 80) +
        " /FontFile2 " + fileId + " 0 R >>"
      );
      const fontId = strObj(
        "<< /Type /Font /Subtype /TrueType /BaseFont /" + font.name +
        " /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [" + font.widths.join(" ") + "]" +
        " /FontDescriptor " + descId + " 0 R /ToUnicode " + uniId + " 0 R >>"
      );
      fontIds[key] = fontId;
      void fileId;
    });

    if (catalogId !== 1 || pagesId !== 2 || pageId !== 3 || contentId !== 4 || uniId !== 5) {
      throw new Error("PDF object order changed");
    }
    if (fontIds.regular !== 7 || fontIds.bold !== 10 || fontIds.italic !== 13) {
      /* File streams are inserted before descriptors.
         regular: file 6, desc 7, font 8 — the page resource above is wrong.
         Rebuild is handled by fixed ids below. */
    }
    return assemble(objects, pageResources(objects));
  }

  function rangeUnicode() {
    let s = "";
    for (let c = 32; c <= 126; c++) {
      const hex = c.toString(16).toUpperCase().padStart(2, "0");
      const uni = c.toString(16).toUpperCase().padStart(4, "0");
      s += "<" + hex + "> <" + uni + ">\n";
    }
    return s;
  }

  function streamObj(bytes, dict) {
    const head = new TextEncoder().encode(
      (dict || "<< /Length " + bytes.length + " >>") + "\nstream\n"
    );
    const tail = new TextEncoder().encode("\nendstream");
    const out = new Uint8Array(head.length + bytes.length + tail.length);
    out.set(head, 0);
    out.set(bytes, head.length);
    out.set(tail, head.length + bytes.length);
    return out;
  }

  function pageResources() {
    return null;
  }

  function assemble(objectBodies) {
    /* Object ids are assigned in pack(), but font file ids land before the
       font dictionaries. The page must point at the real font ids.
       Re-find them by scanning is unnecessary: pack() pushes in order:
       1 catalog, 2 pages, 3 page, 4 content, 5 tounicode,
       then for each face: file, descriptor, font.
       regular font = 8, bold = 11, italic = 14.
       Patch the page object before writing offsets. */
    const page = new TextEncoder().encode(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + PAGE_W + " " + PAGE_H + "] " +
      "/Resources << /Font << /F1 8 0 R /F2 11 0 R /F3 14 0 R >> >> /Contents 4 0 R >>"
    );
    objectBodies[2] = page;

    const enc = new TextEncoder();
    const headText = enc.encode("%PDF-1.4\n%");
    const header = new Uint8Array(headText.length + 5);
    header.set(headText, 0);
    header.set([0xe2, 0xe3, 0xcf, 0xd3, 0x0a], headText.length);
    const chunks = [header];
    let pos = header.length;
    const offsets = [0];
    objectBodies.forEach((body, i) => {
      const prefix = enc.encode(i + 1 + " 0 obj\n");
      const suffix = enc.encode("\nendobj\n");
      offsets.push(pos);
      chunks.push(prefix, body, suffix);
      pos += prefix.length + body.length + suffix.length;
    });
    const size = objectBodies.length + 1;
    let xref = "xref\n0 " + size + "\n0000000000 65535 f \n";
    for (let i = 1; i < size; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    xref += "trailer\n<< /Size " + size + " /Root 1 0 R >>\nstartxref\n" + pos + "\n%%EOF\n";
    chunks.push(enc.encode(xref));
    let total = 0;
    chunks.forEach((c) => { total += c.length; });
    const out = new Uint8Array(total);
    let o = 0;
    chunks.forEach((c) => { out.set(c, o); o += c.length; });
    return out;
  }

  return { buildQuotePdf: buildQuotePdf, fmt: fmt };
});
