// src/routes/books.ts
import express from 'express';
import {
  deleteBook,
  extractProfilesController,
  getBookContent,
  getProfilesForBook,
  listBookFiles,
  listBooks,
} from '../controllers/booksController';

const router = express.Router();

/**
 * @route GET /api/books/files
 * @desc List EPUB files
 * @access Public
 */
router.get('/files', listBookFiles);

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
router.get('/:bookId', getBookContent);

/**
 * @route POST /api/books/:bookId/extract-profiles
 * @desc Extract profiles from a book
 * @access Public
 */
router.post('/:bookId/extract-profiles', extractProfilesController);

/**
 * @route DELETE /api/books/:bookId
 * @desc Delete a book and its associated profiles and extractions
 * @access Public
 */
router.delete('/:bookId', deleteBook);

/**
 * @route GET /api/books/:bookId/profiles
 * @desc Get profiles for a specific book
 * @access Public
 */
router.get('/:bookId/profiles', getProfilesForBook);

export default router;
