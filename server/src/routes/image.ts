import express from 'express';
import {
  generateImageController,
  generateImageForProfile,
  generateImagesForChapter,
  generateImagesForMultipleScenes,
  generateImagesForPassage,
  generateImagesForScene,
  getJobStatus,
  listJobs,
  updateProfileImageUrl,
  updateSceneImageUrl,
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

/**
 * @route POST /api/scenes/:sceneId/generate-images
 * @desc Generate images for a specific scene
 * @access Public
 */
router.post('/scenes/:sceneId/generate-images', generateImagesForScene);

/**
 * @route POST /api/scenes/generate-images
 * @desc Generate images for the next N scenes
 * @access Public
 */
router.post('/scenes/generate-images', generateImagesForMultipleScenes);

/**
 * @route PUT /api/scenes/:sceneId/image
 * @desc Update the imageUrl for a specific scene
 * @access Public
 */
router.put('/scenes/:sceneId/image', updateSceneImageUrl);

/**
 * @route PUT /api/profiles/:profileId
 * @desc Update the imageUrl for a specific profile
 * @access Public
 */
router.put('/profiles/:profileId', updateProfileImageUrl);

/**
 * @route POST /api/chapters/:chapterId/generate-images
 * @desc Generate images for all scenes in a specific chapter
 * @access Public
 */
router.post('/chapters/:chapterId/generate-images', generateImagesForChapter);

/**
 * @route GET /api/jobs/:jobId
 * @desc Get the status of a specific image generation job
 * @access Public
 */
router.get('/jobs/:jobId', getJobStatus);

/**
 * @route GET /api/jobs
 * @desc List recent image generation jobs
 * @access Public
 */
router.get('/jobs', listJobs);

export default router;
