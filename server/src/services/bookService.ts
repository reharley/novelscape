import pLimit from 'p-limit';

import prisma from '../config/prisma.js';
import { progressManager } from '../utils/progressManager.js';
import { extractFullNames, performNERWithAliases } from '../utils/prompts.js';
import { extractEpubPassagesAndChapters, getEpub } from './epubService.js';

export async function extractPassageAndChapters(bookId: number) {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
  });

  if (!book) {
    throw new Error('Book not found in database.');
  }

  const storageUrl = book.storageUrl;

  if (!storageUrl) {
    throw new Error('Book storageUrl is missing.');
  }

  try {
    const epub = await getEpub(storageUrl);
    await extractEpubPassagesAndChapters(bookId, epub);
  } catch (error: any) {
    console.error(`Error processing book ${bookId}:`, error);
    progressManager.sendProgress(bookId, {
      status: 'error',
      message: error.message || 'An error occurred during profile extraction.',
    });
    progressManager.closeAllClients(bookId);
  }
}

export async function extractCanonicalNames(bookId: number): Promise<void> {
  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Phase 2: Extracting canonical character names...',
  });

  const concurrencyLimit = 5; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  // Fetch all passages for the book
  const passages = await prisma.passage.findMany({
    where: { bookId },
    select: { textContent: true },
  });

  const totalPassages = passages.length;
  const book = await prisma.book.findUnique({
    where: { id: bookId },
  });
  if (!book) {
    throw new Error('Book not found in database.');
  }

  let processedPassages = 0;

  const tasks = passages.map((passage) =>
    limit(async () => {
      const textContent = passage.textContent.trim();
      if (!textContent) return;

      try {
        const canonicalEntities = await extractFullNames(
          textContent,
          book.userId
        );
        if (!canonicalEntities || !Array.isArray(canonicalEntities)) return;
        try {
          for (const entityObject of canonicalEntities) {
            const entity = entityObject.name;
            if (!entity) {
              console.log('Skipping entity without a name:', entity);
              continue;
            }
            if (entityObject.type.toUpperCase() !== 'PERSON') continue;

            const words = entity.split(' ');
            if (words.length !== 2) continue; // Skip if not a full name
            if (words[0].includes('.')) continue; // Skip if first word contains a period
            if (
              words[0] === 'Uncle' ||
              words[0] === 'Aunt' ||
              words[0] === 'Auntie' ||
              words[0] === 'The' ||
              words[0] === 'Professor'
            )
              continue;
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
                type: 'PERSON',
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

export async function processPassagesWithContextForChapter(
  chapterId: number
): Promise<void> {
  progressManager.sendProgress(chapterId, {
    status: 'phase',
    phase: 'Phase 3',
  });

  const concurrencyLimit = 7; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true },
  });
  if (!chapter) {
    throw new Error('Chapter not found in database.');
  }

  // Fetch all passages for the specific chapter
  const passages = await prisma.passage.findMany({
    where: {
      bookId: chapter.bookId,
      chapterId: chapterId, // Only fetch passages for the specific chapter
    },
    include: { chapter: true, book: true },
  });

  const totalPassages = passages.length;
  let processedPassages = 0;
  const bookId = chapter.bookId;
  const canonicalNames = await getCanonicalNames(bookId);

  const tasks = passages.map((passage) =>
    limit(async () => {
      const textContent = passage.textContent.trim();
      if (!textContent) return;

      try {
        // Fetch canonical names from profiles
        const aliases = identifyAliases(textContent, canonicalNames);

        // Send text to OpenAI API for NER with aliases
        const entities = await performNERWithAliases(
          textContent,
          aliases,
          chapter.book.userId
        );

        // Handle Entities
        if (entities && Array.isArray(entities)) {
          await Promise.all(
            entities.map(async (entity) => {
              if (!entity.fullName && !entity.alias) return;

              // Upsert Profile
              let profile;
              if (entity.fullName && canonicalNames.includes(entity.fullName)) {
                profile = await prisma.profile.upsert({
                  where: {
                    name_bookId: {
                      name: entity.fullName,
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
                    name: entity.fullName,
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
        progressManager.sendProgress(chapterId, {
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

  progressManager.sendProgress(chapterId, {
    status: 'phase_completed',
    phase: 'Phase 3',
    message: 'Passages processed with context for the chapter successfully.',
  });
}

export async function getCanonicalNames(bookId: number): Promise<string[]> {
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
