import { Request, Response } from 'express';
import prisma from '../config/prisma.js';

// Create a new processing job
export async function createProcessingJob(req: Request, res: Response) {
  const { jobType, bookId, chapterId } = req.body;

  if (!jobType || !bookId) {
    res.status(400).json({ error: 'jobType and bookId are required.' });
    return;
  }

  try {
    // Check if a job is already running for this book (and chapter if applicable)
    const existingJob = await prisma.processingJob.findFirst({
      where: {
        jobType,
        bookId: Number(bookId),
        chapterId: chapterId ? Number(chapterId) : null,
        status: {
          in: ['pending', 'in_progress'],
        },
      },
    });

    if (existingJob) {
      res.status(409).json({
        error: 'A processing job is already running for this target.',
      });
      return;
    }

    // Create a new job
    const job = await prisma.processingJob.create({
      data: {
        jobType,
        bookId: Number(bookId),
        chapterId: chapterId ? Number(chapterId) : null,
        phase: 'Initialization',
        status: 'pending', // or 'in_progress' if the job starts immediately
        totalTasks: 0, // Update as necessary
        completedTasks: 0,
        failedTasks: 0,
        progress: 0.0,
        startTime: new Date(),
        endTime: null,
        errorMessage: null,
      },
    });

    res
      .status(201)
      .json({ jobId: job.id, message: 'Processing job created.', job });
  } catch (error: any) {
    console.error('Error creating processing job:', error);
    res.status(500).json({
      error:
        error.message || 'An error occurred while creating the processing job.',
    });
  }
}

// Get a specific processing job by ID
export async function getProcessingJob(req: Request, res: Response) {
  const { jobId } = req.params;

  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required.' });
    return;
  }

  try {
    const job = await prisma.processingJob.findUnique({
      where: { id: Number(jobId) },
    });

    if (!job) {
      res.status(404).json({ error: 'Processing job not found.' });
      return;
    }

    res.json(job);
  } catch (error: any) {
    console.error('Error fetching processing job:', error);
    res.status(500).json({
      error:
        error.message || 'An error occurred while fetching the processing job.',
    });
  }
}

// List all processing jobs (with optional filtering)
export async function listProcessingJobs(req: Request, res: Response) {
  const { jobType, status, bookId, chapterId, skip = 0, take = 20 } = req.query;

  try {
    const whereClause: any = {};

    if (jobType) whereClause.jobType = jobType;
    if (status) whereClause.status = status;
    if (bookId) whereClause.bookId = Number(bookId);
    if (chapterId) whereClause.chapterId = Number(chapterId);

    const jobs = await prisma.processingJob.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: Number(skip),
      take: Number(take),
    });

    res.json(jobs);
  } catch (error: any) {
    console.error('Error listing processing jobs:', error);
    res.status(500).json({
      error:
        error.message || 'An error occurred while listing processing jobs.',
    });
  }
}

// Get the status of a processing job by ID
export async function getProcessingJobStatus(req: Request, res: Response) {
  const { jobId } = req.params;

  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required.' });
    return;
  }

  try {
    const job = await prisma.processingJob.findUnique({
      where: { id: Number(jobId) },
      select: {
        id: true,
        jobType: true,
        bookId: true,
        chapterId: true,
        phase: true,
        status: true,
        totalTasks: true,
        completedTasks: true,
        failedTasks: true,
        progress: true,
        startTime: true,
        endTime: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!job) {
      res.status(404).json({ error: 'Processing job not found.' });
      return;
    }

    res.json(job);
  } catch (error: any) {
    console.error('Error fetching processing job status:', error);
    res.status(500).json({
      error:
        error.message ||
        'An error occurred while fetching the processing job status.',
    });
  }
}

// Cancel a processing job
export async function cancelProcessingJob(req: Request, res: Response) {
  const { jobId } = req.params;

  if (!jobId) {
    res.status(400).json({ error: 'Job ID is required.' });
    return;
  }

  try {
    const job = await prisma.processingJob.findUnique({
      where: { id: Number(jobId) },
    });

    if (!job) {
      res.status(404).json({ error: 'Processing job not found.' });
      return;
    }

    if (job.status === 'completed' || job.status === 'failed') {
      res
        .status(400)
        .json({ error: 'Cannot cancel a completed or failed job.' });
      return;
    }

    // Update the job status to 'cancelled'
    await prisma.processingJob.update({
      where: { id: Number(jobId) },
      data: {
        status: 'cancelled',
        endTime: new Date(),
      },
    });

    // Implement logic to actually cancel the job processing if applicable

    res.json({ message: 'Processing job cancelled successfully.' });
  } catch (error: any) {
    console.error('Error cancelling processing job:', error);
    res.status(500).json({
      error:
        error.message ||
        'An error occurred while cancelling the processing job.',
    });
  }
}

// New endpoint: Get existing processing job for a given bookId
export async function getProcessingJobByBookId(req: Request, res: Response) {
  const { bookId } = req.params;

  if (!bookId) {
    res.status(400).json({ error: 'Book ID is required.' });
    return;
  }

  try {
    const job = await prisma.processingJob.findFirst({
      where: {
        bookId: Number(bookId),
        status: {
          in: ['pending', 'in_progress'],
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (!job) {
      res.status(200);
      return;
    }

    res.json(job);
  } catch (error: any) {
    console.error('Error fetching processing job by bookId:', error);
    res.status(500).json({
      error:
        error.message || 'An error occurred while fetching the processing job.',
    });
  }
}
