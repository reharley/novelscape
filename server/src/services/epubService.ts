import DOMPurify from 'dompurify';
import EPub from 'epub2';
import { Response } from 'express';
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';
import pLimit from 'p-limit'; // Import p-limit for concurrency control
import path from 'path';
import openai from '../config/openai';
import prisma from '../config/prisma';
import { parseChapterContent } from '../utils/parseChapterContent';

// Initialize DOMPurify
const { window } = new JSDOM('<!DOCTYPE html>');
const domPurify = DOMPurify(window);

// Define interfaces for clarity
interface Entity {
  fullName?: string;
  alias?: string;
  type?: string;
  description?: string;
}

export async function extractProfiles(
  bookId: string,
  booksDir: string,
  extractedDir: string,
  res: Response
) {
  const bookPath = path.join(booksDir, bookId);

  // Check if the book exists
  if (!(await fs.pathExists(bookPath))) {
    throw new Error('Book not found.');
  }

  // Upsert the book with id as filename
  const book = await prisma.book.upsert({
    where: { id: bookId },
    update: {},
    create: {
      id: bookId,
      title: path.parse(bookId).name,
    },
  });

  const epub = new EPub(bookPath);

  epub.on('end', async () => {
    const chapters = epub.flow;

    if (chapters.length === 0) {
      throw new Error('No chapters found in the book');
    }

    // **Phase 1: Extract Canonical Names for the Entire Book**
    console.log('Phase 1: Extracting canonical character names...');
    const canonicalNames = await extractCanonicalNames(epub, chapters, book);
    console.log(`Extracted ${canonicalNames.length} canonical names.`);

    // **Phase 2: Process Passages with Context, Alias Handling, and Scene Tracking**
    console.log(
      'Phase 2: Processing passages with context and alias handling...'
    );
    await processPassagesWithContext(epub, chapters, book, canonicalNames);
    console.log('Passage processing completed.');

    // **Finalizing: Extract and Save Book Resources**
    console.log('Finalizing: Extracting book resources...');
    const manifestItems = Object.values(epub.manifest); // Extract manifest entries as an array
    const extractPath = path.join(extractedDir, bookId);

    // Use p-limit to control concurrency for file extraction
    const fileLimit = pLimit(5); // Adjust concurrency as needed

    await Promise.all(
      manifestItems.map((item) =>
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
            console.log(`Extracted: ${item.href}`);
          } catch (err) {
            console.error(`Error extracting file ${item.href}:`, err);
          }
        })
      )
    );

    res.json({ message: 'Entities extracted and saved successfully.' });
  });

  epub.parse();
}

// **Phase 1: Extract Canonical Names for the Entire Book**
async function extractCanonicalNames(
  epub: EPub,
  chapters: any[],
  book: any
): Promise<string[]> {
  const canonicalNamesSet = new Set<string>();
  const concurrencyLimit = 5; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  // Limit to the first 10 chapters for demonstration; adjust as needed
  const chaptersToProcess = chapters.slice(0, 10);

  // Map each chapter to a limited async task
  const tasks = chaptersToProcess.map((chapter) =>
    limit(async () => {
      const chapterId = chapter.id;
      if (!chapterId) return;
      if (!chapter.order) return;
      try {
        const text = await getChapterRawAsync(epub, chapterId);
        if (!text) {
          console.error(`Error: Chapter ${chapterId} is empty.`);
          return;
        }

        const contents = parseChapterContent(text); // Parses the chapter content

        // Process each content item asynchronously
        await Promise.all(
          contents.map(async (contentItem) => {
            if (
              contentItem.type === 'paragraph' ||
              contentItem.type === 'title'
            ) {
              const textContent = contentItem.text.trim();
              if (!textContent) return;

              try {
                // Send text to OpenAI API for canonical NER
                const canonicalResponse = await openai.chat.completions.create({
                  model: 'gpt-3.5-turbo',
                  messages: [
                    {
                      role: 'system',
                      content: `You are an assistant that performs named entity recognition (NER) to identify complete (full) character names. Extract only the entities of type 'Character' with their full names present from the following text and provide them as a JSON array of strings.`,
                    },
                    {
                      role: 'user',
                      content: `Extract full character names from the following text:\n\n${textContent}`,
                    },
                  ],
                  max_tokens: 500,
                });

                let assistantMessage =
                  canonicalResponse.choices[0].message?.content || '';
                assistantMessage = sanitizeAssistantMessage(assistantMessage);

                let canonicalEntities: string[] = [];
                try {
                  canonicalEntities = JSON.parse(assistantMessage);
                } catch (parseError) {
                  console.error('JSON parse error (canonical):', parseError);
                  const jsonMatch = assistantMessage.match(/\[.*\]/s);
                  if (jsonMatch) {
                    const regex = /\,(?=\s*?[\}\]])/g;
                    const cleanMatch = jsonMatch[0].replace(regex, '');
                    canonicalEntities = JSON.parse(cleanMatch);
                  } else {
                    console.error(
                      'Failed to parse canonical entities as JSON.'
                    );
                    return; // Skip if unable to parse
                  }
                }

                // Upsert canonical profiles
                for (const entity of canonicalEntities) {
                  if (!entity) {
                    console.log('Skipping entity without a name:', entity);
                    continue;
                  }
                  const titleCheck = entity.toLowerCase();
                  if (
                    titleCheck.startsWith('mr. ') ||
                    titleCheck.startsWith('ms. ') ||
                    titleCheck.startsWith('mrs. ') ||
                    titleCheck.startsWith('professor ') ||
                    titleCheck.startsWith('the ') ||
                    titleCheck.startsWith('dr. ') ||
                    titleCheck.startsWith('prof. ') ||
                    titleCheck.startsWith('doctor ') ||
                    titleCheck.startsWith('uncle ') ||
                    titleCheck.startsWith('aunt ')
                  )
                    continue; // Skip titles
                  if (entity.split(' ').length < 2) continue; // Skip single-word names
                  // Check for capitalization for first letter of each word
                  const words = entity.split(' ');
                  let valid = true;
                  for (const word of words) {
                    if (word[0] !== word[0].toUpperCase()) {
                      valid = false;
                      break;
                    }
                  }
                  if (!valid) continue; // Skip if not capitalized

                  canonicalNamesSet.add(entity);

                  await prisma.profile.upsert({
                    where: {
                      name_bookId: {
                        name: entity,
                        bookId: book.id,
                      },
                    },
                    update: {},
                    create: {
                      name: entity,
                      type: 'CHARACTER',
                      bookId: book.id,
                    },
                  });
                }
              } catch (apiError) {
                console.error(
                  'Error with OpenAI API (canonical NER):',
                  apiError
                );
              }
            }
          })
        );
      } catch (chapterError) {
        console.error(
          `Error processing chapter ${chapterId} in Phase 1:`,
          chapterError
        );
      }
    })
  );

  // Await all chapter processing tasks
  await Promise.all(tasks);

  return Array.from(canonicalNamesSet);
}

// **Phase 2: Process Passages with Context, Alias Handling, and Scene Tracking**
async function processPassagesWithContext(
  epub: EPub,
  chapters: any[],
  book: any,
  canonicalNames: string[]
) {
  const concurrencyLimit = 3; // Adjust based on your system's capabilities
  const limit = pLimit(concurrencyLimit);

  // Limit to the first 10 chapters for demonstration; adjust as needed
  const chaptersToProcess = chapters.slice(0, 10);

  // Map each chapter to a limited async task
  const tasks = chaptersToProcess.map((chapter) =>
    limit(async () => {
      const chapterId = chapter.id;
      if (!chapterId) return;
      if (!chapter.order) return;

      try {
        const text = await getChapterRawAsync(epub, chapterId);
        if (!text) {
          console.error(`Error: Chapter ${chapterId} is empty.`);
          return;
        }

        const chapterTitle = chapter.title || `Chapter ${chapter.order}`;
        const contents = parseChapterContent(text); // Parses the chapter content

        const chapterRecord = await prisma.chapter.create({
          data: {
            order: chapter.order,
            title: chapterTitle,
            contents: contents, // Assuming contents is a JSON object
            bookId: book.id,
          },
        });

        let passageCounter = 1;
        let currentScene: any = null;
        let accumulatedPassages: string[] = []; // For context until a new scene

        // Process each content item sequentially to maintain passage order and scene tracking
        for (const contentItem of contents) {
          try {
            if (
              contentItem.type === 'paragraph' ||
              contentItem.type === 'title'
            ) {
              const textContent = contentItem.text.trim();
              if (!textContent) continue;

              // Add current passage to accumulated context
              accumulatedPassages.push(textContent);

              // Create Passage entry without scene for now
              const passage = await prisma.passage.create({
                data: {
                  textContent,
                  order: passageCounter++,
                  bookId: book.id,
                  chapterId: chapterRecord.id,
                },
              });

              // Prepare context: all accumulated passages until newScene
              const contextText = accumulatedPassages.join('\n\n');

              // Detect if a new scene starts using accumulatedPassages
              const sceneFlagResponse = await detectNewScene(contextText);
              const isNewScene = sceneFlagResponse.newScene || false;

              if (isNewScene) {
                // Create a new Scene
                currentScene = await prisma.scene.create({
                  data: {
                    order: await getNextSceneOrder(book.id),
                    bookId: book.id,
                  },
                });

                // Associate the passage with the new scene
                await prisma.passage.update({
                  where: { id: passage.id },
                  data: { sceneId: currentScene.id },
                });

                // Reset accumulated passages
                accumulatedPassages = [];
              } else {
                // Associate with the current scene if exists
                if (currentScene) {
                  await prisma.passage.update({
                    where: { id: passage.id },
                    data: { sceneId: currentScene.id },
                  });
                }
              }

              // Identify aliases in the current passage
              const aliases = identifyAliases(textContent, canonicalNames);
              let entities: Entity[] = [];
              try {
                // Send text to OpenAI API for NER with aliases
                entities = await performNERWithAliases(contextText, aliases);

                // Handle Entities
                if (entities && Array.isArray(entities)) {
                  await Promise.all(
                    entities.map(async (entity) => {
                      if ((!entity.fullName && !entity.alias) || !entity.type)
                        return;

                      // Handle 'Scene' type separately if needed
                      if (entity.type.toUpperCase() === 'SCENE') {
                        return; // Skipping as scenes are handled via sceneFlag
                      }

                      // Determine canonical name
                      const canonicalName =
                        entity.fullName || entity.alias || '';

                      // Upsert Profile
                      const profile = await prisma.profile.upsert({
                        where: {
                          name_bookId: {
                            name: canonicalName,
                            bookId: book.id,
                          },
                        },
                        update: {
                          type: entity.type.toUpperCase(),
                        },
                        create: {
                          name: canonicalName,
                          type: entity.type.toUpperCase(),
                          bookId: book.id,
                        },
                      });

                      // Handle Alias
                      if (entity.alias && entity.fullName) {
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
                      }

                      // Create Description linked to Profile and Passage
                      if (entity.description) {
                        await prisma.description.create({
                          data: {
                            text: entity.description,
                            bookId: book.id,
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
              } catch (apiError) {
                console.error('Error with OpenAI API (NER):', apiError);
              }
            }
          } catch (e) {
            console.log('Problem with passage:', e);
          }
        }
      } catch (chapterError) {
        console.error(
          `Error processing chapter ${chapterId} in Phase 2:`,
          chapterError
        );
      }
    })
  );

  // Await all chapter processing tasks
  await Promise.all(tasks);
}

// **Helper Functions**

// **Phase 2: Perform NER with Aliases (Scene Detection Removed)**
async function performNERWithAliases(
  contextText: string,
  aliases: string[]
): Promise<Entity[]> {
  // Prepare the list of known aliases
  const aliasList = aliases.map((alias) => `"${alias}"`).join(', ');

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an assistant that performs named entity recognition (NER) on a given text. Identify and extract all named entities, categorizing them as one of the following types: 'Character', 'Building', 'Scene', 'Animal', 'Object'. For entities that are aliases of known characters, provide both the full name and the alias.

Include the following known aliases in your analysis: ${aliasList}.

For each entity, provide:
- fullName: The canonical name of the entity (if applicable).
- alias: The alias used in the text (if applicable).
- type: One of 'Character', 'Building', 'Scene', 'Animal', or 'Object'.
- description: A brief description of the entity based on the context.

Output legal the result as a JSON array of entities.`,
      },
      {
        role: 'user',
        content: `Extract entities from the following text:\n\n${contextText}`,
      },
    ],
    max_tokens: 1500,
  });

  let assistantMessage = response.choices[0].message?.content || '';
  assistantMessage = sanitizeAssistantMessage(assistantMessage);

  let entities: Entity[] = [];
  try {
    entities = JSON.parse(assistantMessage);
  } catch (parseError) {
    console.error('JSON parse error (NER):', parseError);
    const jsonMatch = assistantMessage.match(/\[.*\]/s);
    if (jsonMatch) {
      const regex = /\,(?=\s*?[\}\]])/g;
      const cleanMatch = jsonMatch[0].replace(regex, '');
      entities = JSON.parse(cleanMatch);
    } else {
      console.error('Failed to parse NER as JSON.');
    }
  }

  return entities;
}

// **Scene Detection with Accumulated Passages**
async function detectNewScene(
  contextText: string
): Promise<{ newScene: boolean }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an assistant that detects scene transitions in text. Determine if the following passage indicates the start of a new scene based on the accumulated context. Respond with a JSON object containing a single key "newScene" with a boolean value.`,
      },
      {
        role: 'user',
        content: `Analyze the following text and determine if it starts a new scene:\n\n${contextText}`,
      },
    ],
    max_tokens: 100,
  });

  let assistantMessage = response.choices[0].message?.content || '';
  assistantMessage = sanitizeAssistantMessage(assistantMessage);

  let sceneResult: { newScene?: boolean } = {};
  try {
    sceneResult = JSON.parse(assistantMessage);
  } catch (parseError) {
    console.error('JSON parse error (Scene Detection):', parseError);
    const jsonMatch = assistantMessage.match(/\{.*\}/s);
    if (jsonMatch) {
      const regex = /\,(?=\s*?[\}\]])/g;
      const cleanMatch = jsonMatch[0].replace(regex, '');
      sceneResult = JSON.parse(cleanMatch);
    } else {
      console.error('Failed to parse scene detection as JSON.');
    }
  }

  return { newScene: sceneResult.newScene || false };
}

// **Sanitize Assistant Message**
function sanitizeAssistantMessage(message: string): string {
  return message
    .trim()
    .replace(/```(?:json|)/g, '')
    .replace(/```/g, '')
    .trim();
}

// **Get Next Scene Order**
async function getNextSceneOrder(bookId: string): Promise<number> {
  const lastScene = await prisma.scene.findFirst({
    where: { bookId: bookId },
    orderBy: { order: 'desc' },
  });
  return lastScene ? lastScene.order + 1 : 1;
}

// **Identify Aliases**
function identifyAliases(text: string, canonicalNames: string[]): string[] {
  // Find partial matches in the text based on known canonical names
  const aliases: string[] = [];

  for (const fullName of canonicalNames) {
    const nameParts = fullName.split(' ');
    for (const part of nameParts) {
      // Enhanced regex to capture aliases with titles like Mr., Mrs., Prof., etc.
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
    epub.getChapterRaw(chapterId, (err, text) => {
      if (err) {
        reject(err);
      } else {
        resolve(text || '');
      }
    });
  });
}

// **Get File Asynchronously**
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
