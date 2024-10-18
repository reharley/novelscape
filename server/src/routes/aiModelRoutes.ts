import express from 'express';
import {
  associateModel,
  getModelImages,
  listCheckpoints,
  listDownloadedEmbeddings,
  listDownloadedLoras,
  listDownloadedModels,
  listEmbeddings,
  listLoras,
  loadModelController,
  setActiveModelController,
} from '../controllers/aiModelsController.js';

const router = express.Router();

router.get('/models/checkpoints', listCheckpoints);
router.get('/models/loras', listLoras);
router.get('/models/embeddings', listEmbeddings);
router.get('/list-models', listDownloadedModels);
router.get('/list-loras', listDownloadedLoras);
router.get('/list-embeddings', listDownloadedEmbeddings);
router.post('/load-model', loadModelController);
router.post('/profiles/:profileId/associate-model', associateModel);
router.post('/set-active-model', setActiveModelController);
router.get('/models/:modelId/images', getModelImages);
export default router;
