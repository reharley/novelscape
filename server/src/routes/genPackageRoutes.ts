import express from 'express';
import {
  createGenerationPackage,
  editProfileGenerationData,
  getProfilesByGenerationPackage,
} from '../controllers/genPackageController.js';

const router = express.Router();

router.get('/:generationPackageId/profiles', getProfilesByGenerationPackage);
router.post('/', createGenerationPackage);
router.put('/profile/:id', editProfileGenerationData);

export default router;
