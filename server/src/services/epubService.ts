import { Book } from '@prisma/client';
import DOMPurify from 'dompurify';
import { EPub } from 'epub2';
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { isNumber } from 'util';
import prisma from '../config/prisma.js';
import {
  downloadFileFromAzure,
  uploadFileToAzure,
} from '../utils/azureStorage.js';
import { parseChapterContent } from '../utils/parseChapterContent.js';
import { detectNewScene } from '../utils/prompts.js';

// Initialize DOMPurify
const { window } = new JSDOM('<!DOCTYPE html>');
const domPurify = DOMPurify(window);

export async function extractEpubPassagesAndChapters(
  bookId: number,
  epub: EPub,
  jobId: number
): Promise<void> {
  const chapters = epub.flow;

  if (chapters.length < 2) {
    await prisma.processingJob.update({
      where: { id: jobId },
      data: { status: 'failed' },
    });
    throw new Error('No chapters found in the book');
  }

  await prisma.processingJob.update({
    where: { id: jobId },
    data: { status: 'in_progress', phase: 'Phase 1' },
  });

  const chaptersToProcess = chapters.slice(0, chapters.length);
  let totalChapters = chaptersToProcess.length;
  let processedChapters = 0;

  for (const chapter of chaptersToProcess) {
    const chapterId = chapter.id;
    if (!chapterId) {
      totalChapters--;
      continue;
    }
    if (!isNumber(chapter.order)) {
      totalChapters--;
      continue;
    }

    try {
      const text = await getChapterText(epub, chapterId);

      if (!text) {
        console.error(`Error: Chapter ${chapterId} is empty.`);
        continue;
      }

      const contents = parseChapterContent(text); // Parses the chapter content

      // Save chapter to the database
      const chapterRecord = await prisma.chapter.create({
        data: {
          order: chapter.order === 0 ? processedChapters : chapter.order,
          title: chapter.title || `Chapter ${chapter.order}`,
          bookId: bookId,
        },
      });

      const passageData = contents
        .filter(
          (contentItem) =>
            contentItem.type === 'paragraph' || contentItem.type === 'title'
        )
        .map((contentItem, idx) => {
          const textContent = contentItem.text.trim().replaceAll('\n', ' ');
          if (!textContent) return null;

          return {
            textContent,
            order: idx, // Ensure you have an order field
            chapterId: chapterRecord.id,
            bookId: bookId,
          };
        })
        .filter((data) => data !== null); // Filter out null values

      if (passageData.length > 0) {
        await prisma.passage.createMany({
          data: passageData as any[],
        });
      }

      // Update progress after processing each chapter
      processedChapters++;
      await prisma.processingJob.update({
        where: { id: jobId },
        data: {
          completedTasks: processedChapters,
          totalTasks: totalChapters,
        },
      });
    } catch (chapterError: any) {
      console.error(
        `Error processing chapter ${chapterId} in Phase 1:`,
        chapterError
      );
    }
  }

  // Optionally, update the job status to completed after all chapters are processed
  await prisma.processingJob.update({
    where: { id: jobId },
    data: { progress: 100 },
  });
}
function getChapterText(
  epub: EPub,
  chapterId: string
): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    epub.getChapter(chapterId, (error: any, text?: string) => {
      if (error) {
        reject(error);
      } else {
        resolve(text);
      }
    });
  });
}
export async function detectScenesForChapter(
  chapterId: number,
  jobId: number
): Promise<void> {
  // Fetch the specific chapter with its passages ordered by their order
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { passages: { orderBy: { order: 'asc' } }, book: true },
  });

  if (!chapter) {
    throw new Error('Chapter not found in database.');
  }

  const bookId = chapter.bookId;
  const passages = chapter.passages;
  let accumulatedPassages: string[] = [];
  let globalSceneOrder = 1; // To maintain global scene order across chapters
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: 'in_progress',
      phase: 'Phase 4',
      completedTasks: 0,
      totalTasks: passages.length,
    },
  });
  // Function to process the chapter
  const processChapter = async () => {
    const { order: chapterOrder } = chapter;

    // for (const passage of passages) {
    for (let i = 0; i < passages.length; i++) {
      const passage = passages[i];
      await prisma.processingJob.update({
        where: { id: jobId },
        data: { completedTasks: i + 1 },
      });
      let isNewScene = false;
      const contextText =
        accumulatedPassages.join(' ') + ' ' + passage.textContent;
      try {
        const sceneFlagResponse = await detectNewScene(
          contextText,
          passage.textContent,
          chapter.book.userId
        );
        isNewScene = sceneFlagResponse.newScene || false;
      } catch (error: any) {
        console.error(
          `Error during scene detection in Chapter ${chapterOrder}:`,
          error
        );
        continue;
      }
      accumulatedPassages.push(passage.textContent);

      if (isNewScene && accumulatedPassages.length > 1) {
        // Exclude the last passage which triggered the scene change
        const passagesToAssign = passages.filter((p, index) => {
          return (
            index < passages.findIndex((pass) => pass.id === passage.id) &&
            accumulatedPassages.includes(p.textContent)
          );
        });

        if (passagesToAssign.length > 0) {
          const scene = await prisma.scene.create({
            data: {
              chapterId,
              order: globalSceneOrder++,
              bookId: bookId,
            },
          });

          const passageIds = passagesToAssign.map((p) => p.id);

          await prisma.passage.updateMany({
            where: { id: { in: passageIds } },
            data: { sceneId: scene.id },
          });

          // Reset accumulated passages to start a new scene
          accumulatedPassages = [passage.textContent];
        }
      }
    }

    // Assign any remaining accumulated passages to a new scene
    if (accumulatedPassages.length > 0) {
      const remainingPassages = passages.filter((p) =>
        accumulatedPassages.includes(p.textContent)
      );

      if (remainingPassages.length > 0) {
        const scene = await prisma.scene.create({
          data: {
            chapterId: chapterId,
            order: globalSceneOrder++,
            bookId: bookId,
          },
        });

        const passageIds = remainingPassages.map((p) => p.id);

        await prisma.passage.updateMany({
          where: { id: { in: passageIds } },
          data: { sceneId: scene.id },
        });
      }
    }
  };

  await processChapter();
}

export const processEpubCoverImage = async (book: Book) => {
  const bookId = book.id;
  try {
    const epub = await getEpub(book.storageUrl);
    const metadata = epub.metadata;

    let coverId = metadata.cover;

    if (!coverId) {
      coverId = epub.manifest['cover-image']?.id;
    }

    const coverImage = await epub.getFileAsync(coverId);

    if (!coverImage) {
      throw new Error('Failed to retrieve cover image from EPUB.');
    }

    // const coverImageBuffer = Buffer.from(coverImage[0]);
    const filename = `cover-${book.id}.jpg`;

    const coverImageUrl = await uploadFileToAzure(
      coverImage[0],
      filename,
      'images'
    );

    // Update the Book record with the cover URL in the database
    await prisma.book.update({
      where: { id: book.id },
      data: { coverUrl: coverImageUrl }, // Assuming the `storageUrl` field stores the cover URL
    });

    return coverImageUrl;
  } catch (error) {
    console.error(
      `Error processing EPUB cover image for book ID ${bookId}:`,
      error
    );
    throw error;
  }
};

export async function getEpub(storageUrl: string) {
  const tempDir = os.tmpdir();
  const tempFilePath = path.join(tempDir, `book-${uuidv4()}.epub`);
  await downloadFileFromAzure(storageUrl, 'books', tempFilePath);

  const fileExists = await fs
    .access(tempFilePath)
    .then(() => true)
    .catch(() => false);

  if (!fileExists) {
    await fs.unlink(tempFilePath);
    throw new Error('File was not created or cannot be accessed.');
  }
  const epub = new EPub(tempFilePath);
  await parseEpub(epub);
  // cleanup the temporary file after parsing
  await fs.unlink(tempFilePath);

  return epub;
}

function parseEpub(epub: EPub): Promise<void> {
  return new Promise((resolve, reject) => {
    epub.on('end', () => {
      resolve();
    });

    epub.on('error', (err) => {
      reject(err);
    });

    epub.parse();
  });
}
