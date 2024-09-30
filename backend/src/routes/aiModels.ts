import express from 'express';
import {
  listDownloadedLoras,
  listDownloadedModels,
  loadModelController,
  setActiveModelController,
} from '../controllers/aiModelsController';

const router = express.Router();

router.get('/list-models', listDownloadedModels);

router.get('/list-loras', listDownloadedLoras);

router.post('/load-model', loadModelController);

router.post('/set-active-model', setActiveModelController);

export default router;
