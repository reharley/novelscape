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
              null,
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
                negativePrompt: prompts.negativePrompt, // Default negative prompt
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
