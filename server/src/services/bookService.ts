import pLimit from 'p-limit';

import prisma from '../config/prisma.js';
import {
  extractFullNames,
  identifySpeakersInPassage,
  performNERWithAliases,
} from '../utils/prompts.js';
import { PassageWithProfileSpeaker } from '../utils/types.js';
import { extractEpubPassagesAndChapters, getEpub } from './epubService.js';

export async function extractPassageAndChapters(bookId: number, jobId: number) {
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

  const epub = await getEpub(storageUrl);
  await extractEpubPassagesAndChapters(bookId, epub, jobId);
}

export async function extractCanonicalNames(
  bookId: number,
  jobId: number
): Promise<void> {
  const concurrencyLimit = 20;
  const limit = pLimit(concurrencyLimit);

  const passages = await prisma.passage.findMany({
    where: { bookId },
    select: { textContent: true },
  });
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      phase: 'Phase 2',
      completedTasks: 0,
      totalTasks: passages.length,
    },
  });

  const book = await prisma.book.findUnique({
    where: { id: bookId },
  });
  if (!book) {
    throw new Error('Book not found in database.');
  }

  let processedPassages = 0;

  const tasks = passages.map((passage) =>
    limit(async () => {
      processedPassages += 1;
      await prisma.processingJob.update({
        where: { id: jobId },
        data: { completedTasks: processedPassages },
      });
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
      } catch (apiError: any) {
        console.error('Error with OpenAI API (canonical NER):', apiError);
      }
    })
  );

  await Promise.all(tasks);
}

export async function processPassagesWithContextForChapter(
  chapterId: number,
  jobId: number
): Promise<void> {
  const concurrencyLimit = 18;
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

  await prisma.processingJob.update({
    where: { id: jobId },
    data: { phase: 'Phase 3', completedTasks: 0, totalTasks: passages.length },
  });

  let processedPassages = 0;
  const bookId = chapter.bookId;
  const canonicalNames = await getCanonicalNames(bookId);

  const tasks = passages.map((passage) =>
    limit(async () => {
      processedPassages += 1;
      await prisma.processingJob.update({
        where: { id: jobId },
        data: { completedTasks: processedPassages },
      });
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
              const entityName = entity.fullName ?? entity.alias;
              let profile;
              if (entityName) {
                const words = entityName.split(' ');
                // Check for capitalization for first letter of each word
                let valid = true;
                for (const word of words) {
                  if (word[0] !== word[0].toUpperCase()) {
                    valid = false;
                    break;
                  }
                }
                if (!valid) {
                  return;
                } // Skip if not capitalized
                const entityAliases = identifyAliases(
                  entityName,
                  canonicalNames
                );
                if (entityAliases.length === 0) {
                  console.log(
                    'Could skip entity without a valid canonical name:',
                    entity.fullName,
                    entity.alias
                  );
                }
                profile = await prisma.profile.upsert({
                  where: {
                    name_bookId: {
                      name: entityName,
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
                    name: entityName,
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
      } catch (apiError: any) {
        console.error('Error with OpenAI API (NER):', apiError);
      }
    })
  );

  await Promise.all(tasks);
}

export async function processSpeechPassagesForChapter(
  chapterId: number,
  jobId: number
): Promise<void> {
  // Fetch the chapter
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    include: { book: true },
  });
  if (!chapter) {
    throw new Error('Chapter not found in database.');
  }

  // Update chapter to indicate it's processed
  // await prisma.chapter.update({
  //   where: { id: chapterId },
  //   data: { speechProcessed: true },
  // });

  // Fetch all passages for the specific chapter
  const passages = await prisma.passage.findMany({
    where: {
      chapterId: chapterId,
    },
    include: { chapter: true, book: true, profiles: true, speaker: true },
  });

  // Build a map of passages by order for quick lookup
  const passagesByOrder = new Map<number, PassageWithProfileSpeaker>();
  for (const passage of passages) {
    passagesByOrder.set(passage.order, passage);
  }

  // Process each passage sequentially
  for (const passage of passages) {
    const textContent = passage.textContent.trim();
    if (!textContent) continue;

    // Get the previous passages
    const previousPassages = [
      passagesByOrder.get(passage.order - 5),
      passagesByOrder.get(passage.order - 4),
      passagesByOrder.get(passage.order - 3),
      passagesByOrder.get(passage.order - 2),
      passagesByOrder.get(passage.order - 1),
    ].filter((p) => p !== undefined);

    const passagesProfiles = passage.profiles.concat(
      previousPassages.flatMap((p) => p?.profiles)
    );
    const uniqueProfilesMap = new Map(
      passagesProfiles.map((profile) => [profile.id, profile])
    );

    // Convert the Map values back to an array
    const uniqueProfiles = Array.from(uniqueProfilesMap.values());

    // Filter out any undefined values
    const contextText = previousPassages
      .filter((p) => p !== undefined)
      .map(
        (p: any, idx) =>
          `Passage ${idx + 1}) ${
            p.speaker ? `Speaker: ${p.speaker.name}` : ''
          }\n${p.textContent}`
      )
      .join('\n');

    try {
      // Identify speakers in the passage
      const speechEntry = await identifySpeakersInPassage(
        `Passage ${
          previousPassages.length ? previousPassages.length + 1 + ') ' : ''
        }${textContent}`,
        contextText,
        previousPassages,
        uniqueProfiles.map((p) => p.name),
        chapter.book.userId
      );

      const { speaker, speech } = speechEntry;

      let speakerProfileId: number | null = null;
      let speakerProfile;
      if (speaker === 'NONE' || !speaker) {
        speakerProfileId = null;
      } else if (speaker === 'UNKNOWN') {
        speakerProfileId = 0;
      } else {
        let profile = uniqueProfiles.find(
          (p) => p.name.toLowerCase() === speaker.toLowerCase()
        );
        if (profile) {
          speakerProfileId = profile.id;
          speakerProfile = profile;
        }
      }

      // Update the passage with the speakerId
      if (speakerProfileId) {
        await prisma.passage.update({
          where: { id: passage.id },
          data: {
            speakerId: speakerProfileId,
          },
        });
        passage.speakerId = speakerProfileId;
        if (speakerProfile) passage.speaker = speakerProfile;
      }
    } catch (error) {
      console.error(
        `Error identifying speaker for passage id ${passage.id}:`,
        error
      );
    }
  }
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
