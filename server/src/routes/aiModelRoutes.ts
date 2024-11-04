import express from 'express';
import {
  associateModel,
  getAllAiModels,
  getModelImages,
  listDownloadedEmbeddings,
  listDownloadedLoras,
  listDownloadedModels,
  loadModelController,
  setActiveModelController,
} from '../controllers/aiModelsController.js';

const router = express.Router();

router.get('/', getAllAiModels); // New route to get all AI models
router.get('/list-models', listDownloadedModels);
router.get('/list-loras', listDownloadedLoras);
router.get('/list-embeddings', listDownloadedEmbeddings);
router.post('/load-model', loadModelController);
router.post('/profiles/:profileId/associate-model', associateModel);
router.post('/set-active-model', setActiveModelController);
router.get('/models/:modelId/images', getModelImages);

export default router;
