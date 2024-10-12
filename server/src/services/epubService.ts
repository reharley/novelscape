import { Scene } from '@prisma/client';
import DOMPurify from 'dompurify';
import EPub from 'epub2';
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';
import pLimit from 'p-limit'; // Import p-limit for concurrency control
import path from 'path';
import prisma from '../config/prisma';
import { parseChapterContent } from '../utils/parseChapterContent';
import { progressManager } from '../utils/progressManager';
import {
  detectNewScene,
  extractFullNames,
  performNERWithAliases,
} from '../utils/prompts';

// Initialize DOMPurify
const { window } = new JSDOM('<!DOCTYPE html>');
const domPurify = DOMPurify(window);

export async function extractPassagesAndChapters(
  bookId: string,
  epub: EPub,
  extractedDir: string
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

  // Limit to the first 10 chapters for demonstration; adjust as needed
  const chaptersToProcess = chapters.slice(0, chapters.length);
  const totalChapters = chaptersToProcess.length;
  let processedChapters = 0;

  const tasks = chaptersToProcess.map((chapter) =>
    limit(async () => {
      const chapterId = chapter.id;
      if (!chapterId) return;
      if (!chapter.order) return;

      try {
        const text = await epub.getChapterAsync(chapterId);
        // const text = await getChapterRawAsync(epub, chapterId);

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
            data: passageData,
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
export async function extractProfiles(
  bookId: string,
  booksDir: string,
  extractedDir: string
): Promise<void> {
  const bookPath = path.join(booksDir, bookId);

  // Check if the book exists
  if (!(await fs.pathExists(bookPath))) {
    throw new Error('Book not found.');
  }

  // Upsert the book with id as filename
  await prisma.book.upsert({
    where: { id: bookId },
    update: {},
    create: {
      id: bookId,
      title: path.parse(bookId).name,
    },
  });

  // Initialize and parse the EPUB
  const epub = new EPub(bookPath);

  epub.on('end', async () => {
    try {
      // **Phase 1: Extract Passages and Chapters**
      await extractPassagesAndChapters(bookId, epub, extractedDir);

      // **Phase 2: Extract Canonical Names**
      await extractCanonicalNames(bookId);

      // **Phase 3: Process Passages with Context**
      await processPassagesWithContext(bookId);

      // **Phase 4: Detect Scenes**
      await detectScenes(bookId);

      // **Finalizing: Extract and Save Book Resources**
      await extractAndSaveBookResources(epub, bookId, extractedDir);

      // Send completion status
      progressManager.sendProgress(bookId, {
        status: 'completed',
        message: 'All phases completed successfully.',
      });
      progressManager.closeAllClients(bookId);
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

  epub.parse();
}
export async function detectScenes(bookId: string): Promise<void> {
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
  bookId: string,
  extractedDir: string
): Promise<void> {
  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Finalizing: Extracting book resources...',
  });

  const manifestItems = Object.values(epub.manifest); // Extract manifest entries as an array
  const extractPath = path.join(extractedDir, bookId);

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
        progressManager.sendProgress(bookId, {
          status: 'file_extracted',
          file: item.href,
        });
      } catch (err: any) {
        console.error(`Error extracting file ${item.href}:`, err);
        progressManager.sendProgress(bookId, {
          status: 'error',
          message: `Error extracting file ${item.href}: ${err.message}`,
        });
      }
    })
  );

  // Await all file extraction tasks
  await Promise.all(tasks);

  progressManager.sendProgress(bookId, {
    status: 'phase_completed',
    phase: 'Finalizing',
    message: 'Book resources extracted successfully.',
  });
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

export async function extractCanonicalNames(bookId: string): Promise<void> {
  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Phase 2: Extracting canonical character names...',
  });

  const concurrencyLimit = 5; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  // Fetch all passages for the book
  const passages = await prisma.passage.findMany({
    where: { bookId: bookId },
    select: { textContent: true },
  });

  const totalPassages = passages.length;
  let processedPassages = 0;

  const tasks = passages.map((passage) =>
    limit(async () => {
      const textContent = passage.textContent.trim();
      if (!textContent) return;

      try {
        // Send text to OpenAI API for canonical NER
        const canonicalEntities = await extractFullNames(textContent);
        if (!canonicalEntities || !Array.isArray(canonicalEntities)) return;
        // Upsert canonical profiles
        try {
          for (const entity of canonicalEntities) {
            if (!entity) {
              console.log('Skipping entity without a name:', entity);
              continue;
            }

            const words = entity.split(' ');
            if (words.length !== 2) continue; // Skip if not a full name
            if (words[0].includes('.')) continue; // Skip if first word contains a period
            if (
              words[0].startsWith('Uncle') ||
              words[0].startsWith('Aunt') ||
              words[0].startsWith('The ') ||
              words[0].startsWith('Professor')
            )
              continue; // Skip if first word contains a period
            if (entity.toUpperCase() === entity) continue; // Skip if all caps
            // Check for capitalization for first letter of each word
            let valid = true;
            for (const word of words) {
              if (word[0] !== word[0].toUpperCase()) {
                valid = false;
                break;
              }
            }
            if (!valid) continue; // Skip if not capitalized

            // Upsert the canonical name into the database
            await prisma.profile.upsert({
              where: {
                name_bookId: {
                  name: entity,
                  bookId: bookId,
                },
              },
              update: {},
              create: {
                name: entity,
                type: 'CHARACTER',
                bookId: bookId,
              },
            });
          }
        } catch (e) {
          console.error('Error upserting canonical profiles:', e);
        }
        // Update progress after processing each passage
        processedPassages += 1;
        progressManager.sendProgress(bookId, {
          status: 'phase_progress',
          phase: 'Phase 2',
          completed: processedPassages,
          total: totalPassages,
        });
      } catch (apiError: any) {
        console.error('Error with OpenAI API (canonical NER):', apiError);
        progressManager.sendProgress(bookId, {
          status: 'error',
          message: `OpenAI API error during canonical NER: ${apiError.message}`,
        });
      }
    })
  );

  // Await all passage processing tasks
  await Promise.all(tasks);

  progressManager.sendProgress(bookId, {
    status: 'phase_completed',
    phase: 'Phase 2',
    message: 'Canonical character names extracted successfully.',
  });
}

export async function processPassagesWithContext(
  bookId: string
): Promise<void> {
  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Phase 3: Processing passages with context...',
  });

  const concurrencyLimit = 7; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  // Fetch all passages for the book
  const passages = await prisma.passage.findMany({
    where: { bookId: bookId },
    include: { chapter: true },
  });

  const totalPassages = passages.length;
  let processedPassages = 0;
  const canonicalNames = await getCanonicalNames(bookId);

  const tasks = passages.map((passage) =>
    limit(async () => {
      const textContent = passage.textContent.trim();
      if (!textContent) return;

      try {
        // Fetch canonical names from profiles
        const aliases = identifyAliases(textContent, canonicalNames);

        // Send text to OpenAI API for NER with aliases
        const entities = await performNERWithAliases(textContent, aliases);

        // Handle Entities
        if (entities && Array.isArray(entities)) {
          await Promise.all(
            entities.map(async (entity) => {
              if (!entity.fullName && !entity.alias) return;

              // Determine canonical name
              const canonicalName = entity.fullName || entity.alias || '';

              // Upsert Profile
              let profile;
              if (entity.fullName && canonicalNames.includes(canonicalName)) {
                profile = await prisma.profile.upsert({
                  where: {
                    name_bookId: {
                      name: canonicalName,
                      bookId: bookId,
                    },
                  },
                  update: {
                    gender: entity.gender
                      ? entity.gender.toUpperCase()
                      : undefined,
                    type: entity.type ? entity.type.toUpperCase() : undefined,
                  },
                  create: {
                    type: entity.type ? entity.type.toUpperCase() : undefined,
                    name: canonicalName,
                    gender: entity.gender
                      ? entity.gender.toUpperCase()
                      : undefined,
                    bookId: bookId,
                  },
                });
              } else {
                console.log(
                  'Skipping entity without a valid canonical name:',
                  entity.fullName,
                  entity.alias
                );
                return;
              }

              // Handle Alias
              try {
                if (entity.alias && entity.fullName && profile) {
                  await prisma.alias.upsert({
                    where: {
                      name_profileId: {
                        name: entity.alias,
                        profileId: profile.id,
                      },
                    },
                    update: {},
                    create: {
                      name: entity.alias,
                      profileId: profile.id,
                    },
                  });
                } else {
                  console.log(
                    'Skipping alias:',
                    entity.alias,
                    entity.fullName,
                    profile?.id
                  );
                }
              } catch (e) {
                console.error('Error upserting alias:', e);
              }

              // Create Description linked to Profile and Passage
              if (entity.description) {
                await prisma.description.create({
                  data: {
                    text: entity.description,
                    appearance: entity.appearance?.join(', ') ?? null,
                    bookId: bookId,
                    profileId: profile.id,
                    passageId: passage.id,
                  },
                });
              }

              // Link Profile to Passage
              await prisma.passage.update({
                where: { id: passage.id },
                data: {
                  profiles: {
                    connect: { id: profile.id },
                  },
                },
              });
            })
          );
        }

        // Update progress after processing each passage
        processedPassages += 1;
        progressManager.sendProgress(bookId, {
          status: 'phase_progress',
          phase: 'Phase 3',
          completed: processedPassages,
          total: totalPassages,
        });
      } catch (apiError: any) {
        console.error('Error with OpenAI API (NER):', apiError);
      }
    })
  );

  // Await all passage processing tasks
  await Promise.all(tasks);

  progressManager.sendProgress(bookId, {
    status: 'phase_completed',
    phase: 'Phase 3',
    message: 'Passages processed with context successfully.',
  });
}

// **Get Next Scene Order**
async function getNextSceneOrder(bookId: string): Promise<number> {
  const lastScene = await prisma.scene.findFirst({
    where: { bookId: bookId },
    orderBy: { order: 'desc' },
  });
  return lastScene ? lastScene.order + 1 : 1;
}

function identifyAliases(text: string, canonicalNames: string[]): string[] {
  const aliases: string[] = [];

  for (const fullName of canonicalNames) {
    const nameParts = fullName.split(' ');
    for (const part of nameParts) {
      const regex = new RegExp(
        `\\b(?:Mr\\.|Mrs\\.|Ms\\.|Prof\\.|Professor)?\\s*${part}\\b`,
        'i'
      );
      if (regex.test(text) && !aliases.includes(fullName)) {
        aliases.push(fullName);
      }
    }
  }

  return aliases;
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

export async function getCanonicalNames(bookId: string): Promise<string[]> {
  const profiles = await prisma.profile.findMany({
    where: {
      bookId: bookId,
      type: 'PERSON',
    },
    select: {
      name: true,
    },
  });

  return profiles.map((profile) => profile.name);
}
