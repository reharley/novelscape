import express from 'express';
import aiModelsRouter from './aiModels';
import booksRouter from './books';
import civitaiRouter from './civitat';
import imageRouter from './image';
import profilesRouter from './profiles';
import searchRouter from './search';

const router = express.Router();

router.use('/ai-models', aiModelsRouter);
router.use('/civitai', civitaiRouter);
router.use('/books', booksRouter);
router.use('/profiles', profilesRouter);
router.use('/search', searchRouter);
router.use('/generate-image', imageRouter);

export default router;
