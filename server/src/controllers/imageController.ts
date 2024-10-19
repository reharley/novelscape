import { ImageGenerationJob } from '@prisma/client';
import { Request, Response } from 'express';

import prisma from '../config/prisma.js';
import { getCanonicalNames } from '../services/bookService.js';
import { generateImage } from '../services/imageService.js';
import { progressManager } from '../utils/progressManager.js';
import {
  generateBackgroundPrompt,
  generateProfilePrompt,
} from '../utils/prompts.js';
import {
  ChapterWithRelations,
  ProfileWithRelations,
  SceneWithRelations,
} from '../utils/types.js';

const characterImageSize = {
  width: 512,
  height: 768,
};
const backgroundSceneSize = {
  width: 768,
  height: 512,
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
      positive_loras: loras,
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
    const modelImage = await prisma.modelImage.create({
      data: {
        url: '', // Placeholder
        modelId: 4384, // Or some default modelId
        nsfwLevel: 0,
        width: characterImageSize.width,
        height: characterImageSize.height,
        hash: '',
        type: 'default',
        hasMeta: false,
        onSite: false,
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
      characterImageSize,
      null
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
  const { forceRegenerate, profileOptions, backgroundOptions } = req.body;

  if (!chapterId) {
    res.status(400).json({ error: 'Chapter ID is required.' });
    return;
  }

  try {
    // Fetch the chapter with its scenes, passages, and profiles
    const chapter = await prisma.chapter.findUnique({
      where: { id: Number(chapterId) },
      include: {
        book: true,
        scenes: {
          include: {
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

    // Collect all unique profiles in the chapter
    const profileIdsSet = new Set<number>();
    chapter.scenes.forEach((scene) => {
      scene.passages.forEach((passage) => {
        passage.profiles.forEach((profile) => {
          profileIdsSet.add(profile.id);
        });
      });
    });

    const profileIds = Array.from(profileIdsSet);

    // Fetch profiles with necessary includes
    const profiles = await prisma.profile.findMany({
      where: { id: { in: profileIds } },
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
        book: true,
      },
    });

    const totalTasks = sceneIds.length + profiles.length;

    // Create a new job
    const job = await prisma.imageGenerationJob.create({
      data: {
        type: 'chapter',
        targetId: chapter.id,
        status: 'in_progress',
        totalTasks: totalTasks,
        progress: 0.0,
      },
    });

    // Return the job ID to the client
    res.json({ jobId: job.id, message: 'Image generation job started.' });

    // Process images asynchronously
    (async () => {
      try {
        // Generate background images
        await generateBackgroundImagesForChapter(
          chapter,
          job,
          forceRegenerate,
          backgroundOptions
        );

        // Generate profile images
        await generateProfileImagesForChapter(
          chapter,
          profiles,
          job,
          forceRegenerate,
          profileOptions
        );

        // Finalize job status
        await prisma.imageGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'completed',
            progress: 100.0,
          },
        });
        progressManager.sendProgress(job.targetId, {
          status: 'phase_completed',
          phase: 'Phase 5',
          completed: job.totalTasks,
          total: job.totalTasks,
        });
      } catch (error: any) {
        console.error('Error generating images for chapter:', error);

        // Update job with failed status
        await prisma.imageGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
          },
        });

        progressManager.sendProgress(job.targetId, {
          status: 'error',
          phase: 'Phase 5',
          message: error.message || 'Image generation failed.',
          completed: job.totalTasks,
          total: job.totalTasks,
        });
      }
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

// New helper function to generate all background images sequentially
export async function generateBackgroundImagesForChapter(
  chapter: ChapterWithRelations,
  job: ImageGenerationJob,
  forceRegenerate: boolean,
  backgroundOptions: any
) {
  const canonicalNames = await getCanonicalNames(chapter.bookId);
  for (const scene of chapter.scenes) {
    try {
      // Aggregate all passages' textContent in the scene
      let passages = scene.passages || [];
      const combinedSceneText = passages.map((p) => p.textContent).join('\n');

      // Generate background image for scene
      await generateBackgroundImageForScene(
        scene,
        combinedSceneText,
        chapter.book.title,
        forceRegenerate,
        backgroundSceneSize,
        backgroundOptions,
        canonicalNames
      );

      // Update job progress
      const jobTmp = await prisma.imageGenerationJob.update({
        where: { id: job.id },
        data: {
          completedTasks: { increment: 1 },
          progress: {
            increment: (1 / job.totalTasks) * 100,
          },
        },
      });

      progressManager.sendProgress(job.targetId, {
        status: 'phase_progress',
        phase: 'Phase 5',
        completed: jobTmp.completedTasks,
        total: jobTmp.totalTasks,
      });
    } catch (error: any) {
      console.error(
        `Error generating background image for scene ${scene.id}:`,
        error
      );
      // Update job with failed task
      const jobTmp = await prisma.imageGenerationJob.update({
        where: { id: job.id },
        data: {
          failedTasks: { increment: 1 },
        },
      });
      progressManager.sendProgress(job.targetId, {
        status: 'phase_progress',
        phase: 'Phase 5',
        completed: jobTmp.completedTasks,
        total: jobTmp.totalTasks,
      });
    }
  }
}
/**
 * Removes any substrings from a comma-separated string that contain any of the first or last names as whole words.
 * The matching is case-insensitive.
 * @param names - List of names (first and last)
 * @param str - Comma-separated string to filter
 * @returns Filtered string with substrings not containing the names
 */
function removeNamesFromString(names: string[], str: string): string {
  const nameParts = new Set(
    names.flatMap((name) => name.toLowerCase().split(/\s+/))
  );

  const stringsArray = str.split(',');

  const filteredArray = stringsArray.filter((s) => {
    const words = s.toLowerCase().split(/\W+/);
    return !words.some((word) => nameParts.has(word));
  });

  return filteredArray.join(',');
}
// New helper function to generate all profile images sequentially
export async function generateProfileImagesForChapter(
  chapter: ChapterWithRelations,
  profiles: ProfileWithRelations[],
  job: ImageGenerationJob,
  forceRegenerate: boolean,
  profileOptions: any
) {
  // Aggregate all passages' textContent in the chapter
  const combinedChapterText = chapter.scenes
    .flatMap((scene) => scene.passages)
    .map((p) => p!.textContent)
    .join(' ');

  for (const profile of profiles) {
    try {
      // Generate image for profile
      await generateImageForProfileHelper(
        profile,
        combinedChapterText,
        chapter.book.title,
        forceRegenerate,
        characterImageSize,
        profileOptions
      );

      // Update job progress
      const jobTmp = await prisma.imageGenerationJob.update({
        where: { id: job.id },
        data: {
          completedTasks: { increment: 1 },
          progress: {
            increment: (1 / job.totalTasks) * 100,
          },
        },
      });
      progressManager.sendProgress(job.targetId, {
        status: 'phase_progress',
        phase: 'Phase 5',
        completed: jobTmp.completedTasks,
        total: jobTmp.totalTasks,
      });
    } catch (error: any) {
      console.error(`Error generating image for profile ${profile.id}:`, error);
      // Update job with failed task
      await prisma.imageGenerationJob.update({
        where: { id: job.id },
        data: {
          failedTasks: { increment: 1 },
        },
      });
    }
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

// Modify the function signature to accept profileOptions
async function generateImageForProfileHelper(
  profile: ProfileWithRelations,
  passageText: string,
  bookTitle: string,
  forceRegenerate: boolean,
  characterImageSize: { width: number; height: number },
  profileOptions: any // Add this parameter
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

    // Use the checkpoint from profileOptions if provided
    if (profileOptions?.checkpoint) {
      modelFileName = profileOptions.checkpoint;
    } else {
      // Existing logic to determine the model
      const checkpointResource = civitaiResources?.find(
        (resource) => resource?.modelType.toLowerCase() === 'checkpoint'
      );

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
          bookTitle
        );

        finalPrompt = `${profile.name}, ${prompts.positivePrompt}`;
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

    // Handle LoRAs
    const positiveLoras = profileOptions?.positiveLoras || [];
    const negativeLoras = profileOptions?.negativeLoras || [];

    // Generate image
    const imageResult = await generateImage(
      {
        prompt: finalPrompt,
        negative_prompt: finalNegativePrompt,
        steps: generationData.steps,
        ...characterImageSize,
        // Pass the options to generateImage
        positive_loras: positiveLoras,
        negative_loras: negativeLoras,
        embeddings: profileOptions?.embeddings,
        negative_embeddings: profileOptions?.negativeEmbeddings,
        model: modelFileName,
        removeBackground: true,
        // cfg_scale: generationData.cfgScale,
        // sampler: generationData.sampler,
        // seed: generationData.seed,
        // clip_skip: generationData.clipSkip,
      },
      generationData
    );

    // Update profile.imageUrl in database
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        imageUrl: imageResult.imageUrl,
      },
    });
    if (profile?.image) {
      await prisma.modelImage.update({
        where: { id: profile.image.id },
        data: {
          url: imageResult.imageUrl,
        },
      });
    }

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

// Modify the function signature to accept backgroundOptions
async function generateBackgroundImageForScene(
  scene: SceneWithRelations,
  combinedSceneText: string,
  bookTitle: string,
  forceRegenerate: boolean,
  backgroundSceneSize: { width: number; height: number },
  backgroundOptions: any,
  personNames: string[]
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

      const prompt = removeNamesFromString(personNames, prompts.positivePrompt);
      const negativePrompt = removeNamesFromString(
        personNames,
        prompts.negativePrompt
      );
      // Update GenerationData
      await prisma.generationData.update({
        where: { id: generationData.id },
        data: {
          prompt,
          negativePrompt,
        },
      });
      generationData.prompt = prompt;
      generationData.negativePrompt = negativePrompt;
    }

    let finalPrompt = generationData.prompt;
    let finalNegativePrompt = generationData.negativePrompt;

    // Handle LoRAs
    const positiveLoras = backgroundOptions?.positiveLoras || [];
    const negativeLoras = backgroundOptions?.negativeLoras || [];

    // Determine model file name
    let modelFileName = 'dreamshaper_8.safetensors'; // Replace with your default model

    // Use the checkpoint from backgroundOptions if provided
    if (backgroundOptions?.checkpoint) {
      modelFileName = backgroundOptions.checkpoint;
    }

    // Generate image
    const imageResult = await generateImage(
      {
        prompt: finalPrompt,
        negative_prompt: finalNegativePrompt,
        steps: generationData.steps,
        ...backgroundSceneSize,
        // Pass the options to generateImage
        positive_loras: positiveLoras,
        negative_loras: negativeLoras,
        embeddings: backgroundOptions?.embeddings,
        negative_embeddings: backgroundOptions?.negativeEmbeddings,
        model: modelFileName,
        // Additional params if needed
      },
      generationData
    );

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
      (profile) => profile.type?.toLowerCase() === 'person'
    );

    // Generate images for character profiles
    const characterImagePromises = characterProfiles.map((profile) =>
      generateImageForProfileHelper(
        profile,
        passage.textContent,
        passage.book.title,
        forceRegenerate,
        characterImageSize,
        null
      )
    );

    const canonicalNames = await getCanonicalNames(passage.bookId);
    // Generate background image
    const backgroundImagePromise = generateBackgroundImageForScene(
      passage.scene!,
      combinedSceneText,
      passage.book.title,
      forceRegenerate,
      backgroundSceneSize,
      null,
      canonicalNames
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
        characterImageSize,
        null
      )
    );

    const canonicalNames = await getCanonicalNames(scene.bookId);
    // Generate background image
    const backgroundImageResult = await generateBackgroundImageForScene(
      scene,
      combinedSceneText,
      scene.book.title,
      forceRegenerate,
      backgroundSceneSize,
      null,
      canonicalNames
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

// Helper function to generate images for a single scene without HTTP response
async function generateImagesForSceneLogic(
  sceneId: number,
  forceRegenerate: boolean,
  profileOptions: any,
  backgroundOptions: any,
  canonicalNames: string[]
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
    console.log('No profiles linked to this scene.');
  }

  // Generate images for each unique profile
  const profileImagePromises = uniqueProfiles.map((profile) =>
    generateImageForProfileHelper(
      profile,
      combinedSceneText,
      scene.book.title,
      forceRegenerate,
      characterImageSize,
      profileOptions
    )
  );

  // Generate background image
  const backgroundImageResult = await generateBackgroundImageForScene(
    scene,
    combinedSceneText,
    scene.book.title,
    forceRegenerate,
    backgroundSceneSize,
    backgroundOptions,
    canonicalNames
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
