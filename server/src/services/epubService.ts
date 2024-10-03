import DOMPurify from 'dompurify';
import EPub from 'epub2';
import { Response } from 'express';
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

    const CONCURRENCY_LIMIT = chapters.length; //8; // Set the concurrency limit here
    const batchSize = CONCURRENCY_LIMIT;
    for (let i = 0; i < chapters.length; i += batchSize) {
      const batch = chapters.slice(i, i + batchSize);
      const batchPromises = batch.map((chapter) =>
        processChapter(epub, chapter, book)
      );
      await Promise.all(batchPromises);
    }

    const manifestItems = Object.values(epub.manifest); // Extract manifest entries as an array
    const extractPath = path.join(extractedDir, bookId);
    manifestItems.forEach((item) => {
      if (!item.id) return;
      epub.getFile(item.id, (err, data, mimeType) => {
        if (!item.href) return;
        if (err) {
          console.error(`Error extracting file ${item.href}:`, err);
        } else {
          // Create the appropriate subdirectory if needed
          const outputPath = path.join(extractPath, item.href);
          const outputDir = path.dirname(outputPath);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          // Write file to disk
          if (data) fs.writeFileSync(outputPath, data);
          console.log(`Extracted: ${item.href}`);
        }
      });
    });

    res.json({ message: 'Entities extracted and saved successfully.' });
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

    // Process each content item
    let passageCounter = 1;
    for (const contentItem of contents) {
      if (contentItem.type === 'paragraph' || contentItem.type === 'title') {
        const textContent = contentItem.text.trim();

        if (!textContent) {
          console.log(`Skipping empty content in chapter: ${chapterTitle}`);
          continue;
        }

        // Create Passage entry
        const passage = await prisma.passage.create({
          data: {
            textContent,
            order: passageCounter++,
            bookId: book.id,
            chapterId: chapterRecord.id,
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
        let entities: { name?: string; type?: string; description?: string }[];
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
          if (!entity.name || !entity.type) {
            console.error(
              `Invalid entity detected in chapter ${chapterTitle}:`,
              entity
            );
            continue;
          }
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

          if (!entity.description) {
            console.error(`No description provided for entity ${entity.name}`);
            continue;
          }
          // Create Description linked to Profile and Passage
          await prisma.description.create({
            data: {
              text: entity.description,
              bookId: book.id,
              profileId: profile.id,
              passageId: passage.id, // Updated from passageId to passageId
            },
          });

          // Connect Profile to Passage implicitly
          await prisma.passage.update({
            where: { id: passage.id },
            data: {
              profiles: {
                connect: { id: profile.id },
              },
            },
          });
        }
      }
    }
  } catch (chapterError) {
    console.error(`Error processing chapter ${chapterId}:`, chapterError);
  }
}
