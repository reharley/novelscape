import express from 'express';
import {
  getCreators,
  getGenerationData,
  getImageGenerationData,
  getImages,
  getModelById,
  getModelVersionByHash,
  getModelVersionById,
  getTags,
  searchModels,
} from '../controllers/civitaiController.js';

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

/**
 * GET /api/civitai/:imageId
 * Description: Retrieves generation data for the given image ID.
 */
router.get('/images/:imageId', getImageGenerationData);

/**
 * POST /api/civitai/fetch-generation-data
 * Body: { imageId: number }
 * Description: Fetches generation data for the given image ID and stores it in the database.
 */
router.post('/fetch-generation-data', getGenerationData);

export default router;
