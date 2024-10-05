import { Config } from '@imgly/background-removal-node';
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { generateImage } from '../services/imageService';
import {
  generateBackgroundPrompt,
  generateProfilePrompt,
} from '../utils/prompts';
import { ProfileWithRelations } from '../utils/types';

const characterImageSize = {
  width: 350,
  height: 700,
};
const backgroundSceneSize = {
  width: 1000,
  height: 500,
};
export async function generateImageController(req: Request, res: Response) {
  const { prompt, negative_prompt, steps, width, height, loras, model } =
    req.body;
  try {
    const imageResult = await generateImage({
      prompt,
      negative_prompt,
      steps,
      width,
      height,
      loras,
      model,
    });
    res.json(imageResult);
  } catch (error: any) {
    console.error('Error generating image:', error);
    res.status(500).json({
      error: error.message || 'An error occurred while generating the image.',
    });
  }
}

export async function generateImageForProfile(req: Request, res: Response) {
  const { profileId } = req.params;
  try {
    // Fetch the profile from the database
    const profile = await prisma.profile.findUnique({
      where: { id: Number(profileId) },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    // Example: Use profile.description as the prompt
    const prompt = ''; //profile.description;

    // Generate image using the prompt
    const imageResult = await generateImage({
      prompt,
      negative_prompt: '', // Add any default negative prompts if necessary
      steps: 20, // Default steps
      ...characterImageSize,
      loras: [], // Default or extract loras if associated with profile
      model: 'dreamshaper_8.safetensors', // Default or extract model if associated with profile
    });

    res.json(imageResult);
  } catch (error: any) {
    console.error('Error generating image for profile:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to generate image.' });
  }
}

/**
 * @desc Generate images for all profiles linked to a specific passage, including background scenes for the entire scene.
 * @route POST /api/passages/:passageId/generate-images
 * @access Public
 */
export async function generateImagesForPassage(req: Request, res: Response) {
  const { passageId } = req.params;
  const { forceRegenerate } = req.body; // Extract the forceRegenerate flag

  try {
    // Fetch the current passage along with its scene and related profiles
    const passage = await prisma.passage.findUnique({
      where: { id: Number(passageId) },
      include: {
        book: true,
        scene: true, // Include the scene to access other passages in the same scene
        profiles: {
          include: {
            descriptions: true,
            image: {
              include: {
                generationData: {
                  include: {
                    civitaiResources: {
                      include: {
                        model: true,
                      },
                    },
                  },
                },
                model: true,
              },
            },
          },
        },
      },
    });

    if (!passage) {
      res.status(404).json({ error: 'Passage not found.' });
      return;
    }

    const sceneId = passage.scene?.id;
    // **Added Null Check for passage.scene**
    if (!sceneId) {
      res
        .status(400)
        .json({ error: 'Passage is not associated with any scene.' });
      return;
    }

    // Fetch all passages within the same scene as the current passage
    const allPassagesInScene = await prisma.passage.findMany({
      where: { sceneId: sceneId },
      select: { textContent: true },
    });

    if (allPassagesInScene.length === 0) {
      res
        .status(400)
        .json({ error: 'No passages found in the current scene.' });
      return;
    }

    // Combine textContent from all passages in the scene to generate a comprehensive background prompt
    const combinedSceneText = allPassagesInScene
      .map((p) => p.textContent)
      .join(' ');

    const profiles = passage.profiles;

    if (profiles.length === 0) {
      res.status(400).json({ error: 'No profiles linked to this passage.' });
      return;
    }

    const characterProfiles = profiles.filter(
      (profile) => profile.type.toLowerCase() === 'character'
    );
    const nonCharacterProfiles = profiles.filter(
      (profile) => profile.type.toLowerCase() !== 'character'
    );

    const characterImagePromises = characterProfiles.map(
      async (
        profile
      ): Promise<{
        profileId: number;
        profileName: string;
        image: string | null;
        error?: string;
      }> => {
        let generationData = profile.image?.generationData;

        if (!generationData) {
          console.warn(
            `No GenerationData found for profile ID ${profile.id}. Skipping image generation.`
          );
          return {
            profileId: profile.id,
            profileName: profile.name,
            image: null, // Indicate that image generation was skipped
            error: 'No GenerationData available.',
          };
        }

        const civitaiResources = generationData.civitaiResources;

        if (!civitaiResources || civitaiResources.length === 0) {
          console.warn(
            `No CivitaiResources found for profile ID ${profile.id}. Skipping image generation.`
          );
          return {
            profileId: profile.id,
            profileName: profile.name,
            image: null,
            error: 'No CivitaiResources available.',
          };
        }

        // Attempt to find a CivitaiResource with modelType 'Checkpoint'
        const checkpointResource = civitaiResources.find(
          (resource) => resource.modelType.toLowerCase() === 'checkpoint'
        );
        const loraResources = civitaiResources.filter(
          (resource) => resource.modelType.toLowerCase() === 'lora'
        );

        let modelFileName: string | null = null;

        if (checkpointResource) {
          // If 'Checkpoint' modelType exists, use its model's fileName
          const aiModel = await prisma.aiModel.findUnique({
            where: { id: checkpointResource.modelId },
          });

          if (aiModel) {
            modelFileName = aiModel.fileName;
          } else {
            console.warn(
              `AiModel with ID ${checkpointResource.modelId} not found for profile ID ${profile.id}.`
            );
          }
        } else {
          // If no 'Checkpoint' modelType, use the first available modelType
          const firstResource = civitaiResources[0];
          const aiModel = await prisma.aiModel.findFirst({
            where: { type: 'Checkpoint', baseModel: firstResource.baseModel },
          });

          if (aiModel) {
            modelFileName = aiModel.fileName;
          } else {
            console.warn(
              `No AiModel found with type '${firstResource.modelType}' for profile ID ${profile.id}.`
            );
          }
        }

        if (!modelFileName) {
          console.warn(
            `No suitable AiModel fileName found for profile ID ${profile.id}. Skipping image generation.`
          );
          return {
            profileId: profile.id,
            profileName: profile.name,
            image: null,
            error: 'No suitable AiModel found for image generation.',
          };
        }

        // Extract settings from GenerationData
        const {
          prompt,
          steps,
          cfgScale,
          sampler,
          seed,
          size,
          clipSkip,
          negativePrompt,
        } = generationData;

        let finalPrompt = prompt;
        let finalNegativePrompt = negativePrompt;

        // Modify condition to include forceRegenerate
        if (forceRegenerate || !negativePrompt) {
          try {
            const prompts = await generateProfilePrompt(
              passage.textContent,
              {
                name: profile.name,
                descriptions: profile.descriptions.map((desc) => desc.text),
              },
              passage.book.title
            );

            finalPrompt = prompts.positivePrompt;
            finalNegativePrompt = prompts.negativePrompt;
            console.log(profile.name, prompts);

            await prisma.generationData.update({
              where: { id: generationData.id },
              data: {
                prompt: prompts.positivePrompt,
                negativePrompt: prompts.negativePrompt,
              },
            });
          } catch (error: any) {
            console.error(
              `Error generating prompts for profile ID ${profile.id}:`,
              error.message
            );
          }
        }

        try {
          const imageResult = await generateImage({
            prompt: finalPrompt,
            negative_prompt: finalNegativePrompt,
            steps,
            ...characterImageSize,
            loras: loraResources.map((lora) => lora.model.fileName),
            model: modelFileName,
            removeBackground: true,
            // cfg_scale: cfgScale,
            // sampler,
            // seed,
            // clip_skip: clipSkip,
          });
          // update image url in database
          await prisma.profile.update({
            where: { id: profile.id },
            data: {
              imageUrl: imageResult.imageUrl,
            },
          });
          return {
            profileId: profile.id,
            profileName: profile.name,
            image: imageResult.imageUrl,
          };
        } catch (error: any) {
          console.error(
            `Error generating image for profile ID ${profile.id}:`,
            error
          );
          return {
            profileId: profile.id,
            profileName: profile.name,
            image: null,
            error: error.message || 'Image generation failed.',
          };
        }
      }
    );

    const backgroundImagePromise = (async () => {
      try {
        // **New Step**: Associate background generation data with the scene instead of a single passage
        let backgroundGenerationData = await prisma.generationData.findFirst({
          where: {
            sceneBackgroundId: sceneId, // Assuming 'sceneBackgroundId' is a field in generationData
          },
        });

        if (!backgroundGenerationData || forceRegenerate) {
          // **New Step**: Use combinedSceneText to generate the background prompt
          const prompts = await generateBackgroundPrompt(
            combinedSceneText, // Use the aggregated text from all passages in the scene
            nonCharacterProfiles.map((profile) => ({
              name: profile.name,
              descriptions: profile.descriptions.map((desc) => desc.text),
            })),
            passage.book.title
          );

          // **New Step**: Upsert generationData associated with the scene
          backgroundGenerationData = await prisma.generationData.upsert({
            where: { sceneBackgroundId: sceneId }, // Upsert based on sceneBackgroundId
            update: {
              prompt: prompts.positivePrompt,
              negativePrompt: prompts.negativePrompt,
              steps: 20,
              cfgScale: 7.0,
            },
            create: {
              sceneBackgroundId: sceneId, // Link to the scene
              prompt: prompts.positivePrompt,
              negativePrompt: prompts.negativePrompt,
              steps: 20,
              cfgScale: 7.0,
              createdDate: new Date(),
            },
          });
        }

        // You might want to dynamically determine the background model or keep it static
        const backgroundModel = 'dreamshaper_8.safetensors';

        const imageResult = await generateImage({
          prompt: backgroundGenerationData.prompt,
          negative_prompt: backgroundGenerationData.negativePrompt,
          steps: backgroundGenerationData.steps,
          model: backgroundModel,
          ...backgroundSceneSize,
          // cfg_scale: backgroundGenerationData.cfgScale,
          // sampler: backgroundGenerationData.sampler,
          // seed: backgroundGenerationData.seed,
          // clip_skip: backgroundGenerationData.clipSkip,
        });

        // update scene image url in database
        await prisma.scene.update({
          where: { id: sceneId },
          data: {
            imageUrl: imageResult.imageUrl,
          },
        });

        return {
          profileId: 0, // Indicate that this image is for the scene's background
          profileName: 'Background Scene',
          image: imageResult.imageUrl,
        };
      } catch (error: any) {
        console.error('Error generating background image:', error);
        // Even if background image generation fails, provide a fallback or handle accordingly
        return {
          profileId: 0,
          profileName: 'Background Scene',
          image: null,
          error: error.message || 'Background image generation failed.',
        };
      }
    })();

    // Execute all image generation promises in parallel
    const characterImageResults = await Promise.all(characterImagePromises);
    const backgroundImageResult = await backgroundImagePromise;

    // Combine all image results, including the background
    const allImageResults = [...characterImageResults];
    allImageResults.push(backgroundImageResult);
    res.json({ passageId: passage.id, images: allImageResults });
  } catch (error: any) {
    console.error('Error generating images for passage:', error);
    res.status(500).json({
      error:
        error.message ||
        'An error occurred while generating images for the passage.',
    });
  }
}

export async function generateImagesForScene(req: Request, res: Response) {
  const { sceneId } = req.params;
  const { forceRegenerate } = req.body;

  try {
    // Fetch the scene with its passages and profiles
    const scene = await prisma.scene.findUnique({
      where: { id: Number(sceneId) },
      include: {
        book: true,
        passages: {
          include: {
            profiles: {
              include: {
                descriptions: true,
                image: {
                  include: {
                    generationData: {
                      include: {
                        civitaiResources: {
                          include: {
                            model: true,
                          },
                        },
                      },
                    },
                    model: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!scene) {
      res.status(404).json({ error: 'Scene not found.' });
      return;
    }

    // Aggregate all passages' textContent in the scene
    const combinedSceneText = scene.passages
      .map((p) => p.textContent)
      .join(' ');

    // Collect unique profiles across all passages
    const uniqueProfilesMap: { [profileId: number]: ProfileWithRelations } = {};
    scene.passages.forEach((passage) => {
      passage.profiles.forEach((profile) => {
        uniqueProfilesMap[profile.id] = profile;
      });
    });
    const uniqueProfiles = Object.values(uniqueProfilesMap);

    if (uniqueProfiles.length === 0) {
      res.status(400).json({ error: 'No profiles linked to this scene.' });
      return;
    }

    // Generate background prompt
    const backgroundPrompt = await generateBackgroundPrompt(
      combinedSceneText,
      uniqueProfiles
        .filter((p) => p.type.toLowerCase() !== 'character')
        .map((profile) => ({
          name: profile.name,
          descriptions: profile.descriptions.map((desc) => desc.text),
        })),
      scene.book.title
    );

    // Generate background image
    let backgroundImageBase64: string | null = null;
    if (forceRegenerate || !scene.imageUrl) {
      try {
        const backgroundImageResult = await generateImage({
          prompt: backgroundPrompt.positivePrompt,
          negative_prompt: backgroundPrompt.negativePrompt,
          steps: 20,
          ...backgroundSceneSize,
          loras: [],
          model: 'dreamshaper_8.safetensors',
        });

        // Optionally remove background
        const config: Config = {
          debug: false,
          progress: (key: string, current: number, total: number) => {
            const [type, subtype] = key.split(':');
            console.log(
              `${type} ${subtype} ${((current / total) * 100).toFixed(0)}%`
            );
          },
          model: 'small',
          output: {
            quality: 0.8,
            format: 'image/png',
          },
        };

        // Update Scene.imageUrl in the database
        await prisma.scene.update({
          where: { id: Number(sceneId) },
          data: { imageUrl: backgroundImageResult.imageUrl },
        });
      } catch (error: any) {
        console.error('Error generating background image:', error);
        backgroundImageBase64 = null;
      }
    } else {
      backgroundImageBase64 = scene.imageUrl;
    }

    // Generate images for each unique profile
    const profileImagePromises = uniqueProfiles.map(async (profile) => {
      if (!profile.image || !profile.image.generationData) {
        return {
          profileId: profile.id,
          profileName: profile.name,
          image: null,
          error: 'No GenerationData available.',
        };
      }

      const generationData = profile.image.generationData;
      const civitaiResources = generationData.civitaiResources;

      if (!civitaiResources || civitaiResources.length === 0) {
        return {
          profileId: profile.id,
          profileName: profile.name,
          image: null,
          error: 'No CivitaiResources available.',
        };
      }

      // Determine model file name
      const checkpointResource = civitaiResources.find(
        (resource) => resource.modelType.toLowerCase() === 'checkpoint'
      );
      const loraResources = civitaiResources.filter(
        (resource) => resource.modelType.toLowerCase() === 'lora'
      );

      let modelFileName: string | null = null;

      if (checkpointResource) {
        const aiModel = await prisma.aiModel.findUnique({
          where: { id: checkpointResource.modelId },
        });

        if (aiModel) {
          modelFileName = aiModel.fileName;
        }
      } else if (civitaiResources.length > 0) {
        const firstResource = civitaiResources[0];
        const aiModel = await prisma.aiModel.findFirst({
          where: { type: 'Checkpoint', baseModel: firstResource.baseModel },
        });

        if (aiModel) {
          modelFileName = aiModel.fileName;
        }
      }

      if (!modelFileName) {
        return {
          profileId: profile.id,
          profileName: profile.name,
          image: null,
          error: 'No suitable AiModel found for image generation.',
        };
      }

      // Determine prompts
      let finalPrompt = generationData.prompt;
      let finalNegativePrompt = generationData.negativePrompt;

      if (forceRegenerate || !generationData.negativePrompt) {
        try {
          const prompts = await generateProfilePrompt(
            scene.passages.map((p) => p.textContent).join(' '),
            {
              name: profile.name,
              descriptions: profile.descriptions.map((desc) => desc.text),
            },
            scene.book.title
          );

          finalPrompt = prompts.positivePrompt;
          finalNegativePrompt = prompts.negativePrompt;

          // Update GenerationData in the database
          await prisma.generationData.update({
            where: { id: generationData.id },
            data: {
              prompt: prompts.positivePrompt,
              negativePrompt: prompts.negativePrompt,
            },
          });
        } catch (error: any) {
          console.error(
            `Error generating prompts for profile ID ${profile.id}:`,
            error.message
          );
        }
      }

      try {
        const imageResult = await generateImage({
          prompt: finalPrompt,
          negative_prompt: finalNegativePrompt,
          steps: generationData.steps,
          ...characterImageSize,
          loras: loraResources.map((lora) => lora.model.fileName),
          model: modelFileName,
          removeBackground: true,
          // cfg_scale: generationData.cfgScale,
          // sampler: generationData.sampler,
          // seed: generationData.seed,
          // clip_skip: generationData.clipSkip,
        });

        // Update Profile.imageUrl in the database
        await prisma.profile.update({
          where: { id: profile.id },
          data: { imageUrl: imageResult.imageUrl },
        });

        return {
          profileId: profile.id,
          profileName: profile.name,
          image: imageResult.imageUrl,
        };
      } catch (error: any) {
        console.error(
          `Error generating image for profile ID ${profile.id}:`,
          error
        );
        return {
          profileId: profile.id,
          profileName: profile.name,
          image: null,
          error: error.message || 'Image generation failed.',
        };
      }
    });

    const profileImageResults = await Promise.all(profileImagePromises);

    // Prepare response
    const responseImages = [
      {
        profileId: 0, // Background image
        profileName: 'Background Scene',
        image: backgroundImageBase64,
      },
      ...profileImageResults,
    ];

    res.json({ sceneId: scene.id, images: responseImages });
  } catch (error: any) {
    console.error('Error generating images for scene:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to generate images for scene.' });
  }
}
export async function generateImagesForMultipleScenes(
  req: Request,
  res: Response
) {
  const { startSceneId, numberOfScenes, forceRegenerate } = req.body;

  if (!startSceneId || !numberOfScenes || numberOfScenes < 1) {
    res.status(400).json({ error: 'Invalid parameters.' });
    return;
  }

  try {
    // Fetch the starting scene
    const startScene = await prisma.scene.findUnique({
      where: { id: Number(startSceneId) },
    });

    if (!startScene) {
      res.status(404).json({ error: 'Starting scene not found.' });
      return;
    }

    // Fetch next N scenes based on order
    const scenes = await prisma.scene.findMany({
      where: {
        bookId: startScene.bookId,
        order: {
          gt: startScene.order,
        },
      },
      orderBy: { order: 'asc' },
      take: numberOfScenes,
    });

    if (scenes.length === 0) {
      res.status(400).json({ error: 'No subsequent scenes found.' });
      return;
    }

    const successScenes: number[] = [];
    const failedScenes: { sceneId: number; error: string }[] = [];

    // Iterate through each scene and generate images
    for (const scene of scenes) {
      try {
        await generateImagesForSceneLogic(scene.id, forceRegenerate);
        successScenes.push(scene.id);
      } catch (error: any) {
        console.error(`Error generating images for scene ${scene.id}:`, error);
        failedScenes.push({
          sceneId: scene.id,
          error: error.message || 'Image generation failed.',
        });
      }
    }

    res.json({ successScenes, failedScenes });
  } catch (error: any) {
    console.error('Error generating images for multiple scenes:', error);
    res.status(500).json({
      error:
        error.message ||
        'An error occurred while generating images for multiple scenes.',
    });
  }
}
// Helper function to generate images for a single scene
async function generateImagesForSceneLogic(
  sceneId: number,
  forceRegenerate: boolean
) {
  // Reuse the generateImagesForScene logic
  // This function can be imported or duplicated as needed
  // For simplicity, assuming it's similar to generateImagesForScene without the HTTP response

  // Fetch the scene with its passages and profiles
  const scene = await prisma.scene.findUnique({
    where: { id: Number(sceneId) },
    include: {
      book: true,
      passages: true,
    },
  });

  if (!scene) {
    throw new Error('Scene not found.');
  }

  // Aggregate all passages' textContent in the scene
  const combinedSceneText = scene.passages.map((p) => p.textContent).join(' ');

  // Collect unique profiles across all passages
  const uniqueProfilesMap: { [profileId: number]: ProfileWithRelations } = {};
  const passageIds = scene.passages.map((p) => p.id);
  // find all profiles linked to passages from the descriptionIds
  const descriptions = await prisma.description.findMany({
    where: {
      passageId: {
        in: passageIds,
      },
    },
    include: {
      profile: {
        include: {
          descriptions: true,
          image: {
            include: {
              generationData: {
                include: {
                  civitaiResources: {
                    include: {
                      model: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  descriptions.forEach((desc) => {
    uniqueProfilesMap[desc?.profile?.id] = desc.profile;
  });
  const uniqueProfiles = Object.values(uniqueProfilesMap);

  if (uniqueProfiles.length === 0) {
    throw new Error('No profiles linked to this scene.');
  }

  // Generate background prompt
  const backgroundPrompt = await generateBackgroundPrompt(
    combinedSceneText,
    uniqueProfiles
      .filter((p) => p.type.toLowerCase() !== 'character')
      .map((profile) => ({
        name: profile.name,
        descriptions: profile.descriptions.map((desc) => desc.text),
      })),
    scene.book.title
  );

  // Generate background image
  let backgroundImageBase64: string | null = null;
  if (forceRegenerate || !scene.imageUrl) {
    try {
      const backgroundImageResult = await generateImage({
        prompt: backgroundPrompt.positivePrompt,
        negative_prompt: backgroundPrompt.negativePrompt,
        steps: 20,
        ...backgroundSceneSize,
        loras: [],
        model: 'dreamshaper_8.safetensors',
      });

      // Optionally remove background
      const config: Config = {
        debug: false,
        progress: (key: string, current: number, total: number) => {
          const [type, subtype] = key.split(':');
          console.log(
            `${type} ${subtype} ${((current / total) * 100).toFixed(0)}%`
          );
        },
        model: 'small',
        output: { quality: 0.8, format: 'image/png' },
      };

      // Update Scene.imageUrl in the database
      await prisma.scene.update({
        where: { id: Number(sceneId) },
        data: { imageUrl: backgroundImageResult.imageUrl },
      });
    } catch (error: any) {
      console.error('Error generating background image:', error);
      backgroundImageBase64 = null;
    }
  } else {
    backgroundImageBase64 = scene.imageUrl;
  }

  // Generate images for each unique profile
  const profileImagePromises = uniqueProfiles.map(async (profile) => {
    if (!profile.image || !profile.image.generationData) {
      return {
        profileId: profile.id,
        profileName: profile.name,
        image: null,
        error: 'No GenerationData available.',
      };
    }

    const generationData = profile.image.generationData;
    const civitaiResources = generationData.civitaiResources;

    if (!civitaiResources || civitaiResources.length === 0) {
      return {
        profileId: profile.id,
        profileName: profile.name,
        image: null,
        error: 'No CivitaiResources available.',
      };
    }

    // Determine model file name
    const checkpointResource = civitaiResources.find(
      (resource) => resource.modelType.toLowerCase() === 'checkpoint'
    );
    const loraResources = civitaiResources.filter(
      (resource) => resource.modelType.toLowerCase() === 'lora'
    );

    let modelFileName: string | null = null;

    if (checkpointResource) {
      const aiModel = await prisma.aiModel.findUnique({
        where: { id: checkpointResource.modelId },
      });

      if (aiModel) {
        modelFileName = aiModel.fileName;
      }
    } else if (civitaiResources.length > 0) {
      const firstResource = civitaiResources[0];
      const aiModel = await prisma.aiModel.findFirst({
        where: { type: 'Checkpoint', baseModel: firstResource.baseModel },
      });

      if (aiModel) {
        modelFileName = aiModel.fileName;
      }
    }

    if (!modelFileName) {
      return {
        profileId: profile.id,
        profileName: profile.name,
        image: null,
        error: 'No suitable AiModel found for image generation.',
      };
    }

    // Determine prompts
    let finalPrompt = generationData.prompt;
    let finalNegativePrompt = generationData.negativePrompt;

    if (forceRegenerate || !generationData.negativePrompt) {
      try {
        const prompts = await generateProfilePrompt(
          scene.passages.map((p) => p.textContent).join(' '),
          {
            name: profile.name,
            descriptions: profile.descriptions.map((desc) => desc.text),
          },
          scene.book.title
        );

        finalPrompt = prompts.positivePrompt;
        finalNegativePrompt = prompts.negativePrompt;

        // Update GenerationData in the database
        await prisma.generationData.update({
          where: { id: generationData.id },
          data: {
            prompt: prompts.positivePrompt,
            negativePrompt: prompts.negativePrompt,
          },
        });
      } catch (error: any) {
        console.error(
          `Error generating prompts for profile ID ${profile.id}:`,
          error.message
        );
      }
    }

    try {
      const imageResult = await generateImage({
        prompt: finalPrompt,
        negative_prompt: finalNegativePrompt,
        steps: generationData.steps,
        ...characterImageSize,
        loras: loraResources.map((lora) => lora.model.fileName),
        model: modelFileName,
        removeBackground: true,
        // cfg_scale: generationData.cfgScale,
        // sampler: generationData.sampler,
        // seed: generationData.seed,
        // clip_skip: generationData.clipSkip,
      });

      // Update Profile.imageUrl in the database
      await prisma.profile.update({
        where: { id: profile.id },
        data: { imageUrl: imageResult.imageUrl },
      });

      return {
        profileId: profile.id,
        profileName: profile.name,
        image: imageResult.imageUrl,
      };
    } catch (error: any) {
      console.error(
        `Error generating image for profile ID ${profile.id}:`,
        error
      );
      return {
        profileId: profile.id,
        profileName: profile.name,
        image: null,
        error: error.message || 'Image generation failed.',
      };
    }
  });

  const profileImageResults = await Promise.all(profileImagePromises);

  // Prepare response
  const responseImages = [
    {
      profileId: 0, // Background image
      profileName: 'Background Scene',
      image: backgroundImageBase64,
    },
    ...profileImageResults,
  ];

  return responseImages;
}

// Update Scene.imageUrl
export async function updateSceneImageUrl(req: Request, res: Response) {
  const { sceneId } = req.params;
  const { imageUrl } = req.body;

  try {
    const scene = await prisma.scene.update({
      where: { id: Number(sceneId) },
      data: { imageUrl },
    });

    res.json({ message: 'Scene imageUrl updated successfully.', scene });
  } catch (error: any) {
    console.error('Error updating scene imageUrl:', error);
    res.status(500).json({
      error: error.message || 'Failed to update scene imageUrl.',
    });
  }
}
export async function updateProfileImageUrl(req: Request, res: Response) {
  const { profileId } = req.params;
  const { imageUrl } = req.body;

  try {
    const profile = await prisma.profile.update({
      where: { id: Number(profileId) },
      data: { imageUrl },
    });

    res.json({ message: 'Profile imageUrl updated successfully.', profile });
  } catch (error: any) {
    console.error('Error updating profile imageUrl:', error);
    res.status(500).json({
      error: error.message || 'Failed to update profile imageUrl.',
    });
  }
}
