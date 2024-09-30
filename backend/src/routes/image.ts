import express from 'express';
import {
  generateImageController,
  generateImageForProfile,
} from '../controllers/imageController';

const router = express.Router();

/**
 * @route POST /api/generate-image
 * @desc Generate an image based on prompts
 * @access Public
 */
router.post('/', generateImageController);

/**
 * @route POST /api/profiles/:profileId/generate-image
 * @desc Generate an image for a specific profile
 * @access Public
 */
router.post('/profiles/:profileId/generate-image', generateImageForProfile);

export default router;
