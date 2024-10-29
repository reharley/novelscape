import { Request, Response } from 'express';
import pLimit from 'p-limit';
import prisma from '../config/prisma.js';
import { generateProfilePrompt } from '../utils/prompts.js';
export const getProfilesByGenerationPackage = async (
  req: Request,
  res: Response
) => {
  const { generationPackageId } = req.params;
  const userId = req.user?.oid;

  try {
    const generationPackageIdInt = parseInt(generationPackageId, 10);
    if (isNaN(generationPackageIdInt)) {
      res.status(400).json({ error: 'Invalid generationPackageId' });
      return;
    }

    // Fetch the GenerationPackage along with its associated book
    const generationPackage = await prisma.generationPackage.findUnique({
      where: { id: generationPackageIdInt },
      include: { book: true },
    });

    if (!generationPackage) {
      res.status(404).json({ error: 'Generation package not found' });
      return;
    }

    const bookId = generationPackage.bookId;

    // Fetch all profiles associated with the book
    let profiles = await prisma.profile.findMany({
      where: {
        bookId: bookId,
      },
      include: {
        descriptions: true,
        profileGenerationData: {
          where: {
            generationPackageId: generationPackageIdInt,
          },
          include: {
            loras: true,
            embeddings: true,
            negativeEmbeddings: true,
          },
        },
      },
    });

    // Initialize p-limit with the desired concurrency limit
    const limit = pLimit(5); // Adjust the number as needed

    // Ensure each profile has ProfileGenerationData for the selected GenerationPackage
    profiles = await Promise.all(
      profiles.map((profile) =>
        limit(async () => {
          let profileGenData = profile.profileGenerationData[0];

          if (!profileGenData) {
            // Generate prompts
            const prompts = await generateProfilePrompt(
              {
                name: profile.name,
                descriptions: profile.descriptions
                  .filter(
                    (x) =>
                      x.appearance &&
                      x.appearance.length > 0 &&
                      x.appearance.toLowerCase() !== 'unknown'
                  )
                  .map((desc) => desc.appearance!),
                gender: profile.gender ?? undefined,
              },
              userId
            );

            // Create default ProfileGenerationData
            profileGenData = await prisma.profileGenerationData.create({
              data: {
                generationPackageId: generationPackageIdInt,
                name: profile.name,
                bookId: bookId,
                profileId: profile.id,
                prompt: `${profile.name}, ${prompts.positivePrompt}`, // Default prompt
                negative_prompt: prompts.negativePrompt, // Default negative prompt
                steps: 20,
                width: 512,
                height: 768,
                checkpointId: 4384,

                removeBackground: profile.type === 'PERSON',
              },
              include: {
                loras: true,
                embeddings: true,
                negativeEmbeddings: true,
              },
            });

            // Update the profile's profileGenerationData
            profile.profileGenerationData = [profileGenData];
          }

          // If the profile has no imageUrl, set a default or empty string
          if (!profile.imageUrl) {
            await prisma.profile.update({
              where: { id: profile.id },
              data: { imageUrl: '' }, // Set to a default image URL if you have one
            });
            profile.imageUrl = '';
          }

          return profile;
        })
      )
    );

    // Sort profiles by the number of descriptions in descending order
    profiles.sort((a, b) => b.descriptions.length - a.descriptions.length);

    res.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles by generation package:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export const createGenerationPackage = async (req: Request, res: Response) => {
  const { name, bookId } = req.body;

  try {
    const bookIdInt = parseInt(bookId, 10);
    if (isNaN(bookIdInt)) {
      res.status(400).json({ error: 'Invalid bookId' });
      return;
    }

    const newPackage = await prisma.generationPackage.create({
      data: {
        name,
        bookId: bookIdInt,
      },
    });

    res.json(newPackage);
  } catch (error) {
    console.error('Error creating generation package:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

export async function editProfileGenerationData(req: Request, res: Response) {
  const { id } = req.params;
  const {
    name,
    prompt,
    negative_prompt,
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

  // Manual Validation
  if (typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ error: 'Invalid or missing "name" field.' });
    return;
  }

  if (typeof prompt !== 'string' || prompt.trim() === '') {
    res.status(400).json({ error: 'Invalid or missing "prompt" field.' });
    return;
  }

  if (
    negative_prompt !== undefined &&
    negative_prompt !== null &&
    typeof negative_prompt !== 'string'
  ) {
    res
      .status(400)
      .json({ error: '"negative_prompt" must be a string if provided.' });
    return;
  }

  if (steps !== undefined && (!Number.isInteger(steps) || steps < 1)) {
    res.status(400).json({ error: '"steps" must be a positive integer.' });
    return;
  }

  if (width !== undefined && (!Number.isInteger(width) || width < 1)) {
    res.status(400).json({ error: '"width" must be a positive integer.' });
    return;
  }

  if (height !== undefined && (!Number.isInteger(height) || height < 1)) {
    res.status(400).json({ error: '"height" must be a positive integer.' });
    return;
  }

  if (!Number.isInteger(checkpointId)) {
    res.status(400).json({ error: 'Invalid or missing "checkpointId" field.' });
    return;
  }

  if (typeof removeBackground !== 'boolean') {
    res
      .status(400)
      .json({ error: 'Invalid or missing "removeBackground" field.' });
    return;
  }

  // Optional fields: loras, embeddings, negativeEmbeddings
  if (loras !== undefined) {
    if (!Array.isArray(loras)) {
      res.status(400).json({ error: '"loras" must be an array.' });
      return;
    }
    for (const lora of loras) {
      if (
        typeof lora.id !== 'number' ||
        !Number.isInteger(lora.id) ||
        typeof lora.weight !== 'number' ||
        lora.weight < 0
      ) {
        res.status(400).json({
          error:
            'Each "lora" must be an object with a positive integer "id" and a non-negative number "weight".',
        });
        return;
      }
    }
  }

  if (embeddings !== undefined) {
    if (!Array.isArray(embeddings)) {
      res
        .status(400)
        .json({ error: '"embeddings" must be an array of integers.' });
      return;
    }
    for (const embeddingId of embeddings) {
      if (!Number.isInteger(embeddingId)) {
        res
          .status(400)
          .json({ error: 'Each "embedding" must be a positive integer.' });
        return;
      }
    }
  }

  if (negativeEmbeddings !== undefined) {
    if (!Array.isArray(negativeEmbeddings)) {
      res.status(400).json({
        error: '"negativeEmbeddings" must be an array of integers.',
      });
      return;
    }
    for (const negEmbeddingId of negativeEmbeddings) {
      if (!Number.isInteger(negEmbeddingId)) {
        res.status(400).json({
          error: 'Each "negativeEmbedding" must be a positive integer.',
        });
        return;
      }
    }
  }

  if (
    generationPackageId !== undefined &&
    !Number.isInteger(generationPackageId)
  ) {
    res.status(400).json({
      error: '"generationPackageId" must be a positive integer if provided.',
    });
    return;
  }

  try {
    // Check if the ProfileGenerationData exists
    const existingData = await prisma.profileGenerationData.findUnique({
      where: { id: Number(id) },
      include: {
        loras: true,
        embeddings: true,
        negativeEmbeddings: true,
      },
    });

    if (!existingData) {
      res.status(404).json({ error: 'ProfileGenerationData not found.' });
      return;
    }

    // Check if the checkpointId exists
    const checkpoint = await prisma.aiModel.findUnique({
      where: { id: checkpointId },
    });

    if (!checkpoint) {
      res.status(400).json({
        error: `Checkpoint AiModel with id ${checkpointId} does not exist.`,
      });
      return;
    }

    // If generationPackageId is provided, check if it exists
    if (generationPackageId !== undefined) {
      const generationPackage = await prisma.generationPackage.findUnique({
        where: { id: generationPackageId },
      });

      if (!generationPackage) {
        res.status(400).json({
          error: `GenerationPackage with id ${generationPackageId} does not exist.`,
        });
        return;
      }
    }

    // Update scalar fields
    const updatedData = await prisma.profileGenerationData.update({
      where: { id: Number(id) },
      data: {
        name,
        prompt,
        negative_prompt,
        steps,
        width,
        height,
        checkpointId,
        removeBackground,
        generationPackageId:
          generationPackageId ?? existingData.generationPackageId,
        // Relations will be handled separately
      },
      include: {
        loras: true,
        embeddings: true,
        negativeEmbeddings: true,
      },
    });

    // Handle updating loras
    if (loras !== undefined) {
      // Delete existing loras
      await prisma.lora.deleteMany({
        where: { profileGenerationId: Number(id) },
      });

      // Validate AiModel IDs for loras
      const validLoraIds = await prisma.aiModel.findMany({
        where: {
          id: { in: loras.map((lora: { id: number }) => lora.id) },
        },
      });

      const validLoraIdSet = new Set(validLoraIds.map((model) => model.id));

      for (const lora of loras) {
        if (!validLoraIdSet.has(lora.id)) {
          res.status(400).json({
            error: `AiModel with id ${lora.id} does not exist for loras.`,
          });
          return;
        }
      }

      // Create new loras
      const loraCreatePromises = loras.map(
        (lora: { id: number; weight: number }) =>
          prisma.lora.create({
            data: {
              aiModelId: lora.id,

              weight: lora.weight,
              profileGenerationId: Number(id),
            },
          })
      );

      await Promise.all(loraCreatePromises);
    }

    // Handle updating embeddings
    if (embeddings !== undefined) {
      // Delete existing embeddings
      await prisma.embedding.deleteMany({
        where: { profileGenerationId: Number(id) },
      });

      // Validate AiModel IDs for embeddings
      const validEmbeddingIds = await prisma.aiModel.findMany({
        where: {
          id: { in: embeddings },
        },
      });

      const validEmbeddingIdSet = new Set(
        validEmbeddingIds.map((model) => model.id)
      );

      for (const embeddingId of embeddings) {
        if (!validEmbeddingIdSet.has(embeddingId)) {
          res.status(400).json({
            error: `AiModel with id ${embeddingId} does not exist for embeddings.`,
          });
          return;
        }
      }

      // Create new embeddings
      const embeddingCreatePromises = embeddings.map((embeddingId: number) =>
        prisma.embedding.create({
          data: {
            aiModelId: embeddingId,
            profileGenerationId: Number(id),
          },
        })
      );

      await Promise.all(embeddingCreatePromises);
    }

    // Handle updating negativeEmbeddings
    if (negativeEmbeddings !== undefined) {
      // Delete existing negativeEmbeddings
      await prisma.negativeEmbedding.deleteMany({
        where: { profileGenerationId: Number(id) },
      });

      // Validate AiModel IDs for negativeEmbeddings
      const validNegativeEmbeddingIds = await prisma.aiModel.findMany({
        where: {
          id: { in: negativeEmbeddings },
        },
      });

      const validNegativeEmbeddingIdSet = new Set(
        validNegativeEmbeddingIds.map((model) => model.id)
      );

      for (const negEmbeddingId of negativeEmbeddings) {
        if (!validNegativeEmbeddingIdSet.has(negEmbeddingId)) {
          res.status(400).json({
            error: `AiModel with id ${negEmbeddingId} does not exist for negativeEmbeddings.`,
          });
          return;
        }
      }

      // Create new negativeEmbeddings
      const negativeEmbeddingCreatePromises = negativeEmbeddings.map(
        (negEmbeddingId: number) =>
          prisma.negativeEmbedding.create({
            data: {
              aiModelId: negEmbeddingId,
              profileGenerationId: Number(id),
            },
          })
      );

      await Promise.all(negativeEmbeddingCreatePromises);
    }

    // Fetch the updated ProfileGenerationData with relations
    const finalData = await prisma.profileGenerationData.findUnique({
      where: { id: Number(id) },
      include: {
        loras: {
          include: {
            aiModel: true,
          },
        },
        embeddings: {
          include: {
            aiModel: true,
          },
        },
        negativeEmbeddings: {
          include: {
            aiModel: true,
          },
        },
        checkpoint: true,
        generationPackage: true,
        // Add other relations if necessary
      },
    });

    res.status(200).json(finalData);
    return;
  } catch (err) {
    console.error('Error updating ProfileGenerationData:', err);
    res.status(500).json({ error: 'Internal server error.' });
    return;
  }
}
