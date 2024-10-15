import { Scene } from '@prisma/client';
import axios from 'axios';
import DOMPurify from 'dompurify';
import EPub from 'epub2';
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';
import pLimit from 'p-limit'; // Import p-limit for concurrency control
import path from 'path';

import prisma from '../config/prisma';
import { parseChapterContent } from '../utils/parseChapterContent';
import { processPdfFile } from '../utils/pdf';
import { progressManager } from '../utils/progressManager';
import { detectNewScene } from '../utils/prompts';

// Initialize DOMPurify
const { window } = new JSDOM('<!DOCTYPE html>');
const domPurify = DOMPurify(window);

export async function extractEpubPassagesAndChapters(
  bookId: number,
  epub: EPub
): Promise<void> {
  const chapters = epub.flow;

  if (chapters.length === 0) {
    progressManager.sendProgress(bookId, {
      status: 'error',
      message: 'No chapters found in the book.',
    });
    progressManager.closeAllClients(bookId);
    throw new Error('No chapters found in the book');
  }

  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Phase 1: Extracting passages and chapters...',
  });

  const concurrencyLimit = 5; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  const chaptersToProcess = chapters.slice(0, chapters.length);
  const totalChapters = chaptersToProcess.length;
  let processedChapters = 0;

  const tasks = chaptersToProcess.map((chapter) =>
    limit(async () => {
      const chapterId = chapter.id;
      if (!chapterId) return;
      if (!chapter.order) return;

      try {
        const text = await getChapterText(epub, chapterId);

        if (!text) {
          console.error(`Error: Chapter ${chapterId} is empty.`);
          progressManager.sendProgress(bookId, {
            status: 'error',
            message: `Chapter ${chapterId} is empty.`,
          });
          return;
        }

        const contents = parseChapterContent(text); // Parses the chapter content

        // Save chapter to the database
        const chapterRecord = await prisma.chapter.create({
          data: {
            order: chapter.order,
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
            const textContent = contentItem.text.trim();
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
        processedChapters += 1;
        progressManager.sendProgress(bookId, {
          status: 'phase_progress',
          phase: 'Phase 1',
          completed: processedChapters,
          total: totalChapters,
        });
      } catch (chapterError: any) {
        console.error(
          `Error processing chapter ${chapterId} in Phase 1:`,
          chapterError
        );
        progressManager.sendProgress(bookId, {
          status: 'error',
          message: `Error processing chapter ${chapterId}: ${chapterError.message}`,
        });
      }
    })
  );

  // Await all chapter processing tasks
  await Promise.all(tasks);

  progressManager.sendProgress(bookId, {
    status: 'phase_completed',
    phase: 'Phase 1',
    message: 'Passages and chapters extracted successfully.',
  });
}
export async function extractProfiles(bookId: number): Promise<void> {
  // Fetch the book from the database
  const book = await prisma.book.findUnique({
    where: { id: bookId },
  });

  if (!book) {
    throw new Error('Book not found in database.');
  }

  // Get the storageUrl
  const storageUrl = book.storageUrl;

  if (!storageUrl) {
    throw new Error('Book storageUrl is missing.');
  }

  // Fetch the book file from storageUrl
  const response = await axios.get<ArrayBuffer>(storageUrl, {
    responseType: 'arraybuffer',
  });

  // Get the file data
  const fileData = response.data;

  // Determine the file type
  const { fileTypeFromBuffer } = await import('file-type');
  const fileType = await fileTypeFromBuffer(fileData);

  if (!fileType) {
    throw new Error('Could not determine file type.');
  }

  if (fileType.ext === 'epub') {
    const epub = new EPub(storageUrl);

    epub.on('end', async () => {
      try {
        // **Phase 1: Extract Passages and Chapters**
        await extractEpubPassagesAndChapters(bookId, epub);
      } catch (error: any) {
        console.error(`Error processing book ${bookId}:`, error);
        progressManager.sendProgress(bookId, {
          status: 'error',
          message:
            error.message || 'An error occurred during profile extraction.',
        });
        progressManager.closeAllClients(bookId);
      }
    });
    epub.on('error', (err) => {
      console.error('Error parsing EPUB:', err);
      progressManager.sendProgress(bookId, {
        status: 'error',
        message: 'Error parsing EPUB file.',
      });
      progressManager.closeAllClients(bookId);
    });

    epub.parse();
  } else if (fileType.ext === 'pdf') {
    try {
      await processPdfFile(fileData, bookId);
    } catch (error: any) {
      console.error(`Error processing book ${bookId}:`, error);
      progressManager.sendProgress(bookId, {
        status: 'error',
        message:
          error.message || 'An error occurred during profile extraction.',
      });
      progressManager.closeAllClients(bookId);
    }
  } else {
    throw new Error('Unsupported file type: ' + fileType.ext);
  }

  // // **Phase 2: Extract Canonical Names**
  // await extractCanonicalNames(bookId);

  // **Phase 3: Process Passages with Context**
  // await processPassagesWithContext(bookId);

  // // **Phase 4: Detect Scenes**
  // await detectScenes(bookId);

  // Send completion status
  progressManager.sendProgress(bookId, {
    status: 'completed',
    message: 'All phases completed successfully.',
  });
  progressManager.closeAllClients(bookId);
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
export async function detectScenes(bookId: number): Promise<void> {
  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Phase 4: Detecting scenes...',
  });

  // Fetch all chapters ordered by their order
  const chapters = await prisma.chapter.findMany({
    where: { bookId: bookId },
    orderBy: { order: 'asc' },
    include: { passages: { orderBy: { order: 'asc' } } },
  });

  const totalChapters = chapters.length;
  let processedChapters = 0;
  let globalSceneOrder = 1; // To maintain global scene order across chapters

  const concurrencyLimit = 5; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  // Function to process each chapter
  const processChapter = async (chapter: (typeof chapters)[0]) => {
    const { id: chapterId, order: chapterOrder, passages } = chapter;

    let accumulatedPassages: string[] = [];
    let currentScene: Scene | null = null;

    for (const passage of passages) {
      let isNewScene = false;
      const contextText =
        accumulatedPassages.join(' ') + ' ' + passage.textContent;
      try {
        const sceneFlagResponse = await detectNewScene(
          contextText,
          passage.textContent
        );
        isNewScene = sceneFlagResponse.newScene || false;
      } catch (error: any) {
        console.error(
          `Error during scene detection in Chapter ${chapterOrder}:`,
          error
        );
        progressManager.sendProgress(bookId, {
          status: 'error',
          message: `Error during scene detection in Chapter ${chapterOrder}: ${error.message}`,
        });
        continue; // Skip to the next passage
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

    // Update progress after processing each chapter
    processedChapters += 1;
    progressManager.sendProgress(bookId, {
      status: 'phase_progress',
      phase: 'Phase 4',
      completed: processedChapters,
      total: totalChapters,
    });
  };

  // Limit the number of concurrent chapter processing tasks
  const chapterTasks = chapters.map((chapter) =>
    limit(() => processChapter(chapter))
  );

  // Await all chapter processing tasks
  await Promise.all(chapterTasks);

  progressManager.sendProgress(bookId, {
    status: 'phase_completed',
    phase: 'Phase 4',
    message: 'Scene detection completed successfully.',
  });
}

export async function extractAndSaveBookResources(
  epub: EPub,
  fileName: string,
  extractedDir: string
): Promise<void> {
  const manifestItems = Object.values(epub.manifest); // Extract manifest entries as an array
  const extractPath = path.join(extractedDir, fileName);

  // Use p-limit to control concurrency for file extraction
  const fileLimit = pLimit(5); // Adjust concurrency as needed

  const tasks = manifestItems.map((item) =>
    fileLimit(async () => {
      if (!item.id || !item.href) return;
      try {
        const data = await getFileAsync(epub, item.id);
        // Create the appropriate subdirectory if needed
        const outputPath = path.join(extractPath, item.href);
        const outputDir = path.dirname(outputPath);
        await fs.mkdirp(outputDir); // Asynchronously create directories

        // Write file to disk
        if (data) await fs.writeFile(outputPath, data);
      } catch (err: any) {
        console.error(`Error extracting file ${item.href}:`, err);
      }
    })
  );

  // Await all file extraction tasks
  await Promise.all(tasks);
}

async function getFileAsync(
  epub: EPub,
  fileId: string
): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    epub.getFile(fileId, (err, data, mimeType) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
}

// **Get Next Scene Order**
async function getNextSceneOrder(bookId: number): Promise<number> {
  const lastScene = await prisma.scene.findFirst({
    where: { bookId: bookId },
    orderBy: { order: 'desc' },
  });
  return lastScene ? lastScene.order + 1 : 1;
}

// **Get Chapter Raw Text Asynchronously**
export async function getChapterRawAsync(
  epub: EPub,
  chapterId: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    epub.getChapter(chapterId, (err, text) => {
      if (err) {
        reject(err);
      } else {
        resolve(text || '');
      }
    });
  });
}
