import express from 'express';
import {
  createGenerationPackage,
  getProfilesByGenerationPackage,
} from '../controllers/genPackageController.js';

const router = express.Router();

router.get('/:generationPackageId/profiles', getProfilesByGenerationPackage);
router.post('/', createGenerationPackage);

export default router;
