import express from 'express';
import {
  getUserSettings,
  saveUserSettings,
} from '../controllers/userController.js';

const router = express.Router();

router.get('/settings', getUserSettings);
router.post('/settings', saveUserSettings);

export default router;
