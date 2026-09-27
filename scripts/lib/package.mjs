const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const palette = [
  "1C3359",
  "B6AD6E",
  "2C4A78",
  "6E8CB8",
  "3F7A5C",
  "9A9059",
  "4C5C72",
  "B04A3F",
];

const clrMap =
  'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" ' +
  'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"';

const emptyTree =
  '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
  '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';

const fills = (indent = "  ") =>
  [
    '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>',
    '<a:solidFill><a:schemeClr val="phClr"><a:tint val="60000"/></a:schemeClr></a:solidFill>',
    '<a:solidFill><a:schemeClr val="phClr"><a:shade val="80000"/></a:schemeClr></a:solidFill>',
  ].join(indent);

const lineStyles = () =>
  [6350, 12700, 19050]
    .map(
      (w) =>
        `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>` +
        '<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>'
    )
    .join("");

const lvl = (i, sz, color, bold) =>
  `<a:lvl${i}pPr marL="${(i - 1) * 342900}" indent="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" ` +
  `latinLnBrk="0" hangingPunct="1"><a:defRPr sz="${sz}"${bold ? ' b="1"' : ""} kern="1200">` +
  `<a:solidFill><a:schemeClr val="${color}"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl${i}pPr>`;

export function theme() {
  return (
    XML +
    `<a:theme xmlns:a="${A}" name="AGL JuriCompliance"><a:themeElements>` +
    '<a:clrScheme name="AGL">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="1C3359"/></a:dk2>' +
    '<a:lt2><a:srgbClr val="EEF2F8"/></a:lt2>' +
    palette.map((hex, i) => `<a:accent${i + 1}><a:srgbClr val="${hex}"/></a:accent${i + 1}>`).join("") +
    '<a:hlink><a:srgbClr val="1C3359"/></a:hlink>' +
    '<a:folHlink><a:srgbClr val="B6AD6E"/></a:folHlink>' +
    "</a:clrScheme>" +
    '<a:fontScheme name="AGL">' +
    '<a:majorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Segoe UI"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>' +
    "</a:fontScheme>" +
    '<a:fmtScheme name="AGL">' +
    `<a:fillStyleLst>${fills()}</a:fillStyleLst>` +
    `<a:lnStyleLst>${lineStyles()}</a:lnStyleLst>` +
    "<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>" +
    "<a:effectStyle><a:effectLst/></a:effectStyle>" +
    "<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>" +
    `<a:bgFillStyleLst>${fills()}</a:bgFillStyleLst>` +
    "</a:fmtScheme></a:themeElements>" +
    "<a:objectDefaults/><a:extraClrSchemeLst/></a:theme>"
  );
}

export function slideMaster() {
  return (
    XML +
    `<p:sldMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}">` +
    `<p:cSld><p:bg><p:bgPr><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>${emptyTree}</p:cSld>` +
    `<p:clrMap ${clrMap}/>` +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    "<p:txStyles>" +
    `<p:titleStyle>${lvl(1, 2600, "tx2", true)}</p:titleStyle>` +
    `<p:bodyStyle>${lvl(1, 1400, "tx1", false)}</p:bodyStyle>` +
    `<p:otherStyle>${lvl(1, 1200, "tx1", false)}</p:otherStyle>` +
    "</p:txStyles></p:sldMaster>"
  );
}

export function slideLayout() {
  return (
    XML +
    `<p:sldLayout xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" type="blank" preserve="1">` +
    `<p:cSld name="Vide">${emptyTree}</p:cSld>` +
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>"
  );
}

export function notesMaster() {
  return (
    XML +
    `<p:notesMaster xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}">` +
    '<p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
    emptyTree +
    "</p:cSld>" +
    `<p:clrMap ${clrMap}/>` +
    `<p:notesStyle>${lvl(1, 1200, "tx1", false)}</p:notesStyle>` +
    "</p:notesMaster>"
  );
}

export function presProps() {
  return XML + `<p:presentationPr xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"/>`;
}

export function viewProps() {
  return (
    XML +
    `<p:viewPr xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}">` +
    '<p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr>' +
    '<p:slideViewPr><p:cSldViewPr><p:cViewPr varScale="1"><p:scale><a:sx n="76" d="100"/>' +
    '<a:sy n="76" d="100"/></p:scale><p:origin x="-1548" y="-90"/></p:cViewPr></p:cSldViewPr>' +
    "</p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n=\"1\" d=\"1\"/><a:sy n=\"1\" d=\"1\"/>" +
    '</p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr>' +
    '<p:gridSpacing cx="72008" cy="72008"/></p:viewPr>'
  );
}

export function tableStyles() {
  return (
    XML +
    `<a:tblStyleLst xmlns:a="${A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`
  );
}

export function notesSlide(paragraphs) {
  const body = paragraphs
    .map(
      (line) =>
        '<a:p><a:r><a:rPr lang="fr-FR" dirty="0"/><a:t>' +
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;") +
        "</a:t></a:r></a:p>"
    )
    .join("");
  return (
    XML +
    `<p:notes xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>` +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>' +
    '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder 1"/>' +
    '<p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr>' +
    `<p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${body}</p:txBody></p:sp>` +
    "</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>"
  );
}

const rels = (items) =>
  XML +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  items
    .map(
      (item) =>
        `<Relationship Id="${item.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${item.type}" Target="${item.target}"${
          item.external ? ' TargetMode="External"' : ""
        }/>`
    )
    .join("") +
  "</Relationships>";

function contentTypes(count) {
  const overrides = [
    '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
    '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
    '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
    '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>',
    '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
    '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>',
    '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>',
    '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
  ];
  for (let i = 1; i <= count; i++) {
    overrides.push(
      `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
      `<Override PartName="/ppt/notesSlides/notesSlide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
    );
  }
  return (
    XML +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    overrides.join("") +
    "</Types>"
  );
}

export function coreProps(title, author, dateIso) {
  return (
    XML +
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
    'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${title}</dc:title><dc:subject>Veille reglementaire AGL</dc:subject>` +
    `<dc:creator>${author}</dc:creator><cp:keywords>AGL; veille reglementaire; Power Pages; Dataverse</cp:keywords>` +
    `<cp:lastModifiedBy>${author}</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${dateIso}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${dateIso}</dcterms:modified>` +
    "</cp:coreProperties>"
  );
}

export function appProps(count, titles) {
  const parts = titles.map((title) => `<vt:lpstr>${title}</vt:lpstr>`).join("");
  return (
    XML +
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    "<Application>Microsoft Office PowerPoint</Application>" +
    `<Slides>${count}</Slides><Paragraphs>${count * 4}</Paragraphs>` +
    '<PresentationFormat>Widescreen</PresentationFormat><ScaleCrop>false</ScaleCrop>' +
    `<TitlesOfParts><vt:vector size="${count + 1}" baseType="lpstr">` +
    "<vt:lpstr>AGL JuriCompliance</vt:lpstr>" +
    parts +
    "</vt:vector></TitlesOfParts>" +
    '<Company>Africa Global Logistics (AGL)</Company><LinksUpToDate>false</LinksUpToDate>' +
    "<SharedDoc>false</SharedDoc><HyperlinksChanged>false</HyperlinksChanged>" +
    "<AppVersion>16.0000</AppVersion></Properties>"
  );
}

export function buildPackage({ slides, media, title, author, dateIso, titles }) {
  const count = slides.length;
  const files = [];

  files.push({ name: "[Content_Types].xml", data: contentTypes(count) });
  files.push({
    name: "_rels/.rels",
    data: rels([
      { id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" },
      {
        id: "rId2",
        type: "package/2006/relationships/metadata/core-properties",
        target: "docProps/core.xml",
      },
      { id: "rId3", type: "extended-properties", target: "docProps/app.xml" },
    ]),
  });
  files.push({ name: "docProps/core.xml", data: coreProps(title, author, dateIso) });
  files.push({ name: "docProps/app.xml", data: appProps(count, titles) });

  const presentationRels = [{ id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" }];
  slides.forEach((slide, i) => {
    presentationRels.push({ id: `rId${i + 2}`, type: "slide", target: `slides/slide${i + 1}.xml` });
  });
  let next = count + 2;
  const notesMasterId = `rId${next++}`;
  presentationRels.push({ id: notesMasterId, type: "notesMaster", target: "notesMasters/notesMaster1.xml" });
  presentationRels.push({ id: `rId${next++}`, type: "presProps", target: "presProps.xml" });
  presentationRels.push({ id: `rId${next++}`, type: "viewProps", target: "viewProps.xml" });
  presentationRels.push({ id: `rId${next++}`, type: "theme", target: "theme/theme1.xml" });
  presentationRels.push({ id: `rId${next++}`, type: "tableStyles", target: "tableStyles.xml" });

  const sldIds = slides
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join("");

  files.push({
    name: "ppt/presentation.xml",
    data:
      XML +
      `<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}" saveSubsetFonts="1" autoCompressPictures="0">` +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:notesMasterIdLst><p:notesMasterId r:id="${notesMasterId}"/></p:notesMasterIdLst>` +
      `<p:sldIdLst>${sldIds}</p:sldIdLst>` +
      '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
      "<p:defaultTextStyle><a:defPPr><a:defRPr lang=\"fr-FR\"/></a:defPPr>" +
      lvl(1, 1800, "tx1", false) +
      "</p:defaultTextStyle></p:presentation>",
  });
  files.push({ name: "ppt/_rels/presentation.xml.rels", data: rels(presentationRels) });

  files.push({ name: "ppt/presProps.xml", data: presProps() });
  files.push({ name: "ppt/viewProps.xml", data: viewProps() });
  files.push({ name: "ppt/tableStyles.xml", data: tableStyles() });
  files.push({ name: "ppt/theme/theme1.xml", data: theme() });

  files.push({ name: "ppt/slideMasters/slideMaster1.xml", data: slideMaster() });
  files.push({
    name: "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    data: rels([
      { id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" },
      { id: "rId2", type: "theme", target: "../theme/theme1.xml" },
    ]),
  });
  files.push({ name: "ppt/slideLayouts/slideLayout1.xml", data: slideLayout() });
  files.push({
    name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    data: rels([
      { id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" },
    ]),
  });
  files.push({ name: "ppt/notesMasters/notesMaster1.xml", data: notesMaster() });
  files.push({
    name: "ppt/notesMasters/_rels/notesMaster1.xml.rels",
    data: rels([{ id: "rId1", type: "theme", target: "../theme/theme1.xml" }]),
  });

  slides.forEach((slide, i) => {
    const n = i + 1;
    files.push({ name: `ppt/slides/slide${n}.xml`, data: slide.slide.toXml(slide.transition) });
    files.push({
      name: `ppt/slides/_rels/slide${n}.xml.rels`,
      data: rels([
        { id: "rId1", type: "slideLayout", target: "../slideLayouts/slideLayout1.xml" },
        ...slide.slide.rels,
      ]),
    });
    files.push({
      name: `ppt/notesSlides/notesSlide${n}.xml`,
      data: notesSlide(slide.notes),
    });
    files.push({
      name: `ppt/notesSlides/_rels/notesSlide${n}.xml.rels`,
      data: rels([
        { id: "rId1", type: "notesMaster", target: "../notesMasters/notesMaster1.xml" },
        { id: "rId2", type: "slide", target: `../slides/slide${n}.xml` },
      ]),
    });
  });

  for (const [name, data] of Object.entries(media)) {
    files.push({ name: `ppt/media/${name}`, data });
  }

  return files;
}
