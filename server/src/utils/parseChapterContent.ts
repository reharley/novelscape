import * as cheerio from 'cheerio';

export function parseChapterContent(text: string) {
  const $ = cheerio.load(text);
  const contents: any[] = [];

  //@ts-ignore
  function processElement(element: cheerio.Element) {
    const tagName = element.tagName?.toLowerCase() || '';

    const text = $(element).text().trim();
    if (/^h[1-6]$/.test(tagName)) {
      if (text.length === 0) return; // Skip empty elements
      contents.push({
        type: 'title',
        text: $(element).text(),
        size: tagName, // e.g., h1, h2
      });
    } else if (tagName === 'p') {
      const imagesInParagraph = $(element).find('img');
      if (imagesInParagraph.length > 0) {
        if (text.length === 0) return; // Skip empty elements
        imagesInParagraph.each((_, img) => {
          const src = $(img).attr('src');
          contents.push({
            type: 'paragraph',
            text: $(element).text(), // Extract text of the paragraph
            src, // Attach image source if present
          });
        });
      } else {
        if (text.length === 0) return; // Skip empty elements
        contents.push({
          type: 'paragraph',
          text: $(element).text(),
        });
      }
    } else if (tagName === 'div') {
      $(element)
        .children()
        .each((_, child) => {
          processElement(child);
        });
    } else if (tagName === 'img') {
      if (text.length === 0) return; // Skip empty elements
      const src = $(element).attr('src');
      contents.push({
        type: 'image',
        src,
      });
    } else {
      if (text.length === 0) return; // Skip empty elements
      contents.push({
        type: 'unknown',
        text: $(element).text(),
        tag: tagName,
      });
    }
  }

  // Process all body children elements recursively
  $('body')
    .children()
    .each((_, element) => {
      processElement(element);
    });

  return contents;
}
