import DOMPurify from 'dompurify';
import EPub from 'epub2';
import fs from 'fs-extra';
import { JSDOM } from 'jsdom';
import path from 'path';
import openai from '../config/openai';
import prisma from '../config/prisma';
import { parseChapterContent } from '../utils/parseChapterContent';

const { window } = new JSDOM('<!DOCTYPE html>');
const domPurify = DOMPurify(window);

export async function extractProfiles(
  bookId: string,
  booksDir: string,
  extractedDir: string
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

    const CONCURRENCY_LIMIT = 5; // Set the concurrency limit here
    const batchSize = CONCURRENCY_LIMIT;
    for (let i = 0; i < chapters.length; i += batchSize) {
      const batch = chapters.slice(i, i + batchSize);
      const batchPromises = batch.map((chapter) =>
        processChapter(epub, chapter, book)
      );
      await Promise.all(batchPromises);
    }

    // Extract manifest items
    const manifestItems = Object.values(epub.manifest);
    const extractPath = path.join(extractedDir, bookId);
    for (const item of manifestItems) {
      if (!item.id || !item.href) continue;
      try {
        const data = await epub.getFileAsync(item.id);
        const outputPath = path.join(extractPath, item.href);
        const outputDir = path.dirname(outputPath);
        await fs.ensureDir(outputDir);
        if (data) await fs.writeFile(outputPath, data);
        console.log(`Extracted: ${item.href}`);
      } catch (err) {
        console.error(`Error extracting file ${item.href}:`, err);
      }
    }
  });

  epub.parse();
}

export function getChapterRawAsync(
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

async function processChapter(epub: EPub, chapter: any, book: any) {
  const chapterId = chapter.id;
  if (!chapterId) return;

  try {
    const text = await getChapterRawAsync(epub, chapterId);
    if (!text) {
      console.error(`Error: Chapter ${chapterId} is empty.`);
      return;
    }

    const chapterTitle = chapter.title || `Chapter ${chapter.order}`;
    const contents = parseChapterContent(text); // Parses the chapter content

    // Process each content item
    for (const contentItem of contents) {
      if (contentItem.type === 'paragraph' || contentItem.type === 'title') {
        const textContent = contentItem.text.trim();

        if (!textContent) {
          console.log(`Skipping empty content in chapter: ${chapterTitle}`);
          continue;
        }

        // Create Extraction entry
        const extraction = await prisma.extraction.create({
          data: {
            textContent,
            bookId: book.id,
          },
        });

        // Send text to OpenAI API for NER
        const response = await openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are an assistant that performs named entity recognition (NER) on a given text. Identify and extract all named entities, categorizing them as one of the following types: 'Character', 'Building', 'Scene', 'Animal', 'Object'. For each entity, provide:
- name: The name of the entity.
- type: One of 'Character', 'Building', 'Scene', 'Animal', or 'Object'.
- description: A brief description of the entity based on the context.

Output the result as a JSON array of entities.`,
            },
            {
              role: 'user',
              content: `Extract entities from the following text:\n\n${textContent}`,
            },
          ],
          max_tokens: 1000,
        });

        let assistantMessage = response.choices[0].message?.content || '';

        // Sanitize the response
        assistantMessage = assistantMessage
          .trim()
          .replace(/```(?:json|)/g, '')
          .trim();

        // Attempt to extract and parse JSON from the assistant's message
        let entities;
        try {
          entities = JSON.parse(assistantMessage);
        } catch (parseError) {
          console.error('JSON parse error:', parseError);
          const jsonMatch = assistantMessage.match(/\[.*\]/s);
          if (jsonMatch) {
            entities = JSON.parse(jsonMatch[0]);
          } else {
            console.error(
              'Failed to parse entities as JSON after sanitization.'
            );
            continue; // Skip if unable to parse
          }
        }

        // Save profiles and descriptions to the database
        for (const entity of entities) {
          const profileType = entity.type.toUpperCase();
          // Upsert Profile
          const profile = await prisma.profile.upsert({
            where: {
              name_bookId: {
                name: entity.name,
                bookId: book.id,
              },
            },
            update: {},
            create: {
              name: entity.name,
              type: profileType,
              bookId: book.id,
            },
          });

          // Create Description linked to Profile and Extraction
          await prisma.description.create({
            data: {
              text: entity.description,
              profileId: profile.id,
              extractionId: extraction.id,
            },
          });
        }
      }
    }
  } catch (chapterError) {
    console.error(`Error processing chapter ${chapterId}:`, chapterError);
  }
}
