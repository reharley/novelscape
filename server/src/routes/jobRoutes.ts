// processingJobRouter.ts

import { Router } from 'express';
import {
  cancelProcessingJob,
  createProcessingJob,
  getProcessingJob,
  getProcessingJobByBookId,
  getProcessingJobStatus,
  listProcessingJobs,
} from '../controllers/jobController.js'; // Adjust the import path based on your project structure

const router = Router();

// Create a new processing job
router.post('/', createProcessingJob);

// Get existing processing job for a given bookId
router.get('/book/:bookId', getProcessingJobByBookId);

// Get a specific processing job by ID
router.get('/:jobId', getProcessingJob);

// Get the status of a processing job by ID
router.get('/:jobId/status', getProcessingJobStatus);

// List all processing jobs (with optional filtering)
router.get('/', listProcessingJobs);

// Cancel a processing job
router.delete('/:jobId', cancelProcessingJob);

export default router;
