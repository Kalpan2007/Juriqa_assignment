export interface CharLocation {
  run: Element;
  textNode: Node | null;
  offsetInNode: number;
}

export interface ParagraphModel {
  index: number;
  element: Element;
  text: string;
  hasExistingRevisions: boolean;
  charMap: CharLocation[];
}

export function normalizeRunChildren(docXml: Document): void {
  const runs = Array.from(docXml.getElementsByTagName('w:r'));
  for (const r of runs) {
    const parent = r.parentNode;
    if (!parent) continue;

    let rPr: Element | null = null;
    const contentNodes: Node[] = [];

    for (let i = 0; i < r.childNodes.length; i++) {
      const child = r.childNodes[i];
      if (!child) continue;
      if (child.nodeType === 1 && (child as Element).nodeName === 'w:rPr') {
        rPr = child as Element;
      } else if (child.nodeType === 1) {
        contentNodes.push(child);
      }
    }

    if (contentNodes.length > 1) {
      const insertRef = r.nextSibling;
      for (let i = 1; i < contentNodes.length; i++) {
        const node = contentNodes[i];
        if (!node) continue;
        const newRun = docXml.createElement('w:r');
        if (rPr) {
          newRun.appendChild(rPr.cloneNode(true));
        }
        newRun.appendChild(node);
        parent.insertBefore(newRun, insertRef);
      }
    }
  }
}

export function buildParagraphModels(docXml: Document): ParagraphModel[] {
  normalizeRunChildren(docXml);
  const paragraphs = Array.from(docXml.getElementsByTagName('w:p'));
  const models: ParagraphModel[] = [];

  paragraphs.forEach((pElement, index) => {
    // Check if paragraph contains existing revisions
    const insNodes = pElement.getElementsByTagName('w:ins');
    const delNodes = pElement.getElementsByTagName('w:del');
    const hasExistingRevisions = insNodes.length > 0 || delNodes.length > 0;

    let text = '';
    const charMap: CharLocation[] = [];

    // Helper to walk nodes recursively inside w:p, ignoring w:del and w:pPr
    function walkNodes(node: Node) {
      if (node.nodeType !== 1) return; // Only element nodes
      const el = node as Element;
      const tag = el.nodeName;

      if (tag === 'w:pPr' || tag === 'w:del' || tag === 'w:instrText') {
        return;
      }

      if (tag === 'w:r') {
        // Process run
        for (let i = 0; i < el.childNodes.length; i++) {
          const child = el.childNodes[i];
          if (!child || child.nodeType !== 1) continue;
          const childEl = child as Element;
          const childTag = childEl.nodeName;

          if (childTag === 'w:t') {
            const str = childEl.textContent ?? '';
            for (let c = 0; c < str.length; c++) {
              charMap.push({
                run: el,
                textNode: childEl.firstChild,
                offsetInNode: c,
              });
            }
            text += str;
          } else if (childTag === 'w:tab') {
            charMap.push({ run: el, textNode: null, offsetInNode: 0 });
            text += '\t';
          } else if (childTag === 'w:br' || childTag === 'w:cr') {
            charMap.push({ run: el, textNode: null, offsetInNode: 0 });
            text += '\n';
          } else if (childTag === 'w:noBreakHyphen') {
            charMap.push({ run: el, textNode: null, offsetInNode: 0 });
            text += '-';
          }
        }
        return;
      }

      // For hyperlinks, sdtContent, etc., recurse into children
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i];
        if (child) walkNodes(child);
      }
    }

    for (let i = 0; i < pElement.childNodes.length; i++) {
      const child = pElement.childNodes[i];
      if (child) walkNodes(child);
    }

    models.push({
      index,
      element: pElement,
      text,
      hasExistingRevisions,
      charMap,
    });
  });

  return models;
}
