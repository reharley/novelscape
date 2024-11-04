import { PrismaClient } from '@prisma/client';
import express from 'express';

const router = express.Router();
const prisma = new PrismaClient();

// Get all ProfileGenerationData
router.get('/', async (req, res) => {
  try {
    const data = await prisma.profileGenerationData.findMany({
      include: {
        profile: true,
        checkpoint: true,
        loras: true,
        embeddings: true,
        negativeEmbeddings: true,
      },
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch Profile Generation Data.' });
  }
});

// Create a new ProfileGenerationData
router.post('/', async (req, res) => {
  const {
    name,
    bookId,
    profileId,
    prompt,
    negativePrompt,
    steps,
    width,
    height,
    checkpointId,
    removeBackground,
    loras,
    embeddings,
    negativeEmbeddings,
    generationPackageId,
  } = req.body;

  try {
    // Create the ProfileGenerationData without nested WeightedModels
    const newGenData = await prisma.profileGenerationData.create({
      data: {
        name,
        bookId,
        profileId,
        prompt,
        negativePrompt,
        steps,
        width,
        height,
        checkpointId,
        removeBackground,
        generationPackageId,
      },
    });

    // Prepare WeightedModels data with profileGenerationDataId
    const loraCreates = loras.map((lora: any) => ({
      weight: lora.weight,
      aiModelId: lora.id,
      profileGenerationDataId: newGenData.id,
      profileGenerationDataLoraId: Number(newGenData.id),
    }));

    const embeddingCreates = embeddings.map((embeddingId: number) => ({
      weight: 1,
      aiModelId: embeddingId,
      profileGenerationDataId: newGenData.id,
      profileGenerationDataEmbeddingId: Number(newGenData.id),
    }));

    const negativeEmbeddingCreates = negativeEmbeddings.map(
      (negEmbeddingId: number) => ({
        weight: 1,
        aiModelId: negEmbeddingId,
        profileGenerationDataId: newGenData.id,
        profileGenerationDataNegativeEmbeddingId: Number(newGenData.id),
      })
    );

    // Create all WeightedModels
    await prisma.weightedModel.createMany({
      data: [...loraCreates, ...embeddingCreates, ...negativeEmbeddingCreates],
    });

    // Fetch the full ProfileGenerationData with related WeightedModels
    const fullGenData = await prisma.profileGenerationData.findUnique({
      where: { id: newGenData.id },
      include: {
        profile: true,
        checkpoint: true,
        loras: true,
        embeddings: true,
        negativeEmbeddings: true,
      },
    });

    res.status(201).json(fullGenData);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// Get a single ProfileGenerationData by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const genData = await prisma.profileGenerationData.findUnique({
      where: { id: Number(id) },
      include: {
        profile: true,
        checkpoint: true,
        loras: true,
        embeddings: true,
        negativeEmbeddings: true,
      },
    });
    if (genData) {
      res.json(genData);
    } else {
      res.status(404).json({ error: 'ProfileGenerationData not found.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch ProfileGenerationData.' });
  }
});

// Update a ProfileGenerationData by ID
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    name,
    bookId,
    profileId,
    prompt,
    negativePrompt,
    steps,
    width,
    height,
    checkpointId,
    removeBackground,
    loras,
    embeddings,
    negativeEmbeddings,
    generationPackageId,
  } = req.body;

  try {
    // Delete existing WeightedModels associated with this ProfileGenerationData
    await prisma.weightedModel.deleteMany({
      where: { profileGenerationDataId: Number(id) },
    });

    // Update the ProfileGenerationData without nested WeightedModels
    await prisma.profileGenerationData.update({
      where: { id: Number(id) },
      data: {
        name,
        bookId,
        profileId,
        prompt,
        negativePrompt,
        steps,
        width,
        height,
        checkpointId,
        removeBackground,
        generationPackageId,
      },
    });

    // Prepare new WeightedModels data with profileGenerationDataId
    const loraCreates = loras.map((lora: any) => ({
      weight: lora.weight,
      aiModelId: lora.id,
      profileGenerationDataId: Number(id),
      profileGenerationDataLoraId: Number(id),
    }));

    const embeddingCreates = embeddings.map((embeddingId: number) => ({
      weight: 1,
      aiModelId: embeddingId,
      profileGenerationDataId: Number(id),
      profileGenerationDataEmbeddingId: Number(id),
    }));

    const negativeEmbeddingCreates = negativeEmbeddings.map(
      (negEmbeddingId: number) => ({
        weight: 1,
        aiModelId: negEmbeddingId,
        profileGenerationDataId: Number(id),
        profileGenerationDataNegativeEmbeddingId: Number(id),
      })
    );

    // Create all new WeightedModels
    await prisma.weightedModel.createMany({
      data: [...loraCreates, ...embeddingCreates, ...negativeEmbeddingCreates],
    });

    // Fetch the updated ProfileGenerationData with related WeightedModels
    const fullGenData = await prisma.profileGenerationData.findUnique({
      where: { id: Number(id) },
      include: {
        profile: true,
        checkpoint: true,
        loras: true,
        embeddings: true,
        negativeEmbeddings: true,
      },
    });

    res.json(fullGenData);
  } catch (error: any) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
});

// Delete a ProfileGenerationData by ID
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // First, delete associated WeightedModels
    await prisma.weightedModel.deleteMany({
      where: { profileGenerationDataId: Number(id) },
    });

    // Then, delete the ProfileGenerationData
    await prisma.profileGenerationData.delete({
      where: { id: Number(id) },
    });

    res.status(204).send();
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete ProfileGenerationData.' });
  }
});

export default router;
