import { Request, Response } from 'express';

import prisma from '../config/prisma.js';
import {
  extractCanonicalNames,
  extractPassageAndChapters,
  processPassagesWithContextForChapter,
  processSpeechPassagesForChapter,
} from '../services/bookService.js';
import {
  detectScenesForChapter,
  processEpubCoverImage,
} from '../services/epubService.js';
import { uploadFileToAzure } from '../utils/azureStorage.js';
import {
  generateBackgroundImagesForChapter,
  generateProfileImagesForChapter,
} from './imageController.js';

export const getGenerationPackagesByBook = async (
  req: Request,
  res: Response
) => {
  const { bookId } = req.params;

  try {
    const bookIdInt = parseInt(bookId, 10);
    if (isNaN(bookIdInt)) {
      res.status(400).json({ error: 'Invalid bookId' });
      return;
    }

    const generationPackages = await prisma.generationPackage.findMany({
      where: { bookId: bookIdInt },
      select: {
        id: true,
        name: true,
      },
    });

    res.json(generationPackages);
  } catch (error) {
    console.error('Error fetching generation packages:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export async function listBooks(req: Request, res: Response) {
  try {
    const userId = req.user.oid;
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: { id: userId },
    });

    const books = await prisma.book.findMany({
      where: {
        userId: {
          in: [userId, 'ffc92e45-27d7-49ee-9021-8ce8a0874479'],
        },
      },
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
    res.status(202).json({ message: 'Scenes detected.' });
  } catch (error: any) {
    console.error('Error starting profile extraction:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to start profile extraction.' });
  }
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
        speaker: true,
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
      prisma.processingJob.deleteMany({
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

export async function getProfilesForBook(req: Request, res: Response) {
  try {
    const bookId = Number(req.params.bookId);
    const profiles = await prisma.profile.findMany({
      where: { bookId },
      include: {
        descriptions: true,
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

export async function getProfilesAndScenePackages(req: Request, res: Response) {
  const { bookId } = req.params;

  try {
    const bookIdInt = parseInt(bookId, 10);
    if (isNaN(bookIdInt)) {
      res.status(400).json({ error: 'Invalid bookId' });
      return;
    }

    // Fetch SceneImagePackages associated with the book
    const scenePackages = await prisma.profileGenerationData.findMany({
      where: {
        bookId: bookIdInt,
        sceneAssociations: {
          some: {},
        },
      },
      include: {
        loras: true,
        embeddings: true,
        negativeEmbeddings: true,
        sceneAssociations: true,
      },
    });

    // Fetch profiles associated with the book, including the number of descriptions
    const profiles = await prisma.profile.findMany({
      where: {
        bookId: bookIdInt,
      },
      include: {
        descriptions: true,
        imagePackages: {
          include: {
            profileGeneration: {
              include: {
                loras: true,
                embeddings: true,
                negativeEmbeddings: true,
              },
            },
          },
        },
      },
    });

    // Sort profiles by the number of descriptions in descending order
    profiles.sort((a, b) => b.descriptions.length - a.descriptions.length);

    res.json({
      scenePackages,
      profiles,
    });
  } catch (error) {
    console.error('Error fetching profiles and scene packages:', error);
    res.status(500).json({ error: 'Internal Server Error' });
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
    const processingJob = await prisma.processingJob.create({
      data: {
        startTime: new Date(),
        jobType: 'book',
        bookId,
        phase: 'init',
        status: 'in_progress',
      },
    });

    // Start the processing asynchronously
    processBook(bookId, processingJob.id)
      .then(() => {
        // Processing completed successfully
        // Progress updates are handled within processBook via progressManager
      })
      .catch(async (error) => {
        console.error(`Error processing book ${bookId}:`, error);
        await prisma.processingJob.update({
          where: { id: processingJob.id },
          data: { status: 'failed' },
        });
      });

    // Immediately respond to acknowledge the request
    res.status(202).json(processingJob);
  } catch (error: any) {
    console.error('Error starting book processing:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to start book processing.' });
  }
}

// Implement processBook function to handle the processing logic
async function processBook(bookId: number, jobId: number) {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
  });
  if (!book) throw new Error('Book not found.');
  if (book.processed) return;
  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      phase: 'Phase 1',
    },
  });
  await extractPassageAndChapters(bookId, jobId);

  await extractCanonicalNames(bookId, jobId);

  await prisma.processingJob.update({
    where: { id: jobId },
    data: {
      status: 'completed',
    },
  });

  await prisma.book.update({
    where: { id: bookId },
    data: { processed: true },
  });
}

export async function generateChapterImages(
  chapterId: number,
  processingJobId: number
) {
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

  const job = await prisma.processingJob.update({
    where: { id: processingJobId },
    data: {
      jobType: 'chapter',
      phase: 'Phase 5',
      bookId: chapter.bookId,
      chapterId: chapter.id,
      completedTasks: 0,
      status: 'in_progress',
      totalTasks: totalTasks,
      progress: 0.0,
    },
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
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: 'completed',
        progress: 100.0,
      },
    });
  } catch (error: any) {
    console.error('Error generating images for chapter:', error);

    // Update job with failed status
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
      },
    });
  }
}

export async function generateChapterImagesController(
  req: Request,
  res: Response
) {
  const chapterId = Number(req.params.chapterId);

  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
  });
  if (!chapter) {
    res.status(404).json({ error: 'Chapter not found.' });
    return;
  }

  const job = await prisma.processingJob.create({
    data: {
      startTime: new Date(),
      jobType: 'generateChapterImages',
      phase: 'init',
      chapterId,
      bookId: chapter.bookId,
      status: 'in_progress',
    },
  });

  (async () => {
    if (!chapter.processed) {
      await Promise.all([
        processPassagesWithContextForChapter(chapterId, job.id),
        detectScenesForChapter(chapterId, job.id),
      ]);

      await prisma.chapter.update({
        where: { id: chapterId },
        data: { processed: true },
      });
    }
    await Promise.all([
      generateChapterImages(chapterId, job.id),
      processSpeechPassagesForChapter(chapterId, job.id),
    ]);
  })().catch(async (error) => {
    console.error('Error starting image generation:', error);
    await prisma.processingJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
      },
    });
  });
  res.status(200).json(job);
}
