import express from 'express';
import {
  associateModel,
  getModelImages,
  listDownloadedLoras,
  listDownloadedModels,
  loadModelController,
  setActiveModelController,
} from '../controllers/aiModelsController';

const router = express.Router();

router.get('/list-models', listDownloadedModels);
router.get('/list-loras', listDownloadedLoras);
router.post('/load-model', loadModelController);
router.post('/profiles/:profileId/associate-model', associateModel);
router.post('/set-active-model', setActiveModelController);
router.get('/models/:modelId/images', getModelImages);
export default router;
