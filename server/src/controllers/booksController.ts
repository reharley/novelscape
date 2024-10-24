import { Request, Response } from 'express';

import prisma from '../config/prisma.js';
import {
  extractCanonicalNames,
  extractPassageAndChapters,
  processPassagesWithContextForChapter,
} from '../services/bookService.js';
import {
  detectScenesForChapter,
  processEpubCoverImage,
} from '../services/epubService.js';
import { uploadFileToAzure } from '../utils/azureStorage.js';
import { progressManager } from '../utils/progressManager.js';
import {
  generateBackgroundImagesForChapter,
  generateProfileImagesForChapter,
} from './imageController.js';

export async function listBooks(req: Request, res: Response) {
  try {
    const userId = req.user.oid;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    const books = await prisma.book.findMany({
      orderBy: {
        title: 'asc',
      },
    });

    res.json(books);
  } catch (error) {
    console.error('Error fetching books from the database:', error);
    res.status(500).json({ error: 'Failed to fetch books.' });
  }
}

/**
 * Retrieves the structured content of a specific book.
 */
// export async function getEpubContent(req: Request, res: Response) {
//   const { bookId } = req.params;
//   const bookPath = path.join(booksDir, `${bookId}.epub`);

//   try {
//     if (!(await fs.pathExists(bookPath))) {
//       console.warn(`Book not found: ${bookPath}`);
//       res.status(404).send('Book not found');
//       return;
//     }

//     const epub = new EPub(bookPath);

//     epub.on('end', async () => {
//       const chapters = epub.flow;
//       let structuredContent: any[] = [];
//       let processedChapters = 0;

//       if (chapters.length === 0) {
//         console.warn(`No chapters found in the book: ${bookId}`);
//         res.status(404).send('No chapters found in the book');
//         return;
//       }

//       try {
//         for (const [index, chapter] of chapters.entries()) {
//           const chapterId = chapter.id;
//           if (!chapterId) {
//             console.warn(
//               `Skipping chapter without ID: ${
//                 chapter.title || `Chapter ${index + 1}`
//               }`
//             );
//             continue; // Skip chapters without an ID
//           }

//           try {
//             const text = await getChapterRawAsync(epub, chapterId);
//             if (!text) {
//               console.warn(`Empty chapter: ${chapterId}`);
//               continue;
//             }

//             const chapterTitle = chapter.title || `Chapter ${index + 1}`;
//             const contents = parseChapterContent(text);
//             structuredContent.push({
//               order: index,
//               chapterTitle,
//               contents,
//             });
//           } catch (chapterError) {
//             console.error(`Error reading chapter ${chapterId}:`, chapterError);
//           }
//         }

//         // Sort structuredContent based on chapter order
//         structuredContent.sort((a, b) => a.order - b.order);
//         res.json(structuredContent);
//       } catch (processingError) {
//         console.error(
//           `Error processing chapters for book ${bookId}:`,
//           processingError
//         );
//         res.status(500).json({ error: 'Failed to process book content.' });
//       }
//     });

//     epub.parse();
//   } catch (error) {
//     console.error(`Error retrieving book content for ${bookId}:`, error);
//     res
//       .status(500)
//       .json({ error: 'An error occurred while retrieving the book content.' });
//   }
// }

export async function uploadBookController(req: Request, res: Response) {
  try {
    const userId = req.user.oid;
    if (!req.file) {
      res.status(400).send('No file uploaded.');
      return;
    }

    const file = req.file;

    // Check if the file type is valid
    const validTypes = ['application/epub+zip'];
    if (!validTypes.includes(file.mimetype)) {
      res.status(400).send('Invalid file type. Only EPUB is allowed.');
      return;
    }

    // Upload file to Azure Blob Storage
    const fileUrl = await uploadFileToAzure(
      file.buffer,
      file.originalname,
      'books'
    );

    const book = await prisma.book.create({
      data: {
        userId,
        title: file.originalname,
        storageUrl: fileUrl,
      },
    });

    await processEpubCoverImage(book);

    res.status(200).json({
      message: 'File uploaded successfully!',
      fileUrl,
    });
  } catch (error) {
    console.error('Error uploading file:', error);
    res.status(500).send('Error uploading file.');
  }
}

export async function detectSceneController(req: Request, res: Response) {
  try {
    const chapterId = Number(req.params.chapterId);
    // detectScenes(chapterId)
    //   .then(() => {
    //     // Extraction completed successfully
    //     // Progress updates are handled within extractProfiles via progressManager
    //   })
    //   .catch((error) => {
    //     console.error(`Error extracting profiles for book ${bookId}:`, error);
    //     // Send error via progressManager
    //     progressManager.sendProgress(bookId, {
    //       status: 'error',
    //       message: error.message,
    //     });
    //     progressManager.closeAllClients(bookId);
    //   });
    res.status(202).json({ message: 'Scenes detected.' });
  } catch (error: any) {
    console.error('Error starting profile extraction:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to start profile extraction.' });
  }
}

export async function extractProfilesController(req: Request, res: Response) {
  try {
    const bookId = Number(req.params.bookId);
    // Start profile extraction asynchronously
    // extractProfiles(bookId)
    //   .then(() => {
    //     // Extraction completed successfully
    //     // Progress updates are handled within extractProfiles via progressManager
    //   })
    //   .catch((error) => {
    //     console.error(`Error extracting profiles for book ${bookId}:`, error);
    //     // Send error via progressManager
    //     progressManager.sendProgress(bookId, {
    //       status: 'error',
    //       message: error.message,
    //     });
    //     progressManager.closeAllClients(bookId);
    //   });

    // Immediately respond to acknowledge the request
    res.status(202).json({ message: 'Profile extraction started.' });
  } catch (error: any) {
    console.error('Error starting profile extraction:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to start profile extraction.' });
  }
}

export async function extractProfilesProgress(req: Request, res: Response) {
  const bookId = Number(req.params.bookId);

  // Set headers for SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  // Add client to ProgressManager
  progressManager.addClient(bookId, res);

  // Handle client disconnect
  req.on('close', () => {
    progressManager.removeClient(bookId, res);
  });
}

export async function chapterProgress(req: Request, res: Response) {
  const chapterId = Number(req.params.chapterId);

  // Set headers for SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  // Add client to ProgressManager
  progressManager.addClient(chapterId, res);

  // Handle client disconnect
  req.on('close', () => {
    progressManager.removeClient(chapterId, res);
  });
}

export async function getPassagesForBook(req: Request, res: Response) {
  const { bookId } = req.params;

  try {
    const passages = await prisma.passage.findMany({
      where: { bookId: Number(bookId) },
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
    const passagesWithProfiles = await prisma.passage.findMany({
      where: {
        bookId: Number(bookId),
        chapterId: Number(chapterId),
      },
      select: {
        id: true,
        textContent: true,
        order: true,
        scene: true,
        descriptions: {
          select: {
            profile: {
              select: {
                id: true,
                name: true,
                type: true,
                imageUrl: true,
              },
            },
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    // Now process the results to combine profiles into a single array per passage
    const passages = passagesWithProfiles.map((passage) => {
      // Extract profiles from descriptions
      const profiles = passage.descriptions.map((desc) => desc.profile);

      // Remove duplicate profiles by their id
      const uniqueProfiles = Array.from(
        new Map(profiles.map((p) => [p.id, p])).values()
      );

      return {
        ...passage,
        profiles: uniqueProfiles, // Add profiles array to the result
      };
    });

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
      where: { bookId: Number(bookId) },
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
  try {
    const bookId = Number(req.params.bookId);
    await prisma.$transaction([
      prisma.description.deleteMany({
        where: { bookId },
      }),

      prisma.alias.deleteMany({
        where: {
          profile: {
            bookId,
          },
        },
      }),

      prisma.passage.deleteMany({
        where: { bookId },
      }),

      prisma.scene.deleteMany({
        where: { bookId },
      }),

      prisma.profile.deleteMany({
        where: { bookId },
      }),

      prisma.readingProgress.deleteMany({
        where: { bookId },
      }),

      prisma.chapter.deleteMany({
        where: { bookId },
      }),

      prisma.book.delete({
        where: { id: bookId },
      }),
    ]);

    // Respond with a success message upon successful deletion
    res.json({ message: 'Book and all associated data deleted successfully.' });
  } catch (error) {
    console.error('Error deleting book:', error);
    // Respond with an error message if deletion fails
    res
      .status(500)
      .json({ error: 'Failed to delete the book. Please try again later.' });
  }
}

/**
 * Fetches profiles associated with a specific book, including their descriptions.
 */
export async function getProfilesForBook(req: Request, res: Response) {
  try {
    const bookId = Number(req.params.bookId);
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

export async function getReadingProgress(req: Request, res: Response) {
  const bookId = Number(req.params.bookId);
  const userId = req.user.oid;
  try {
    const progress = await prisma.readingProgress.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    if (progress) {
      res.json({
        chapterId: progress.chapterId,
        passageIndex: progress.passageIndex,
      });
    } else {
      res.json({});
    }
  } catch (error) {
    console.error('Error fetching reading progress:', error);
    res.status(500).json({ error: 'Failed to fetch reading progress.' });
  }
}

export async function updateReadingProgress(req: Request, res: Response) {
  const bookId = Number(req.params.bookId);
  const userId = req.user.oid;
  const { chapterId, passageIndex } = req.body;

  try {
    await prisma.readingProgress.upsert({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
      update: {
        chapterId,
        passageIndex,
      },
      create: {
        userId,
        bookId,
        chapterId,
        passageIndex,
      },
    });

    res.json({ message: 'Reading progress updated.' });
  } catch (error) {
    console.error('Error updating reading progress:', error);
    res.status(500).json({ error: 'Failed to update reading progress.' });
  }
}

export async function processBookController(req: Request, res: Response) {
  try {
    const bookId = Number(req.params.bookId);

    // Start the processing asynchronously
    processBook(bookId)
      .then(() => {
        // Processing completed successfully
        // Progress updates are handled within processBook via progressManager
      })
      .catch((error) => {
        console.error(`Error processing book ${bookId}:`, error);
        // Send error via progressManager
        progressManager.sendProgress(bookId, {
          status: 'error',
          message: error.message,
        });
        progressManager.closeAllClients(bookId);
      });

    // Immediately respond to acknowledge the request
    res.status(202).json({ message: 'Book processing started.' });
  } catch (error: any) {
    console.error('Error starting book processing:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to start book processing.' });
  }
}

export async function processingProgress(req: Request, res: Response) {
  const bookId = Number(req.params.bookId);

  // Set headers for SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  // Add client to ProgressManager
  progressManager.addClient(bookId, res);

  // Handle client disconnect
  req.on('close', () => {
    progressManager.removeClient(bookId, res);
  });
}

// Implement processBook function to handle the processing logic
async function processBook(bookId: number) {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
  });
  if (!book) throw new Error('Book not found.');
  if (book.processed) return;
  // Phase 1: Extract Passages and Chapters
  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Phase 1',
    message: 'Extracting Passages and Chapters',
  });
  await extractPassageAndChapters(bookId); // Implement this function
  progressManager.sendProgress(bookId, {
    status: 'phase_progress',
    phase: 'Phase 1',
    completed: 1,
    total: 1,
  });

  // Phase 2: Extract Canonical Names
  progressManager.sendProgress(bookId, {
    status: 'phase',
    phase: 'Phase 2',
    message: 'Extracting Canonical Names',
  });
  await extractCanonicalNames(bookId); // Implement this function
  progressManager.sendProgress(bookId, {
    status: 'phase_progress',
    phase: 'Phase 2',
    completed: 1,
    total: 1,
  });

  // Processing completed
  progressManager.sendProgress(bookId, {
    status: 'completed',
    message: 'Book processing completed successfully.',
  });
  progressManager.closeAllClients(bookId);

  await prisma.book.update({
    where: { id: bookId },
    data: { processed: true },
  });
}

export async function generateChapterImages(chapterId: number) {
  const forceRegenerate = false;

  const backgroundOptions = {
    checkpoint: 'dreamshaper_8.safetensors',
    positiveLoras: [],
    embeddings: [],
    negativeEmbeddings: [],
  };
  const profileOptions = {
    checkpoint: 'dreamshaper_8.safetensors',
    positiveLoras: [],
    embeddings: [],
    negativeEmbeddings: ['Asian-Less2-Neg.pt'],
  };

  const chapter = await prisma.chapter.findUnique({
    where: { id: Number(chapterId) },
    include: {
      book: true,
      scenes: {
        include: {
          passages: {
            include: {
              profiles: {
                include: {
                  descriptions: true,
                  image: {
                    include: {
                      generationData: {
                        include: {
                          civitaiResources: {
                            include: {
                              model: true,
                            },
                          },
                        },
                      },
                      model: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!chapter) {
    throw new Error('Chapter not found.');
  }

  // Collect all scene IDs in the chapter
  const sceneIds = chapter.scenes.map((scene) => scene.id);

  if (sceneIds.length === 0) {
    throw new Error('No scenes found in this chapter.');
  }

  // Collect all unique profiles in the chapter
  const profileIdsSet = new Set<number>();
  chapter.scenes.forEach((scene) => {
    scene.passages.forEach((passage) => {
      passage.profiles.forEach((profile) => {
        profileIdsSet.add(profile.id);
      });
    });
  });

  const profileIds = Array.from(profileIdsSet);

  // Fetch profiles with necessary includes
  const profiles = await prisma.profile.findMany({
    where: { id: { in: profileIds } },
    include: {
      descriptions: true,
      image: {
        include: {
          generationData: {
            include: {
              civitaiResources: {
                include: {
                  model: true,
                },
              },
            },
          },
          model: true,
        },
      },
      book: true,
    },
  });

  const totalTasks = sceneIds.length + profiles.length;

  // Create a new job
  const job = await prisma.imageGenerationJob.create({
    data: {
      type: 'chapter',
      targetId: chapter.id,
      status: 'in_progress',
      totalTasks: totalTasks,
      progress: 0.0,
    },
  });

  progressManager.sendProgress(chapterId, {
    status: 'phase',
    phase: 'Phase 5',
    completed: 0,
    total: totalTasks,
  });

  try {
    // Generate background images
    await generateBackgroundImagesForChapter(
      chapter,
      job,
      forceRegenerate,
      backgroundOptions
    );

    // Generate profile images
    await generateProfileImagesForChapter(
      chapter,
      profiles,
      job,
      forceRegenerate,
      profileOptions
    );

    // Finalize job status
    await prisma.imageGenerationJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        progress: 100.0,
      },
    });
    // Processing completed
    progressManager.sendProgress(chapterId, {
      status: 'completed',
      phase: 'Phase 5',
      message: 'Book processing completed successfully.',
    });
    progressManager.closeAllClients(chapterId);
  } catch (error: any) {
    console.error('Error generating images for chapter:', error);

    // Update job with failed status
    await prisma.imageGenerationJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
      },
    });
    progressManager.sendProgress(chapterId, {
      status: 'error',
      message: error.message || 'An error occurred during profile extraction.',
    });
    progressManager.closeAllClients(chapterId);
  }
}

export async function generateChapterImagesController(
  req: Request,
  res: Response
) {
  const chapterId = Number(req.params.chapterId);
  (async () => {
    const chapter = await prisma.chapter.findUnique({
      where: { id: chapterId },
    });
    if (!chapter) {
      throw new Error('Chapter not found.');
    }
    const bookId = chapter.bookId;
    if (!chapter.processed) {
      await processPassagesWithContextForChapter(chapterId);

      await detectScenesForChapter(chapterId);
      await prisma.chapter.update({
        where: { id: chapterId },
        data: { processed: true },
      });
    }
    await generateChapterImages(chapterId);
  })().catch((error) => {
    console.error('Error starting image generation:', error);
  });
  res.status(200).json({ message: 'Initiated image generation.' });
}
