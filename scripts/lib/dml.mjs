export const EMU = 12700;
export const pt = (v) => Math.round(v * EMU);
export const deg = (v) => Math.round(v * 60000);

export const C = {
  blue: "1C3359",
  blueMid: "24406B",
  blueSoft: "2C4A78",
  blueTint: "EEF2F8",
  gold: "B6AD6E",
  goldDeep: "9A9059",
  goldTint: "F5F2E6",
  ink: "1E2A3C",
  body: "4C5C72",
  muted: "8494AB",
  border: "DCE3EE",
  white: "FFFFFF",
  green: "2F7D5B",
  greenTint: "E8F2EC",
  red: "B04A3F",
  redTint: "F8ECEA",
};

const NS =
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';

export const esc = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const clr = (color, alpha) =>
  alpha === undefined
    ? `<a:srgbClr val="${color}"/>`
    : `<a:srgbClr val="${color}"><a:alpha val="${Math.round(alpha * 1000)}"/></a:srgbClr>`;

const fillXml = (fill) => {
  if (!fill) return "<a:noFill/>";
  if (fill.gradient) {
    const [from, to] = fill.gradient;
    return (
      '<a:gradFill rotWithShape="1"><a:gsLst>' +
      `<a:gs pos="0">${clr(from)}</a:gs>` +
      `<a:gs pos="55000">${clr(fill.mid || to)}</a:gs>` +
      `<a:gs pos="100000">${clr(to)}</a:gs>` +
      '</a:gsLst><a:lin ang="' + deg(fill.angle ?? 45) + '" scaled="0"/></a:gradFill>'
    );
  }
  return `<a:solidFill>${clr(fill.color, fill.alpha)}</a:solidFill>`;
};

const lineXml = (line) => {
  if (!line) return "<a:ln><a:noFill/></a:ln>";
  return (
    `<a:ln w="${pt(line.w ?? 1)}" cap="flat"><a:solidFill>${clr(line.color, line.alpha)}</a:solidFill>` +
    `<a:prstDash val="${line.dash || "solid"}"/>${
      line.cap ? `<a:round/>` : "<a:flat/>"
    }</a:ln>`
  );
};

const shadowXml = (shadow) => {
  if (!shadow) return "<a:effectLst/>";
  return (
    '<a:effectLst><a:outerShdw blurRad="' + pt(shadow.blur ?? 9) +
    '" dist="' + pt(shadow.dist ?? 2) +
    '" dir="' + deg(shadow.dir ?? 90) +
    '" rotWithShape="0">' +
    clr(shadow.color || "0B1A30", shadow.alpha ?? 9) +
    "</a:outerShdw></a:effectLst>"
  );
};

const geomXml = (geom, adj, w, h) => {
  if (geom === "rect" || !geom) return '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  const values = { ...(adj || {}) };
  if (geom === "roundRect" && values.radius !== undefined) {
    const half = Math.min(w, h) / 2 || 1;
    values.adj = Math.max(0, Math.min(50000, (values.radius / half) * 100000));
    delete values.radius;
  }
  const guides = Object.entries(values)
    .map(([name, value]) => `<a:gd name="${name}" fmla="val ${Math.round(value)}"/>`)
    .join("");
  return `<a:prstGeom prst="${geom}"><a:avLst>${guides}</a:avLst></a:prstGeom>`;
};

const runXml = (run) => {
  const props = [
    `lang="fr-FR" sz="${Math.round((run.sz ?? 11) * 100)}"`,
    run.b ? 'b="1"' : 'b="0"',
    run.i ? 'i="1"' : "",
    run.caps ? 'cap="all"' : "",
    run.spc ? `spc="${run.spc}"` : "",
    'dirty="0"',
  ]
    .filter(Boolean)
    .join(" ");
  const body =
    run.link
      ? `<a:solidFill><a:srgbClr val="${run.color || C.blue}"/></a:solidFill>` +
        `<a:latin typeface="${run.font || "Segoe UI"}"/><a:cs typeface="${run.font || "Segoe UI"}"/>` +
        `<a:hlinkClick r:id="${run.link}"/>`
      : `<a:solidFill>${clr(run.color || C.ink, run.alpha)}</a:solidFill>` +
        `<a:latin typeface="${run.font || "Segoe UI"}"/><a:cs typeface="${run.font || "Segoe UI"}"/>`;
  return `<a:r><a:rPr ${props}>${body}</a:rPr><a:t>${esc(run.t)}</a:t></a:r>`;
};

const paraXml = (para) => {
  const attrs = [];
  if (para.align) attrs.push(`algn="${para.align}"`);
  if (para.bullet) {
    attrs.push(`marL="${para.bullet.marL ?? 114300}"`, `indent="-${para.bullet.marL ?? 114300}"`);
  }
  const children = [];
  if (para.lnSpc) children.push(`<a:lnSpc><a:spcPct val="${Math.round(para.lnSpc * 100000)}"/></a:lnSpc>`);
  if (para.spcBef) children.push(`<a:spcBef><a:spcPts val="${Math.round(para.spcBef * 100)}"/></a:spcBef>`);
  if (para.bullet) {
    children.push(
      `<a:buClr><a:srgbClr val="${para.bullet.color || C.gold}"/></a:buClr>`,
      '<a:buFont typeface="Arial" pitchFamily="34" charset="0"/>',
      `<a:buChar char="${para.bullet.char || "\u2022"}"/>`
    );
  } else {
    children.push("<a:buNone/>");
  }
  const runs = (para.runs || []).map(runXml).join(para.brAfter ? "<a:br/>" : "");
  return `<a:p><a:pPr${attrs.map((a) => ` ${a}`).join("")}>${children.join("")}</a:pPr>${runs}<a:endParaRPr lang="fr-FR" sz="100"/></a:p>`;
};

const textBodyXml = (text) => {
  const paras = (text.paras || []).map(paraXml).join("");
  return (
    "<p:txBody><a:bodyPr wrap=\"square\" lIns=\"0\" tIns=\"0\" rIns=\"0\" bIns=\"0\" " +
    `anchor="${text.anchor || "t"}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody>`
  );
};

export class Slide {
  constructor(bg = C.white) {
    this.bg = bg;
    this.parts = [];
    this.rels = [];
    this.nextId = 2;
  }

  uid() {
    return this.nextId++;
  }

  rel(target, type, external = false) {
    const id = `rId${this.rels.length + 2}`;
    this.rels.push({ id, target, type, external });
    return id;
  }

  shape({ x, y, w, h, geom, adj, rot, flipH, flipV, fill, line, shadow, text, name }) {
    const id = this.uid();
    const xfrm =
      `<a:xfrm${rot ? ` rot="${deg(rot)}"` : ""}${flipH ? ' flipH="1"' : ""}${
        flipV ? ' flipV="1"' : ""
      }><a:off x="${pt(x)}" y="${pt(y)}"/><a:ext cx="${pt(w)}" cy="${pt(h)}"/></a:xfrm>`;
    this.parts.push(
      `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name || "forme"}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
        `<p:spPr>${xfrm}${geomXml(geom, adj, w, h)}${fillXml(fill)}${lineXml(line)}${shadowXml(shadow)}</p:spPr>` +
        (text ? textBodyXml(text) : '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="fr-FR"/></a:p></p:txBody>') +
        "</p:sp>"
    );
    return this;
  }

  text({ x, y, w, h, paras, anchor = "t", name }) {
    return this.shape({ x, y, w, h, fill: null, name, text: { paras, anchor } });
  }

  picture({ x, y, w, h, rId, name }) {
    const id = this.uid();
    this.parts.push(
      `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name || "image"}"/>` +
        '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>' +
        `<p:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
        `<p:spPr><a:xfrm><a:off x="${pt(x)}" y="${pt(y)}"/><a:ext cx="${pt(w)}" cy="${pt(h)}"/></a:xfrm>` +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    );
    return this;
  }

  toXml(transition = null) {
    const tree =
      '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
      '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
      this.parts.join("") +
      "</p:spTree>";
    return (
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' +
      `<p:sld ${NS} xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ` +
      'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" ' +
      'xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main">' +
      `<p:cSld><p:bg><p:bgPr>${fillXml(typeof this.bg === "string" ? { color: this.bg } : this.bg)}<a:effectLst/></p:bgPr></p:bg>${tree}</p:cSld>` +
      "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>" +
      (transition || "") +
      "</p:sld>"
    );
  }
}

const ICONS = {
  building: [
    { g: "rect", x: 6, y: 26, w: 88, h: 66 },
    { g: "rect", x: 20, y: 40, w: 15, h: 11, f: "b" },
    { g: "rect", x: 43, y: 40, w: 15, h: 11, f: "b" },
    { g: "rect", x: 66, y: 40, w: 15, h: 11, f: "b" },
    { g: "rect", x: 20, y: 59, w: 15, h: 11, f: "b" },
    { g: "rect", x: 43, y: 59, w: 15, h: 11, f: "b" },
    { g: "rect", x: 66, y: 59, w: 15, h: 11, f: "b" },
    { g: "rect", x: 40, y: 78, w: 20, h: 14, f: "b" },
  ],
  list: [
    { g: "roundRect", x: 8, y: 10, w: 84, h: 80, adj: { radius: 10 } },
    { g: "rect", x: 21, y: 30, w: 12, h: 8, f: "b" },
    { g: "rect", x: 21, y: 48, w: 12, h: 8, f: "b" },
    { g: "rect", x: 21, y: 66, w: 12, h: 8, f: "b" },
    { g: "rect", x: 42, y: 29, w: 36, h: 9, f: "b" },
    { g: "rect", x: 42, y: 47, w: 28, h: 9, f: "b" },
    { g: "rect", x: 42, y: 65, w: 33, h: 9, f: "b" },
  ],
  document: [
    { g: "flowChartDocument", x: 18, y: 8, w: 64, h: 84 },
    { g: "rect", x: 31, y: 32, w: 38, h: 7, f: "b" },
    { g: "rect", x: 31, y: 48, w: 38, h: 7, f: "b" },
    { g: "rect", x: 31, y: 64, w: 24, h: 7, f: "b" },
  ],
  warning: [
    { g: "triangle", x: 3, y: 8, w: 94, h: 86 },
    { g: "roundRect", x: 45, y: 40, w: 9, h: 24, adj: { radius: 4 }, f: "b" },
    { g: "ellipse", x: 44, y: 69, w: 11, h: 11, f: "b" },
  ],
  sparkle: [
    { g: "star4", x: 4, y: 4, w: 62, h: 62 },
    { g: "star4", x: 56, y: 50, w: 40, h: 40 },
  ],
  scan: [
    { g: "roundRect", x: 8, y: 18, w: 84, h: 64, adj: { radius: 8 } },
    { g: "rect", x: 8, y: 42, w: 84, h: 11, f: "b" },
    { g: "rect", x: 26, y: 62, w: 48, h: 8, f: "b" },
  ],
  database: [
    { g: "can", x: 13, y: 10, w: 74, h: 80 },
    { g: "rect", x: 13, y: 41, w: 74, h: 7, f: "b" },
    { g: "rect", x: 13, y: 61, w: 74, h: 7, f: "b" },
  ],
  layers: [
    { g: "parallelogram", x: 2, y: 12, w: 96, h: 26, adj: { adj: 22000 } },
    { g: "parallelogram", x: 2, y: 38, w: 96, h: 26, adj: { adj: 22000 } },
    { g: "parallelogram", x: 2, y: 64, w: 96, h: 26, adj: { adj: 22000 } },
  ],
  dashboard: [
    { g: "roundRect", x: 5, y: 12, w: 42, h: 36, adj: { radius: 8 } },
    { g: "roundRect", x: 53, y: 12, w: 42, h: 36, adj: { radius: 8 } },
    { g: "roundRect", x: 5, y: 54, w: 42, h: 34, adj: { radius: 8 } },
    { g: "roundRect", x: 53, y: 54, w: 42, h: 34, adj: { radius: 8 } },
  ],
  chart: [
    { g: "roundRect", x: 8, y: 44, w: 17, h: 40, adj: { radius: 5 } },
    { g: "roundRect", x: 41, y: 22, w: 17, h: 62, adj: { radius: 5 } },
    { g: "roundRect", x: 74, y: 56, w: 17, h: 28, adj: { radius: 5 } },
    { g: "roundRect", x: 4, y: 88, w: 92, h: 7, adj: { radius: 3 } },
  ],
  chevrons: [
    { g: "chevron", x: 1, y: 20, w: 31, h: 60 },
    { g: "chevron", x: 34, y: 20, w: 31, h: 60 },
    { g: "chevron", x: 67, y: 20, w: 31, h: 60 },
  ],
  lock: [
    { g: "blockArc", x: 20, y: 6, w: 60, h: 62, adj: { adj1: 10800000, adj2: 0, adj3: 17000 } },
    { g: "roundRect", x: 8, y: 42, w: 84, h: 50, adj: { radius: 12 } },
    { g: "ellipse", x: 42, y: 57, w: 16, h: 16, f: "b" },
    { g: "rect", x: 47, y: 66, w: 6, h: 14, f: "b" },
  ],
  shield: [
    { g: "pentagon", x: 8, y: 4, w: 84, h: 92, rot: 180 },
    { g: "roundRect", x: 22, y: 58, w: 11, h: 28, adj: { radius: 5 }, rot: 45, f: "b" },
    { g: "roundRect", x: 40, y: 48, w: 11, h: 44, adj: { radius: 5 }, rot: -45, f: "b" },
  ],
  check: [
    { g: "roundRect", x: 11, y: 63, w: 31, h: 12, adj: { radius: 6 }, rot: 45 },
    { g: "roundRect", x: 28, y: 51, w: 65, h: 12, adj: { radius: 6 }, rot: -45 },
  ],
  clock: [
    { g: "ellipse", x: 4, y: 4, w: 92, h: 92 },
    { g: "roundRect", x: 47, y: 26, w: 6, h: 28, adj: { radius: 3 }, f: "b" },
    { g: "roundRect", x: 49, y: 47, w: 26, h: 6, adj: { radius: 3 }, f: "b" },
  ],
  user: [
    { g: "ellipse", x: 33, y: 8, w: 34, h: 34 },
    { g: "chord", x: 8, y: 48, w: 84, h: 54, adj: { adj1: 10800000, adj2: 0 } },
  ],
  people: [
    { g: "ellipse", x: 12, y: 20, w: 26, h: 26, f: "b" },
    { g: "chord", x: 0, y: 52, w: 54, h: 44, adj: { adj1: 10800000, adj2: 0 }, f: "b" },
    { g: "ellipse", x: 50, y: 10, w: 32, h: 32 },
    { g: "chord", x: 32, y: 46, w: 66, h: 54, adj: { adj1: 10800000, adj2: 0 } },
  ],
  magnifier: [
    { g: "donut", x: 6, y: 6, w: 62, h: 62, adj: { adj: 20000 } },
    { g: "roundRect", x: 58, y: 68, w: 34, h: 13, adj: { radius: 6 }, rot: 45 },
  ],
  arrowRight: [{ g: "rightArrow", x: 4, y: 28, w: 92, h: 44 }],
  stepUp: [
    { g: "upArrow", x: 22, y: 4, w: 56, h: 74 },
    { g: "roundRect", x: 4, y: 82, w: 92, h: 8, adj: { radius: 4 } },
  ],
  globe: [
    { g: "donut", x: 4, y: 4, w: 92, h: 92, adj: { adj: 12000 } },
    { g: "ellipse", x: 43, y: 4, w: 14, h: 92, f: "b" },
    { g: "ellipse", x: 4, y: 43, w: 92, h: 14, f: "b" },
  ],
  gear: [
    { g: "gear6", x: 2, y: 2, w: 96, h: 96 },
    { g: "ellipse", x: 36, y: 36, w: 28, h: 28, f: "b" },
  ],
  cloud: [{ g: "cloud", x: 2, y: 18, w: 96, h: 64 }],
  calendar: [
    { g: "rect", x: 6, y: 16, w: 88, h: 78 },
    { g: "rect", x: 6, y: 16, w: 88, h: 18, f: "b" },
    { g: "roundRect", x: 24, y: 4, w: 11, h: 22, adj: { radius: 5 } },
    { g: "roundRect", x: 65, y: 4, w: 11, h: 22, adj: { radius: 5 } },
    { g: "rect", x: 24, y: 48, w: 15, h: 11, f: "b" },
    { g: "rect", x: 48, y: 48, w: 15, h: 11, f: "b" },
    { g: "rect", x: 72, y: 48, w: 5, h: 11, f: "b" },
    { g: "rect", x: 24, y: 68, w: 15, h: 11, f: "b" },
    { g: "rect", x: 48, y: 68, w: 15, h: 11, f: "b" },
  ],
  refresh: [{ g: "circularArrow", x: 4, y: 4, w: 92, h: 92 }],
  docStack: [
    { g: "roundRect", x: 2, y: 8, w: 56, h: 74, adj: { radius: 6 }, f: "b" },
    { g: "roundRect", x: 20, y: 18, w: 78, h: 76, adj: { radius: 6 } },
    { g: "rect", x: 32, y: 36, w: 54, h: 7, f: "b" },
    { g: "rect", x: 32, y: 52, w: 54, h: 7, f: "b" },
    { g: "rect", x: 32, y: 68, w: 32, h: 7, f: "b" },
  ],
  link: [
    { g: "roundRect", x: 2, y: 32, w: 38, h: 36, adj: { radius: 18 } },
    { g: "roundRect", x: 60, y: 32, w: 38, h: 36, adj: { radius: 18 } },
    { g: "roundRect", x: 28, y: 44, w: 44, h: 12, adj: { radius: 6 } },
  ],
  folder: [
    { g: "roundRect", x: 4, y: 26, w: 44, h: 18, adj: { radius: 6 } },
    { g: "roundRect", x: 4, y: 34, w: 92, h: 58, adj: { radius: 8 } },
    { g: "rect", x: 18, y: 52, w: 64, h: 8, f: "b" },
  ],
  target: [
    { g: "donut", x: 2, y: 2, w: 96, h: 96, adj: { adj: 14000 } },
    { g: "ellipse", x: 24, y: 24, w: 52, h: 52, f: "b" },
    { g: "ellipse", x: 38, y: 38, w: 24, h: 24 },
  ],
  split: [
    { g: "roundRect", x: 2, y: 8, w: 40, h: 36, adj: { radius: 8 } },
    { g: "roundRect", x: 58, y: 8, w: 40, h: 36, adj: { radius: 8 } },
    { g: "rect", x: 49, y: 20, w: 3, h: 12 },
    { g: "roundRect", x: 20, y: 58, w: 60, h: 36, adj: { radius: 8 } },
    { g: "rect", x: 21, y: 42, w: 3, h: 18 },
    { g: "rect", x: 77, y: 42, w: 3, h: 18 },
  ],
};

export function icon(slide, name, { x, y, size = 20, color = C.white, cut = C.blue }) {
  const parts = ICONS[name];
  if (!parts) throw new Error(`icone inconnue: ${name}`);
  const k = size / 100;
  for (const part of parts) {
    const fill = part.f === "b" ? { color: cut } : part.f === "n" ? null : { color };
    slide.shape({
      x: x + part.x * k,
      y: y + part.y * k,
      w: Math.max(0.4, part.w * k),
      h: Math.max(0.4, part.h * k),
      geom: part.g,
      adj: part.adj,
      rot: part.rot,
      fill,
    });
  }
  return slide;
}

export function iconBadge(slide, name, { x, y, size = 40, color = C.white, bg = C.blue, radius = 12, shadow }) {
  slide.shape({
    x,
    y,
    w: size,
    h: size,
    geom: "roundRect",
    adj: { radius },
    fill: { color: bg },
    shadow,
  });
  icon(slide, name, { x: x + size * 0.24, y: y + size * 0.24, size: size * 0.52, color, cut: bg });
  return slide;
}

export const circle = (slide, { x, y, d, fill, line }) =>
  slide.shape({ x, y, w: d, h: d, geom: "ellipse", fill, line });

export const card = (slide, { x, y, w, h, fill = C.white, line = C.border, radius = 12, shadow = true }) =>
  slide.shape({
    x,
    y,
    w,
    h,
    geom: "roundRect",
    adj: { radius },
    fill: { color: fill },
    line: { w: 0.75, color: line },
    shadow: shadow
      ? { blur: 10, dist: 2.5, dir: 90, alpha: 8 }
      : null,
  });

export const t = (text, props = {}) => ({ t: text, ...props });

export const line = (slide, { x, y, w, h = 0.75, color = C.border }) =>
  slide.shape({ x, y, w, h, fill: { color }, line: null });

export function transition(kind) {
  const modern = {
    morph: { extra: "p159", tag: '<p159:morph option="byObject"/>', fallback: "<p:fade/>" },
    pushUp: { extra: "", tag: '<p:push dir="u"/>', fallback: '<p:push dir="u"/>' },
    pushLeft: { extra: "", tag: '<p:push dir="l"/>', fallback: '<p:push dir="l"/>' },
    wipe: { extra: "", tag: '<p:wipe dir="l"/>', fallback: '<p:wipe dir="l"/>' },
    fade: { extra: "", tag: "<p:fade/>", fallback: "<p:fade/>" },
    reveal: { extra: "p14", tag: '<p14:reveal dir="l"/>', fallback: '<p:wipe dir="l"/>' },
  }[kind];
  if (!modern) return "";
  return (
    `<mc:AlternateContent><mc:Choice Requires="p14${modern.extra ? " " + modern.extra : ""}">` +
    `<p:transition spd="slow" p14:dur="900">${modern.tag}</p:transition></mc:Choice>` +
    `<mc:Fallback><p:transition spd="slow">${modern.fallback}</p:transition></mc:Fallback></mc:AlternateContent>`
  );
}
