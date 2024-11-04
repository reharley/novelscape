import { Request, Response } from 'express';
import pLimit from 'p-limit';

import prisma from '../config/prisma.js';
import { getCanonicalNames } from '../services/bookService.js';
import { generateImage } from '../services/imageService.js';
import {
  generateBackgroundPrompt,
  generateProfilePrompt,
} from '../utils/prompts.js';
import {
  ChapterWithRelations,
  ProfileWithRelations,
  SceneWithRelations,
  StylePackageWithRelations,
} from '../utils/types.js';

const characterImageSize = {
  width: 512,
  height: 768,
};
const backgroundSceneSize = {
  width: 512,
  height: 768,
};

export async function generateImageController(req: Request, res: Response) {
  const { prompt, negativePrompt, steps, width, height, loras, model } =
    req.body;
  try {
    const imageResult = await generateImage({
      prompt,
      negativePrompt,
      steps,
      width,
      height,
      loras: loras,
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
      null,
      passageText,
      bookTitle,
      forceRegenerate,
      characterImageSize,
      null,
      profile.book.userId
    );

    res.json(result);
  } catch (error: any) {
    console.error('Error generating image for profile:', error);
    res.status(500).json({
      error: error.message || 'Failed to generate image for profile.',
    });
  }
}

export async function generateBackgroundImagesForChapter(
  chapter: ChapterWithRelations,
  stylePackage: StylePackageWithRelations | null,
  job: any,
  forceRegenerate: boolean,
  backgroundOptions: any
) {
  const canonicalNames = await getCanonicalNames(chapter.bookId);
  const limit = pLimit(6);

  const tasks = chapter.scenes.map((scene) =>
    limit(async () => {
      try {
        const passages = scene.passages || [];
        const combinedSceneText = passages
          .map((p: any) => p.textContent)
          .join('\n');

        await generateBackgroundImageForScene(
          scene,
          stylePackage,
          combinedSceneText,
          chapter.book.title,
          forceRegenerate,
          backgroundSceneSize,
          backgroundOptions,
          canonicalNames,
          chapter.book.userId
        );

        await prisma.processingJob.update({
          where: { id: job.id },
          data: {
            completedTasks: { increment: 1 },
            progress: {
              increment: (1 / job.totalTasks) * 100,
            },
          },
        });
      } catch (error: any) {
        console.error(
          `Error generating background image for scene ${scene.id}:`,
          error
        );
        // Update job with failed task
        await prisma.processingJob.update({
          where: { id: job.id },
          data: {
            failedTasks: { increment: 1 },
          },
        });
      }
    })
  );

  await Promise.all(tasks);
}

export async function generateProfileImagesForChapter(
  chapter: ChapterWithRelations,
  stylePackage: StylePackageWithRelations | null,
  profiles: ProfileWithRelations[],
  job: any,
  forceRegenerate: boolean,
  profileOptions: any
) {
  const combinedChapterText = chapter.scenes
    .flatMap((scene: any) => scene.passages)
    .map((p: any) => p!.textContent)
    .join(' ');

  const limit = pLimit(6);

  const tasks = profiles.map((profile) =>
    limit(async () => {
      try {
        await generateImageForProfileHelper(
          profile,
          stylePackage,
          combinedChapterText,
          chapter.book.title,
          forceRegenerate,
          characterImageSize,
          profileOptions,
          chapter.book.userId
        );

        // Update job progress
        await prisma.processingJob.update({
          where: { id: job.id },
          data: {
            completedTasks: { increment: 1 },
            progress: {
              increment: (1 / job.totalTasks) * 100,
            },
          },
        });
      } catch (error: any) {
        console.error(
          `Error generating image for profile ${profile.id}:`,
          error
        );
        // Update job with failed task
        await prisma.processingJob.update({
          where: { id: job.id },
          data: {
            failedTasks: { increment: 1 },
          },
        });
      }
    })
  );

  await Promise.all(tasks);
}

async function generateImageForProfileHelper(
  profile: ProfileWithRelations,
  stylePackage: StylePackageWithRelations | null,
  passageText: string,
  bookTitle: string,
  forceRegenerate: boolean,
  characterImageSize: { width: number; height: number },
  profileOptions: any,
  userId: string
): Promise<{
  profileId: number;
  profileName: string;
  image: string | null;
  error?: string;
}> {
  try {
    await ensureGenerationDataForProfile(profile, characterImageSize);
    const generationData = profile.image!.generationData!;

    // Determine prompts
    let finalPrompt = generationData.prompt;
    let finalNegativePrompt = generationData.negativePrompt;

    if (stylePackage) {
      finalPrompt = `${stylePackage.backgroundProfile.prompt}, ${finalPrompt}`;
      if (stylePackage.backgroundProfile.negativePrompt) {
        finalNegativePrompt = `${stylePackage.backgroundProfile.negativePrompt}, ${finalNegativePrompt}`;
      }
    }

    if (
      forceRegenerate ||
      !generationData.negativePrompt ||
      !generationData.prompt
    ) {
      try {
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
          stylePackage,
          userId
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

    if (stylePackage) {
      finalPrompt = `${stylePackage.characterProfile.prompt}, ${finalPrompt}`;
      if (stylePackage.characterProfile.negativePrompt) {
        finalNegativePrompt = `${stylePackage.characterProfile.negativePrompt}, ${finalNegativePrompt}`;
      }
    }

    let modelFileName = 'dreamshaper_8.safetensors';
    if (stylePackage?.characterProfile.checkpoint.fileName) {
      modelFileName = stylePackage.characterProfile.checkpoint.fileName;
    } else if (profileOptions?.checkpoint) {
      modelFileName = profileOptions.checkpoint;
    }

    const loras = profileOptions?.positiveLoras || [];
    if (stylePackage?.characterProfile.loras) {
      loras.push(
        ...stylePackage.characterProfile.loras.map((lora) => ({
          name: lora.aiModel.fileName,
          weight: lora.weight,
        }))
      );
    }
    const embeddings = profileOptions?.embeddings || [];
    if (stylePackage?.characterProfile.embeddings) {
      embeddings.push(
        ...stylePackage.characterProfile.embeddings.map(
          (embedding) => embedding.aiModel.fileName
        )
      );
    }
    const negativeEmbeddings = profileOptions?.negativeEmbeddings || [];
    if (stylePackage?.characterProfile.negativeEmbeddings) {
      negativeEmbeddings.push(
        ...stylePackage.characterProfile.negativeEmbeddings.map(
          (embedding) => embedding.aiModel.fileName
        )
      );
    }

    const steps = stylePackage?.characterProfile.steps || 30;
    // Generate image
    const imageResult = await generateImage(
      {
        prompt: finalPrompt,
        negativePrompt: finalNegativePrompt,
        steps,
        ...characterImageSize,
        loras,
        embeddings,
        negative_embeddings: negativeEmbeddings,
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

async function generateBackgroundImageForScene(
  scene: SceneWithRelations,
  stylePackage: StylePackageWithRelations | null,
  combinedSceneText: string,
  bookTitle: string,
  forceRegenerate: boolean,
  backgroundSceneSize: { width: number; height: number },
  backgroundOptions: any,
  personNames: string[],
  userId: string
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
        stylePackage,
        [], // No profiles in this context
        bookTitle,
        userId
      );

      const prompt = prompts.positivePrompt;
      const negativePrompt = prompts.negativePrompt;
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

    if (stylePackage) {
      finalPrompt = `${stylePackage.backgroundProfile.prompt}, ${finalPrompt}`;
      if (stylePackage.backgroundProfile.negativePrompt) {
        finalNegativePrompt = `${stylePackage.backgroundProfile.negativePrompt}, ${finalNegativePrompt}`;
      }
    }

    // Handle LoRAs
    const loras = backgroundOptions?.positiveLoras || [];

    let modelFileName = 'dreamshaper_8.safetensors';
    if (stylePackage?.backgroundProfile.checkpoint.fileName) {
      modelFileName = stylePackage.backgroundProfile.checkpoint.fileName;
    } else if (backgroundOptions?.checkpoint) {
      modelFileName = backgroundOptions.checkpoint;
    }

    if (stylePackage?.backgroundProfile.loras) {
      loras.push(
        ...stylePackage.backgroundProfile.loras.map((lora) => ({
          name: lora.aiModel.fileName,
          weight: lora.weight,
        }))
      );
    }

    const embeddings = backgroundOptions?.embeddings || [];
    if (stylePackage?.backgroundProfile.embeddings) {
      embeddings.push(
        ...stylePackage.backgroundProfile.embeddings.map(
          (embedding) => embedding.aiModel.fileName
        )
      );
    }
    const negativeEmbeddings = backgroundOptions?.negativeEmbeddings || [];
    if (stylePackage?.backgroundProfile.negativeEmbeddings) {
      negativeEmbeddings.push(
        ...stylePackage.backgroundProfile.negativeEmbeddings.map((embedding) =>
          embedding.aiModel.fileName.replace('.safetensors', '')
        )
      );
    }

    const steps = stylePackage?.backgroundProfile.steps || 30;
    // Generate image
    const imageResult = await generateImage(
      {
        prompt: finalPrompt,
        negativePrompt: finalNegativePrompt,
        steps,
        ...backgroundSceneSize,
        loras,
        embeddings,
        negative_embeddings: negativeEmbeddings,
        model: modelFileName,
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
