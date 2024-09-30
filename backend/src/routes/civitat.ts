import express from 'express';
import {
  getCreators,
  getImages,
  getModelById,
  getModelVersionByHash,
  getModelVersionById,
  getTags,
  searchModels,
} from '../controllers/civitai';

const router = express.Router();

// Models Routes
router.get('/models', searchModels);
router.get('/models/:modelId', getModelById);

// Creators Routes
router.get('/creators', getCreators);

// Images Routes
router.get('/images', getImages);

// Model Versions Routes
router.get('/model-versions/:modelVersionId', getModelVersionById);
router.get('/model-versions/by-hash/:hash', getModelVersionByHash);

// Tags Routes
router.get('/tags', getTags);

export default router;
