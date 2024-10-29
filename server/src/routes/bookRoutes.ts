// src/routes/books.ts
import express from 'express';
import {
  deleteBook,
  detectSceneController,
  generateChapterImagesController,
  getChaptersForBook,
  getGenerationPackagesByBook,
  getPassagesForBook,
  getPassagesForChapter,
  getProfilesAndScenePackages,
  getProfilesForBook,
  getReadingProgress,
  listBooks,
  processBookController,
  updateReadingProgress,
  uploadBookController,
} from '../controllers/booksController.js';
import { upload } from '../utils/multer.js';

const router = express.Router();

/**
 * @route GET /api/books/:bookId/passages
 * @desc Get passages for a specific book along with their profiles
 * @access Public
 */
router.get('/:bookId/passages', getPassagesForBook);
/**
 * @route GET /api/books/:bookId/chapters
 * @desc Get all chapters for a specific book
 * @access Public
 */
router.get('/:bookId/chapters', getChaptersForBook);

/**
 * @route GET /api/books/:bookId/chapters/:chapterId/passages
 * @desc Get all passages for a specific chapter along with their profiles
 * @access Public
 */
router.get('/:bookId/chapters/:chapterId/passages', getPassagesForChapter);

/**
 * @route GET /api/books
 * @desc List available books
 * @access Public
 */
router.get('/', listBooks);

/**
 * @route GET /api/books/:bookId
 * @desc Get book content
 * @access Public
 */
// router.get('/epub/:bookId', getEpubContent);

/**
 * @route POST /api/books/:bookId/process
 * @desc Extract profiles from a book
 * @access Public
 */
router.post('/:bookId/process', processBookController);
router.get('/:chapterId/generate-images', generateChapterImagesController);

/**
 * @route DELETE /api/books/:bookId
 * @desc Delete a book and its associated profiles and passages
 * @access Public
 */
router.delete('/:bookId', deleteBook);

/**
 * @route GET /api/books/:bookId/profiles
 * @desc Get profiles for a specific book
 * @access Public
 */
router.get('/:bookId/profiles', getProfilesForBook);
router.get('/:bookId/profiles-packages', getProfilesAndScenePackages);
router.get('/:bookId/generation-packages', getGenerationPackagesByBook);

router.post('/:bookId/detect-scenes', detectSceneController);

router.post('/upload', upload.single('file'), uploadBookController);

/**
 * @route GET /api/books/:bookId/reading-progress
 * @desc Get the last reading progress for a book
 * @access Public
 */
router.get('/:bookId/reading-progress', getReadingProgress);

/**
 * @route POST /api/books/:bookId/reading-progress
 * @desc Update the reading progress for a book
 * @access Public
 */
router.post('/:bookId/reading-progress', updateReadingProgress);

export default router;
