import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { generateImage } from '../services/imageService';
import {
  generateBackgroundPrompt,
  generateProfilePrompt,
} from '../utils/prompts';
import { ProfileWithRelations, SceneWithRelations } from '../utils/types';

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

// Helper function to ensure GenerationData exists for a profile
async function ensureGenerationDataForProfile(
  profile: ProfileWithRelations,
  characterImageSize: { width: number; height: number }
): Promise<void> {
  if (!profile.image) {
    // Create a default ModelImage for the profile
    const randomId = Math.floor(Math.random() * 1000000);
    const modelImage = await prisma.modelImage.create({
      data: {
        // randomId: '', // Optional random
        id: randomId, // Random ID
        url: '', // Placeholder
        modelId: 4384, // Or some default modelId
        nsfwLevel: 0,
        width: characterImageSize.width,
        height: characterImageSize.height,
        hash: '',
        type: 'default',
        hasMeta: false,
        onSite: false,
        // generationData: {
        //   create: {
        //     prompt: '', // Will be filled later
        //     steps: 20,
        //     cfgScale: 7.0,
        //     createdDate: new Date(),
        //   },
        // },
      },
    });
    // Update profile to link to the new image
    await prisma.profile.update({
      where: { id: profile.id },
      data: { imageId: modelImage.id },
    });
    profile.image = modelImage; // Update profile.image for further use
  }

  if (!profile.image.generationData) {
    // Create default GenerationData and associate it with profile.image
    const generationData = await prisma.generationData.create({
      data: {
        prompt: '', // Will be filled later
        steps: 20,
        cfgScale: 7.0,
        negativePrompt: '',
        sampler: 'Euler a', // Default sampler
        seed: Math.floor(Math.random() * 1000000), // Random seed
        size: `${characterImageSize.width}x${characterImageSize.height}`,
        createdDate: new Date(),
        clipSkip: null,
        modelImageId: profile.image.id,
      },
    });
    // Update profile.image to include generationData
    profile.image.generationData = generationData;
  }
}

export async function generateImageForProfile(req: Request, res: Response) {
  const { profileId } = req.params;
  const { forceRegenerate } = req.body;

  try {
    // Fetch the profile with necessary relations
    const profile = await prisma.profile.findUnique({
      where: { id: Number(profileId) },
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
        book: true, // Include book to get the title
      },
    });

    if (!profile) {
      res.status(404).json({ error: 'Profile not found.' });
      return;
    }

    // Fetch passages associated with the profile to get context
    const passages = await prisma.passage.findMany({
      where: {
        profiles: {
          some: { id: profile.id },
        },
      },
      select: { textContent: true },
    });

    const passageText = passages.map((p) => p.textContent).join(' ');
    const bookTitle = profile.book?.title || 'Unknown Book';

    // Generate image for the profile using the helper function
    const result = await generateImageForProfileHelper(
      profile,
      passageText,
      bookTitle,
      forceRegenerate,
      characterImageSize
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error generating image for profile:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate image for profile.',
    });
  }
}

export async function generateImagesForChapter(req: Request, res: Response) {
  const { chapterId } = req.params;
  const { forceRegenerate } = req.body;

  if (!chapterId) {
    res.status(400).json({ error: 'Chapter ID is required.' });
    return;
  }

  try {
    // Fetch the chapter with its scenes
    const chapter = await prisma.chapter.findUnique({
      where: { id: Number(chapterId) },
      include: {
        book: true,
        scenes: {
          include: {
            passages: true,
          },
        },
      },
    });

    if (!chapter) {
      res.status(404).json({ error: 'Chapter not found.' });
      return;
    }

    // Collect all scene IDs in the chapter
    const sceneIds = chapter.scenes.map((scene) => scene.id);

    if (sceneIds.length === 0) {
      res.status(400).json({ error: 'No scenes found in this chapter.' });
      return;
    }

    // Create a new job
    const job = await prisma.imageGenerationJob.create({
      data: {
        type: 'chapter',
        targetId: chapter.id,
        status: 'in_progress',
        totalTasks: sceneIds.length,
        progress: 0.0,
      },
    });

    // Return the job ID to the client
    res.json({ jobId: job.id, message: 'Image generation job started.' });

    // Process scenes asynchronously
    (async () => {
      for (const [index, sceneId] of sceneIds.entries()) {
        try {
          await generateImagesForSceneLogic(sceneId, forceRegenerate);

          // Update job progress
          await prisma.imageGenerationJob.update({
            where: { id: job.id },
            data: {
              completedTasks: { increment: 1 },
              progress: ((index + 1) / sceneIds.length) * 100,
            },
          });
        } catch (error: any) {
          console.error(`Error generating images for scene ${sceneId}:`, error);

          // Update job with failed task
          await prisma.imageGenerationJob.update({
            where: { id: job.id },
            data: {
              failedTasks: { increment: 1 },
            },
          });
        }
      }

      // Finalize job status
      const finalJob = await prisma.imageGenerationJob.findUnique({
        where: { id: job.id },
      });
      const finalStatus = finalJob?.failedTasks
        ? 'completed_with_errors'
        : 'completed';

      await prisma.imageGenerationJob.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          progress: 100.0,
        },
      });
    })();
  } catch (error: any) {
    console.error('Error generating images for chapter:', error);
    res.status(500).json({
      error:
        error.message ||
        'An error occurred while generating images for the chapter.',
    });
  }
}

export async function getJobStatus(req: Request, res: Response) {
  const { jobId } = req.params;

  try {
    const job = await prisma.imageGenerationJob.findUnique({
      where: { id: Number(jobId) },
    });

    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }

    res.json(job);
  } catch (error: any) {
    console.error('Error fetching job status:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch job status.',
    });
  }
}

export async function listJobs(req: Request, res: Response) {
  try {
    const jobs = await prisma.imageGenerationJob.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20, // Fetch last 20 jobs
    });

    res.json(jobs);
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({
      error: error.message || 'Failed to fetch jobs.',
    });
  }
}

// Helper function to generate image for a profile
async function generateImageForProfileHelper(
  profile: ProfileWithRelations,
  passageText: string,
  bookTitle: string,
  forceRegenerate: boolean,
  characterImageSize: { width: number; height: number }
): Promise<{
  profileId: number;
  profileName: string;
  image: string | null;
  error?: string;
}> {
  try {
    await ensureGenerationDataForProfile(profile, characterImageSize);
    const generationData = profile.image!.generationData!;
    const civitaiResources = generationData.civitaiResources;

    // Determine model file name
    let modelFileName: string | null = null;
    const checkpointResource = civitaiResources?.find(
      (resource) => resource?.modelType.toLowerCase() === 'checkpoint'
    );
    const loraResources =
      civitaiResources?.filter(
        (resource) => resource?.modelType.toLowerCase() === 'lora'
      ) || [];

    if (checkpointResource) {
      const aiModel = await prisma.aiModel.findUnique({
        where: { id: checkpointResource.modelId },
      });
      if (aiModel) {
        modelFileName = aiModel.fileName;
      }
    } else {
      // Use default model if no checkpointResource
      modelFileName = 'dreamshaper_8.safetensors'; // Replace with your default model
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

    // Determine prompts
    let finalPrompt = generationData.prompt;
    let finalNegativePrompt = generationData.negativePrompt;

    if (
      forceRegenerate ||
      !generationData.negativePrompt ||
      !generationData.prompt
    ) {
      try {
        const prompts = await generateProfilePrompt(
          passageText,
          {
            name: profile.name,
            descriptions: profile.descriptions.map((desc) => desc.text),
          },
          bookTitle
        );

        finalPrompt = prompts.positivePrompt;
        finalNegativePrompt = prompts.negativePrompt;

        // Update GenerationData in the database
        await prisma.generationData.update({
          where: { id: generationData.id },
          data: {
            prompt: finalPrompt,
            negativePrompt: finalNegativePrompt,
          },
        });
      } catch (error: any) {
        console.error(
          `Error generating prompts for profile ID ${profile.id}:`,
          error.message
        );
      }
    }

    // Generate image
    const imageResult = await generateImage({
      prompt: finalPrompt,
      negative_prompt: finalNegativePrompt,
      steps: generationData.steps,
      ...characterImageSize,
      loras: loraResources.filter((l) => l).map((lora) => lora!.model.fileName),
      model: modelFileName,
      removeBackground: true,
      // cfg_scale: generationData.cfgScale,
      // sampler: generationData.sampler,
      // seed: generationData.seed,
      // clip_skip: generationData.clipSkip,
    });

    // Update profile.imageUrl in database
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

// Helper function to generate background image for a scene
async function generateBackgroundImageForScene(
  scene: SceneWithRelations,
  combinedSceneText: string,
  bookTitle: string,
  forceRegenerate: boolean,
  backgroundSceneSize: { width: number; height: number }
): Promise<{ image: string | null; error?: string }> {
  try {
    // Ensure GenerationData exists for the scene background
    let generationData = await prisma.generationData.findFirst({
      where: { sceneBackgroundId: scene.id },
    });

    if (!generationData) {
      // Create default GenerationData for scene background
      generationData = await prisma.generationData.create({
        data: {
          sceneBackgroundId: scene.id,
          prompt: '',
          steps: 20,
          cfgScale: 7.0,
          negativePrompt: '',
          sampler: 'Euler a',
          seed: Math.floor(Math.random() * 1000000),
          size: `${backgroundSceneSize.width}x${backgroundSceneSize.height}`,
          createdDate: new Date(),
          clipSkip: null,
        },
      });
    }

    if (
      forceRegenerate ||
      !generationData.prompt ||
      !generationData.negativePrompt
    ) {
      // Generate prompts
      const prompts = await generateBackgroundPrompt(
        combinedSceneText,
        [], // No profiles in this context
        bookTitle
      );

      // Update GenerationData
      await prisma.generationData.update({
        where: { id: generationData.id },
        data: {
          prompt: prompts.positivePrompt,
          negativePrompt: prompts.negativePrompt,
        },
      });
      generationData.prompt = prompts.positivePrompt;
      generationData.negativePrompt = prompts.negativePrompt;
    }

    // Generate image
    const imageResult = await generateImage({
      prompt: generationData.prompt,
      negative_prompt: generationData.negativePrompt,
      steps: generationData.steps,
      ...backgroundSceneSize,
      loras: [], // No loras for background
      model: 'dreamshaper_8.safetensors', // Use your default background model
      // Additional params if needed
    });

    // Update scene.imageUrl
    await prisma.scene.update({
      where: { id: scene.id },
      data: { imageUrl: imageResult.imageUrl },
    });

    return { image: imageResult.imageUrl };
  } catch (error: any) {
    console.error('Error generating background image:', error);
    return {
      image: null,
      error: error.message || 'Background image generation failed.',
    };
  }
}

export async function generateImagesForPassage(req: Request, res: Response) {
  const { passageId } = req.params;
  const { forceRegenerate } = req.body;

  try {
    // Fetch the current passage along with its scene and related profiles
    const passage = await prisma.passage.findUnique({
      where: { id: Number(passageId) },
      include: {
        book: true,
        scene: {
          include: {
            book: true, // Ensure the book is included in the scene
          },
        },
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

    // Generate images for character profiles
    const characterImagePromises = characterProfiles.map((profile) =>
      generateImageForProfileHelper(
        profile,
        passage.textContent,
        passage.book.title,
        forceRegenerate,
        characterImageSize
      )
    );

    // Generate background image
    const backgroundImagePromise = generateBackgroundImageForScene(
      passage.scene!,
      combinedSceneText,
      passage.book.title,
      forceRegenerate,
      backgroundSceneSize
    ).then((result) => ({
      profileId: 0,
      profileName: 'Background Scene',
      image: result.image,
      error: result.error,
    }));

    // Execute all image generation promises in parallel
    const characterImageResults = await Promise.all(characterImagePromises);
    const backgroundImageResult = await backgroundImagePromise;

    // Combine all image results, including the background
    const allImageResults = [...characterImageResults, backgroundImageResult];
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

    // Generate images for each unique profile
    const profileImagePromises = uniqueProfiles.map((profile) =>
      generateImageForProfileHelper(
        profile,
        combinedSceneText,
        scene.book.title,
        forceRegenerate,
        characterImageSize
      )
    );

    // Generate background image
    const backgroundImageResult = await generateBackgroundImageForScene(
      scene,
      combinedSceneText,
      scene.book.title,
      forceRegenerate,
      backgroundSceneSize
    );

    // Prepare response
    const profileImageResults = await Promise.all(profileImagePromises);
    const responseImages = [
      {
        profileId: 0, // Background image
        profileName: 'Background Scene',
        image: backgroundImageResult.image,
        error: backgroundImageResult.error,
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
          gte: startScene.order,
        },
      },
      orderBy: { order: 'asc' },
      take: numberOfScenes,
    });

    if (scenes.length === 0) {
      res.status(400).json({ error: 'No scenes found.' });
      return;
    }

    const successScenes: number[] = [];
    const failedScenes: { sceneId: number; error: string }[] = [];

    // Iterate through each scene and generate images
    for (const scene of scenes) {
      try {
        // Reuse generateImagesForScene logic
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

// Helper function to generate images for a single scene without HTTP response
async function generateImagesForSceneLogic(
  sceneId: number,
  forceRegenerate: boolean
) {
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
    throw new Error('Scene not found.');
  }

  // Aggregate all passages' textContent in the scene
  const combinedSceneText = scene.passages.map((p) => p.textContent).join(' ');

  // Collect unique profiles across all passages
  const uniqueProfilesMap: { [profileId: number]: ProfileWithRelations } = {};
  scene.passages.forEach((passage) => {
    passage.profiles.forEach((profile) => {
      uniqueProfilesMap[profile.id] = profile;
    });
  });
  const uniqueProfiles = Object.values(uniqueProfilesMap);

  if (uniqueProfiles.length === 0) {
    throw new Error('No profiles linked to this scene.');
  }

  // Generate images for each unique profile
  const profileImagePromises = uniqueProfiles.map((profile) =>
    generateImageForProfileHelper(
      profile,
      combinedSceneText,
      scene.book.title,
      forceRegenerate,
      characterImageSize
    )
  );

  // Generate background image
  const backgroundImageResult = await generateBackgroundImageForScene(
    scene,
    combinedSceneText,
    scene.book.title,
    forceRegenerate,
    backgroundSceneSize
  );

  // Prepare response (optional, since this function doesn't return HTTP response)
  const profileImageResults = await Promise.all(profileImagePromises);
  const responseImages = [
    {
      profileId: 0, // Background image
      profileName: 'Background Scene',
      image: backgroundImageResult.image,
      error: backgroundImageResult.error,
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
