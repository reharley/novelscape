import { Router } from 'express';
import prisma from '../config/prisma';
import { fetchGenerationData } from '../controllers/civitaiController';
import {
  generateImageForProfile,
  getProfilesForBook,
} from '../controllers/profilesController';
import { loadModel } from '../services/modelService';

const router = Router();
router.post('/:profileId/generate-image', generateImageForProfile);

// Endpoint to get profiles for a book
router.get('/books/:bookId/profiles', getProfilesForBook);

router.get('/:id', async (req, res) => {
  const profileId = parseInt(req.params.id, 10);

  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
      include: {
        descriptions: true,
        aiModels: {
          include: {
            aiModel: {
              include: {
                images: {
                  include: {
                    generationData: {
                      include: {
                        civitaiResources: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        image: {
          include: {
            generationData: {
              include: {
                civitaiResources: true,
              },
            },
          },
        },
      },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile details.' });
  }
});

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

/**
 * POST /profiles/setup-profile
 * Body: { profileId: number, image: ModelImage }
 * Description: Sets up the profile by upserting the ModelImage, loading the model,
 * fetching and upserting generation data, and updating the profile's imageUrl.
 */
router.post('/setup-profile', async (req, res) => {
  const { profileId, image } = req.body;

  // Validate input
  if (
    !profileId ||
    isNaN(Number(profileId)) ||
    !image ||
    typeof image !== 'object' ||
    !image.id
  ) {
    res
      .status(400)
      .json({ error: 'Valid profileId and image object are required.' });
    return;
  }

  // Destructure necessary fields from image
  const {
    id: imageId,
    url,
    nsfwLevel,
    width,
    height,
    hash,
    type,
    hasMeta,
    onSite,
    modelId, // Destructured here
  } = image;

  if (!modelId || isNaN(Number(modelId))) {
    res
      .status(400)
      .json({ error: 'Valid modelId is required within the image object.' });
    return;
  }

  try {
    // Step 1: Load the AI Model to ensure AiModel exists
    const loadModelResult = await loadModel(String(modelId));

    const upsertedModelImage = await prisma.modelImage.upsert({
      where: { civitaiImageId: imageId },
      update: {
        url,
        nsfwLevel,
        width,
        height,
        hash,
        type,
        hasMeta,
        onSite,
        modelId: Number(modelId),
      },
      create: {
        // Remove 'id' if you want Prisma to auto-increment
        civitaiImageId: imageId, // Include only if you intend to manually set 'id'
        url,
        nsfwLevel,
        width,
        height,
        hash,
        type,
        hasMeta,
        onSite,
        modelId: Number(modelId),
      },
      include: {
        generationData: {
          include: {
            civitaiResources: true,
          },
        },
      },
    });

    // If hasMeta is true, fetch and upsert GenerationData
    let generationData = upsertedModelImage.generationData;

    if (hasMeta && !generationData) {
      // Fetch generation data
      const fetchedMeta = await fetchGenerationData(Number(imageId));

      if (!fetchedMeta) {
        throw new Error('Failed to fetch generation data.');
      }
    }

    // Update the Profile's imageUrl
    const updatedProfile = await prisma.profile.update({
      where: { id: Number(profileId) },
      data: {
        imageUrl: url,
        imageId: imageId,
      },
    });

    // Step 3: Download all resources in generationData if available
    const civitaiResources = generationData?.civitaiResources || [];

    await Promise.all(
      civitaiResources.map(async (resource) => {
        // Implement your download logic here
        // Example:
        // await downloadResource(resource.url, resource.destinationPath);
        console.log(`Downloading resource: ${resource.modelId}`);
        await loadModel(modelId, true);
      })
    );

    res.json({
      message: 'Profile setup successfully.',
      profile: updatedProfile,
      modelImage: upsertedModelImage,
      generationData: generationData,
      modelLoad: loadModelResult,
    });
  } catch (error: any) {
    console.error('Error setting up profile:', error.message || error);
    res.status(500).json({ error: 'Failed to set up profile.' });
  }
});

export default router;
