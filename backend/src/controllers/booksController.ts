import EPub from 'epub2';
import { Request, Response } from 'express';
import fs from 'fs-extra';
import path from 'path';
import prisma from '../config/prisma';
import { extractProfiles, getChapterRawAsync } from '../services/epubService';
import { parseChapterContent } from '../utils/parseChapterContent';

if (!process.env.BOOKS_PATH) {
  console.error('Books path not configured.');
  process.exit(1);
}
const booksDir = process.env.BOOKS_PATH;
const extractedDir = path.join(__dirname, '../../extracted_books');

// Ensure extracted_books directory exists
fs.ensureDirSync(extractedDir);

export async function listBookFiles(req: Request, res: Response) {
  try {
    const files = await fs.readdir(booksDir);
    const bookFiles = files.filter((file) => file.endsWith('.epub'));
    res.json(bookFiles); // Return only EPUB files
  } catch (error) {
    console.error('Error fetching book files:', error);
    res.status(500).json({ error: 'Failed to fetch book files.' });
  }
}

export async function listBooks(req: Request, res: Response) {
  try {
    const books = await prisma.book.findMany({
      select: {
        id: true,
        title: true,
        // Include other fields if necessary
      },
      orderBy: {
        title: 'asc', // Optional: order books alphabetically by title
      },
    });

    if (books.length === 0) {
      res.status(404).json({ message: 'No books found in the database.' });
      return;
    }

    res.json(books);
  } catch (error) {
    console.error('Error fetching books from the database:', error);
    res.status(500).json({ error: 'Failed to fetch books.' });
  }
}

/**
 * Retrieves the structured content of a specific book.
 */
export async function getBookContent(req: Request, res: Response) {
  const { bookId } = req.params;
  const bookPath = path.join(booksDir, `${bookId}.epub`);

  try {
    if (!(await fs.pathExists(bookPath))) {
      console.warn(`Book not found: ${bookPath}`);
      res.status(404).send('Book not found');
      return;
    }

    const epub = new EPub(bookPath);

    epub.on('end', async () => {
      const chapters = epub.flow;
      let structuredContent: any[] = [];
      let processedChapters = 0;

      if (chapters.length === 0) {
        console.warn(`No chapters found in the book: ${bookId}`);
        res.status(404).send('No chapters found in the book');
        return;
      }

      try {
        for (const [index, chapter] of chapters.entries()) {
          const chapterId = chapter.id;
          if (!chapterId) {
            console.warn(
              `Skipping chapter without ID: ${
                chapter.title || `Chapter ${index + 1}`
              }`
            );
            continue; // Skip chapters without an ID
          }

          try {
            const text = await getChapterRawAsync(epub, chapterId);
            if (!text) {
              console.warn(`Empty chapter: ${chapterId}`);
              continue;
            }

            const chapterTitle = chapter.title || `Chapter ${index + 1}`;
            const contents = parseChapterContent(text);
            structuredContent.push({
              order: index,
              chapterTitle,
              contents,
            });
          } catch (chapterError) {
            console.error(`Error reading chapter ${chapterId}:`, chapterError);
          }
        }

        // Sort structuredContent based on chapter order
        structuredContent.sort((a, b) => a.order - b.order);
        res.json(structuredContent);
      } catch (processingError) {
        console.error(
          `Error processing chapters for book ${bookId}:`,
          processingError
        );
        res.status(500).json({ error: 'Failed to process book content.' });
      }
    });

    epub.parse();
  } catch (error) {
    console.error(`Error retrieving book content for ${bookId}:`, error);
    res
      .status(500)
      .json({ error: 'An error occurred while retrieving the book content.' });
  }
}

export async function extractProfilesController(req: Request, res: Response) {
  const { bookId } = req.params;

  try {
    await extractProfiles(bookId, booksDir, extractedDir, res);
  } catch (error: any) {
    console.error('Error extracting profiles:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to extract profiles.' });
  }
}

export async function getPassagesForBook(req: Request, res: Response) {
  const { bookId } = req.params;

  try {
    const passages = await prisma.passage.findMany({
      where: { bookId },
      orderBy: { order: 'asc' },
      include: {
        profiles: {
          select: {
            id: true,
            name: true,
            type: true,
          },
        },
      },
    });

    if (passages.length === 0) {
      res.status(404).json({ message: 'No passages found for this book.' });
      return;
    }

    res.json(passages);
  } catch (error) {
    console.error('Error fetching passages:', error);
    res.status(500).json({ error: 'Failed to fetch passages.' });
  }
}
export async function getPassagesForChapter(req: Request, res: Response) {
  const { bookId, chapterId } = req.params;
  if (!bookId || !chapterId) {
    res.status(400).json({ error: 'bookId and chapterId are required.' });
    return;
  }
  try {
    const passages = await prisma.passage.findMany({
      where: {
        bookId: bookId,
        chapterId: Number(chapterId),
      },
      select: {
        id: true,
        textContent: true,
        order: true,
        profiles: {
          select: {
            id: true,
            name: true,
            type: true,
            imageUrl: true,
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    if (passages.length === 0) {
      res.status(404).json({ message: 'No passages found for this chapter.' });
      return;
    }
    res.json(passages);
  } catch (error) {
    console.error('Error fetching passages:', error);
    res.status(500).json({ error: 'Failed to fetch passages.' });
  }
}
export async function getChaptersForBook(req: Request, res: Response) {
  const { bookId } = req.params;

  try {
    const chapters = await prisma.chapter.findMany({
      where: { bookId: bookId },
      orderBy: { order: 'asc' },
      select: {
        id: true,
        order: true,
        title: true,
      },
    });

    if (chapters.length === 0) {
      res.status(404).json({ message: 'No chapters found for this book.' });
      return;
    }

    res.json(chapters);
  } catch (error) {
    console.error('Error fetching chapters:', error);
    res.status(500).json({ error: 'Failed to fetch chapters.' });
  }
}

export async function deleteBook(req: Request, res: Response) {
  const { bookId } = req.params;

  try {
    // Manually delete related passages and profiles before deleting the book
    await prisma.description.deleteMany({
      where: { bookId },
    });

    await prisma.passage.deleteMany({
      where: { bookId },
    });

    await prisma.profile.deleteMany({
      where: { bookId },
    });

    await prisma.chapter.deleteMany({
      where: { bookId },
    });

    // Finally, delete the book
    await prisma.book.delete({
      where: { id: bookId },
    });

    res.json({ message: 'Book and associated profiles deleted successfully.' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: 'Failed to delete book.' });
  }
}

/**
 * Fetches profiles associated with a specific book, including their descriptions.
 */
export async function getProfilesForBook(req: Request, res: Response) {
  const { bookId } = req.params;

  try {
    const profiles = await prisma.profile.findMany({
      where: { bookId },
      include: {
        descriptions: true, // Include descriptions
      },
    });

    if (profiles.length === 0) {
      res.status(404).json({ message: 'No profiles found for this book.' });
      return;
    }

    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profiles.' });
  }
}
