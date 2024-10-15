//@ts-nocheck
import prisma from '../config/prisma';

interface ChapterInfo {
  title: string;
  pageIndex: number;
  startPageIndex?: number;
  endPageIndex?: number;
}

export async function processPdfFile(
  fileData: ArrayBuffer,
  bookId: number
): Promise<void> {
  // Load the PDF document with pdf-lib
  const pdfDoc = await PDFDocument.load(fileData);

  // Extract the outline (table of contents) manually
  const outline = pdfDoc.catalog.get('Outlines');
  if (!outline) {
    throw new Error('The PDF file has no outline (table of contents).');
  }

  // Parse the outline to extract chapter information
  const chapters: ChapterInfo[] = [];
  const rootOutlineItems = outline.get('First');

  if (rootOutlineItems) {
    flattenOutline(rootOutlineItems, chapters, pdfDoc);
  }

  // Sort chapters by page index
  chapters.sort((a, b) => a.pageIndex - b.pageIndex);

  // Compute start and end page indices for each chapter
  for (let i = 0; i < chapters.length; i++) {
    const startPageIndex = chapters[i].pageIndex;
    const endPageIndex =
      i + 1 < chapters.length
        ? chapters[i + 1].pageIndex - 1
        : pdfDoc.getPageCount() - 1;
    chapters[i].startPageIndex = startPageIndex;
    chapters[i].endPageIndex = endPageIndex;
  }

  // Process each chapter
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    const textContent = extractTextFromPages(
      pdfDoc,
      chapter.startPageIndex!,
      chapter.endPageIndex!
    );

    // Create a chapter record
    const chapterRecord = await prisma.chapter.create({
      data: {
        order: i + 1,
        title: chapter.title || `Chapter ${i + 1}`,
        bookId: bookId,
      },
    });

    // Split text into passages (e.g., paragraphs)
    const passages = textContent.split('\n\n'); // Split on double newlines

    const passageData = passages
      .map((text, idx) => {
        const trimmedText = text.trim();
        if (!trimmedText) return null;
        return {
          textContent: trimmedText,
          order: idx,
          chapterId: chapterRecord.id,
          bookId: bookId,
        };
      })
      .filter(
        (
          data
        ): data is {
          textContent: string;
          order: number;
          chapterId: number;
          bookId: number;
        } => data !== null
      );

    if (passageData.length > 0) {
      await prisma.passage.createMany({
        data: passageData,
      });
    }
  }
}

function flattenOutline(
  outlineItem: any,
  chapters: ChapterInfo[],
  pdfDoc: PDFDocument,
  level: number = 0
): void {
  let currentOutlineItem = outlineItem;

  while (currentOutlineItem) {
    const title = currentOutlineItem.get('Title');
    const dest = currentOutlineItem.get('Dest');

    if (dest && dest.lookupMaybe(pdfDoc.context)) {
      const pageIndex = dest.lookup(pdfDoc.context).get('Index');

      chapters.push({
        title: title?.value() || `Chapter ${chapters.length + 1}`,
        pageIndex: pageIndex || 0,
      });
    }

    const firstChild = currentOutlineItem.get('First');
    if (firstChild) {
      flattenOutline(firstChild, chapters, pdfDoc, level + 1);
    }

    currentOutlineItem = currentOutlineItem.get('Next');
  }
}

function extractTextFromPages(
  pdfDoc: PDFDocument,
  startPageIndex: number,
  endPageIndex: number
): string {
  let textContent = '';
  for (let i = startPageIndex; i <= endPageIndex; i++) {
    const page = pdfDoc.getPage(i);
    const text = page.getTextContent(); // This will extract the text content of the page
    textContent += text.items.map((item: any) => item.str).join(' ') + '\n\n';
  }
  return textContent;
}
