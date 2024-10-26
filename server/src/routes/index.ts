import express from 'express';

import adRouter from './adRoutes.js';
import aiModelsRouter from './aiModelRoutes.js';
import booksRouter from './bookRoutes.js';
import civitaiRouter from './civitatRoutes.js';
import imageRouter from './imageRoutes.js';
import jobRouter from './jobRoutes.js';
import profilesRouter from './profileRoutes.js';
import searchRouter from './searchRoutes.js';
import userRouter from './userRoutes.js';

const router = express.Router();

router.use('/ai-models', aiModelsRouter);
router.use('/civitai', civitaiRouter);
router.use('/books', booksRouter);
router.use('/user', userRouter);
router.use('/profiles', profilesRouter);
router.use('/search', searchRouter);
router.use('/ad', adRouter);
router.use('/jobs', jobRouter);
router.use('/generate-image', imageRouter);

export default router;
