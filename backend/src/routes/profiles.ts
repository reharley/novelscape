import { Router } from 'express';
import prisma from '../config/prisma';
import {
  generateImageForProfile,
  getProfilesForBook,
} from '../controllers/profilesController';

const router = Router();
router.post('/:profileId/generate-image', generateImageForProfile);

// Endpoint to get profiles for a book
router.get('/books/:bookId/profiles', getProfilesForBook);

// GET /api/profiles - List all profiles with their associated LoRAs
router.get('/', async (req, res) => {
  try {
    const profiles = await prisma.profile.findMany({
      include: {
        aiModels: true, // Include associated LoRAs
      },
    });
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles.' });
  }
});

// POST /api/profiles/:profileId/associate-lora - Associate a LORA with a Profile
router.post('/:profileId/associate-lora', async (req, res) => {
  const { profileId } = req.params;
  const { loraId } = req.body;

  if (!loraId) {
    res.status(400).json({ error: 'loraId is required.' });
    return;
  }

  try {
    const profileAiModel = await prisma.profileAiModel.create({
      data: {
        profile: { connect: { id: Number(profileId) } },
        aiModel: { connect: { id: Number(loraId) } },
      },
    });
    res.json(profileAiModel);
  } catch (error) {
    console.error('Error associating LORA with Profile:', error);
    res.status(500).json({ error: 'Failed to associate LORA with Profile.' });
  }
});

// DELETE /api/profiles/:profileId/disassociate-lora/:loraId - Disassociate a LORA from a Profile
router.delete('/:profileId/disassociate-lora/:loraId', async (req, res) => {
  const { profileId, loraId } = req.params;

  try {
    const profileAiModel = await prisma.profileAiModel.delete({
      where: {
        profileId_aiModelId: {
          profileId: Number(profileId),
          aiModelId: Number(loraId),
        },
      },
    });
    res.json(profileAiModel);
  } catch (error) {
    console.error('Error disassociating LORA from Profile:', error);
    res
      .status(500)
      .json({ error: 'Failed to disassociate LORA from Profile.' });
  }
});

export default router;
