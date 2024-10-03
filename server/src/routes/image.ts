import express from 'express';
import {
  generateImageController,
  generateImageForProfile,
  generateImagesForPassage,
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

/**
 * @route POST /api/passages/:passageId/generate-images
 * @desc Generate images for all profiles linked to a specific passage
 * @access Public
 */
router.post('/passages/:passageId/generate-images', generateImagesForPassage);

export default router;
