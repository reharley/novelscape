import * as cheerio from 'cheerio';

export function parseChapterContent(text: string) {
  const $ = cheerio.load(text);
  const contents: any[] = [];

  //@ts-ignore
  function processElement(element: cheerio.Element) {
    const tagName = element.tagName?.toLowerCase() || '';

    // If the element contains child elements, process them recursively first
    const children = $(element).children();
    if (children.length > 0) {
      if (tagName !== 'p') {
        children.each((_, child) => {
          processElement(child);
        });
        return;
      }
    }

    const elementText = $(element).text().trim();
    if (/^h[1-6]$/.test(tagName)) {
      if (elementText.length === 0) return; // Skip empty elements
      contents.push({
        type: 'title',
        text: elementText,
        size: tagName, // e.g., h1, h2
        tag: tagName,
      });
    } else if (tagName === 'p') {
      const imagesInParagraph = $(element).find('img');
      if (imagesInParagraph.length > 0) {
        if (elementText.length === 0) return; // Skip empty elements
        imagesInParagraph.each((_, img) => {
          const src = $(img).attr('src');
          contents.push({
            type: 'paragraph',
            text: elementText, // Extract text of the paragraph
            src, // Attach image source if present
            tag: tagName,
          });
        });
      } else {
        if (elementText.length === 0) return; // Skip empty elements
        contents.push({
          type: 'paragraph',
          text: elementText,
          tag: tagName,
        });
      }
    } else if (tagName === 'img') {
      const src = $(element).attr('src');
      contents.push({
        type: 'image',
        src,
        tag: tagName,
      });
    } else {
      if (elementText.length === 0) return; // Skip empty elements
      contents.push({
        type: 'paragraph',
        text: elementText,
        tag: tagName,
      });
    }
  }

  // Detect the root element dynamically if there's no <html> or <body>
  const rootElement = $.root().children().first();

  // Process all children elements of the detected root element recursively
  processElement(rootElement);

  return contents;
}
