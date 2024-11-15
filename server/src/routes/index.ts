import express from 'express';

import adRouter from './adRoutes.js';
import aiModelsRouter from './aiModelRoutes.js';
import booksRouter from './bookRoutes.js';
import civitaiRouter from './civitaiRoutes.js';
import genPackageRouter from './genPackageRoutes.js';
import imageRouter from './imageRoutes.js';
import jobRouter from './jobRoutes.js';
import profileGenerationDataRouter from './profileGenerationDataRoutes.js';
import profilesRouter from './profileRoutes.js';
import searchRouter from './searchRoutes.js';
import sttRouter from './sttRoutes.js';
import stylePackageRouter from './stylePackageRoutes.js';
import ttsRouter from './ttsRoutes.js';
import userRouter from './userRoutes.js';

const router = express.Router();

router.use('/ai-models', aiModelsRouter);
router.use('/civitai', civitaiRouter);
router.use('/generation-packages', genPackageRouter);
router.use('/books', booksRouter);
router.use('/user', userRouter);
router.use('/profiles', profilesRouter);
router.use('/search', searchRouter);
router.use('/ad', adRouter);
router.use('/jobs', jobRouter);
router.use('/generate-image', imageRouter);
router.use('/style-packages', stylePackageRouter);
router.use('/profile-generation-data', profileGenerationDataRouter);
router.use('/tts', ttsRouter);
router.use('/stt', sttRouter);

export default router;
