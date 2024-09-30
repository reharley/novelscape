// src/routes/search.ts
import express from 'express';
import { searchModels } from '../controllers/searchController';

const router = express.Router();

/**
 * @route GET /api/search
 * @desc Search for models on CivitAI
 * @access Public
 */
router.get('/', searchModels);

export default router;
