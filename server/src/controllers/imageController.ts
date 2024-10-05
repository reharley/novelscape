import { Config } from '@imgly/background-removal-node';
import { Request, Response } from 'express';
import openai from '../config/openai';
import prisma from '../config/prisma';
import { generateImage } from '../services/imageService';
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

/**
 * @desc Generates positive and negative prompts using OpenAI's ChatGPT based on the provided text content, profiles, and book name.
 * @param textContent - The main content of the passage.
 * @param profiles - An array of non-character profiles linked to the passage.
 * @param bookName - The name of the book to provide additional context.
 * @returns An object containing both positivePrompt and negativePrompt for background scene generation.
 */
export async function generateBackgroundPrompt(
  textContent: string,
  profiles: {
    name: string;
    descriptions: string[];
  }[],
  bookName: string
): Promise<{ positivePrompt: string; negativePrompt: string }> {
  const examples = [
    {
      positivePrompt:
        'score_9, score_8_up, score_7_up, Diagon Alley promenade, the horror of stars, twilight sunshine, cityscape masterpiece, realistic, best quality, cosmic horror, Style-Volumetric, MJgothic, bright horror, s0lar, castle, blue and purple sky, city streets, spires, stone buildings, (/Harry Potter/)',
      negativePrompt:
        'score_4, score_5_up, score_6_up, ng_deepnegative_v1_75t, smeared, blurry, lowres, low quality, med quality, cars, people',
    },
    {
      positivePrompt:
        'A serene landscape depicting a tranquil forest clearing with sunlight filtering through the dense canopy, a gentle stream flowing nearby, and vibrant flora surrounding the area.',
      negativePrompt:
        'unsharp, blurry, low resolution, dark shadows, unrealistic colors, distorted shapes, overexposed areas, missing elements, cluttered background',
    },
  ];

  const examplesString = JSON.stringify(examples, null, 2);

  const systemPrompt = `
  You are an expert prompt engineer specializing in generating prompts for standard diffusion image generation. Your task is to create both positive and negative prompts based on the provided passage content, associated profiles (if any), and the book name.

  **Guidelines:**

  1. **Positive Prompt**: Should vividly describe the background scene incorporating elements from all profiles (if any). If there are no profiles, focus solely on the passage content to describe the scene. The prompt should be creative, detailed, and tailored to the context of the passage, profiles, and the book. Never focus on the characters directly.
  2. **Negative Prompt**: Should include elements to avoid in the image generation to ensure higher quality and relevance. Should avoid drawing characters/people unless they are in the background. Focus on common issues like poor anatomy, incorrect proportions, unwanted artifacts, etc.
  3. **Incorporate Profiles**: Use the profiles' names and descriptions to enrich the prompts, ensuring that the profiles' unique traits are reflected accurately within the scene when profiles are present.
  4. **Book Context**: Utilize the book name to maintain consistency with the book's theme and setting.
  5. **Format**: Provide the output as a JSON object with two fields: "positivePrompt" and "negativePrompt". Do **not** include any Markdown formatting or code block delimiters.
  6. **Format Clues**: Focus on comma-separated list of features describing a scene and avoid full sentences.
  7. **Characters**: Do **not** include character descriptions; focus solely on the background and non-character elements.
  8. **Examples**: Below are examples of desired output formats to guide your response.

  **Example Outputs:**
  ${examplesString}

  **Data Provided:**

  - **Book Name**: "${bookName}"

  - **Passage Content**:
  \`\`\`
  ${textContent}
  \`\`\`

  - **Profiles**:
  ${
    profiles.length > 0
      ? profiles
          .map(
            (profile) => `
  **Profile: ${profile.name}**
  Descriptions:
  ${profile.descriptions.map((desc) => `- ${desc}`).join('\n')}
  `
          )
          .join('\n')
      : 'No non-character profiles provided.'
  }

  **Please generate the positive and negative prompts for the background scene accordingly.**
  `;

  let assistantMessage;
  try {
    // Make a request to OpenAI's ChatGPT
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
      ],
      max_tokens: 700, // Adjust as needed
      temperature: 0.7, // Creativity level
    });

    // Extract and parse the response
    assistantMessage = response.choices[0]?.message?.content;

    if (!assistantMessage) {
      throw new Error('No response received from OpenAI.');
    }

    // Remove Markdown code block delimiters if present
    const jsonString = assistantMessage
      .replace(/```json\s*|\s*```/g, '')
      .trim();

    // Attempt to parse the JSON response
    const prompts = JSON.parse(jsonString);

    // Validate the presence of both prompts
    if (!prompts.positivePrompt || !prompts.negativePrompt) {
      throw new Error('Incomplete prompt data received from OpenAI.');
    }

    return {
      positivePrompt: prompts.positivePrompt,
      negativePrompt: prompts.negativePrompt,
    };
  } catch (error: any) {
    console.error('Error generating background prompts:', error.message);
    if (error instanceof SyntaxError) {
      console.error(
        'Failed to parse JSON. Original response:',
        assistantMessage
      );
    }
    throw new Error('Failed to generate background prompts.');
  }
}

/**
 * @desc Generates positive and negative prompts using OpenAI's ChatGPT based on the provided text content, profiles, and book name.
 * @param textContent - The main content of the passage.
 * @param profiles - An array of profiles linked to the passage, each containing name and descriptions.
 * @param bookName - The name of the book to provide additional context.
 * @returns An object containing both positivePrompt and negativePrompt.
 */
export async function generateProfilePrompt(
  textContent: string,
  profile: {
    name: string;
    descriptions: string[];
  },
  bookName: string
): Promise<{ positivePrompt: string; negativePrompt: string }> {
  const examples = [
    {
      positivePrompt:
        'score_9, score_8_up, score_7_up, Diagon Alley promenade, the horror of stars, twilight sunshine, cityscape masterpiece, realistic, best quality, cosmic horror, Style-Volumetric, MJgothic, bright horror, s0lar, castle, blue and purple sky, city streets, spires, stone buildings, (/Harry Potter/)',
      negativePrompt:
        'score_4, score_5_up, score_6_up, ng_deepnegative_v1_75t, smeared, blurry, lowres, low quality, med quality, cars, people',
    },
    {
      positivePrompt:
        "massive nimbus 2002 (harry potter, fictional), panoramic sunroof, halogen headlights, engine dress-up kit, cloth, ornate, worn patina, BREAK teamwork, sanctified, nature's cathedral, verdant, family-friendly, snow",
      negativePrompt:
        'split screen, disfigured, wrong anatomy, undefined eyes, mutated hands, mutated fingers, worst quality, low quality, normal quality',
    },
    {
      positivePrompt:
        'A mystical realm of art, with a palace of Harry Potter at its center, illuminated by a stormy night sky and surrounded by a swirling cloud of ghostly smoke.',
      negativePrompt:
        'unsharp, ugly, blurry, unattractive, duplicate, mistake, low quality, low resolution, undetailed, unrealistic, unsaturated, smoky, overexposed, missed, deformed',
    },
    {
      positivePrompt:
        'score_9, score_8_up, score_7_up, score_6_up, score_5_up, score_4_up, 1girl, slim, fit, realistic, beautiful eyes, Hermione Granger(/Harry potter)/, (ultra HD quality details), bushy brown hair and brown eyes, long hair, mouth opened, hiding, focusing on colorful beetle',
      negativePrompt:
        'score_6, score_5, score_4, pony, gaping, muscular, censored, furry, child, kid, chibi, 3d, monochrome, long neck',
    },
    {
      positivePrompt:
        "(masterpiece, mysterious, atmospheric:1.3), a captivating and enigmatic scene of a suburban home's empty basement, shrouded in shadows",
      negativePrompt:
        'poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, watermark, signature, cut off, low contrast, underexposed, overexposed, bad art, beginner, amateur, distorted face, bad quality, land, planet',
    },
    {
      positivePrompt:
        'Foggy 1950s Suburb: Capture a quiet 1950s suburban street enveloped in fog, with vintage houses lined up neatly and a milkman delivering bottles to doorsteps. The soft glow of street lamps creates a nostalgic atmosphere. Use a 60mm lens for a balanced perspective, set the aperture to f/8 for a deep depth of field, use a slow shutter speed of 1/30s with a tripod to capture the scene, set ISO to 200 for balanced exposure, and adjust the white balance to enhance the warm, nostalgic tones.',
      negativePrompt:
        'deformed iris, deformed pupils, semi-realistic, cgi, 3d, render, sketch, cartoon, drawing, anime:1.4), text, close up, cropped, out of frame, worst quality, low quality, jpeg artifacts, ugly, duplicate, morbid, mutilated, extra fingers, mutated hands, poorly drawn hands, poorly drawn face, mutation, deformed, blurry, dehydrated, bad anatomy, bad proportions, extra limbs, cloned face, disfigured, gross proportions, malformed limbs, missing arms, missing legs, extra arms, extra legs, fused fingers, too many fingers, long neck',
    },
  ];
  const examplesString = examples
    .map((e) => JSON.stringify(e, null, 2))
    .join('\n\n');

  const systemPrompt = `
  You are an expert prompt engineer specializing in generating prompts for standard diffusion image generation. Your task is to create both positive and negative prompts based on the provided passage content, associated profile, and the book name.
  
  **Guidelines:**
  
  1. **Positive Prompt**: Should vividly describe the portrait of the specific character from the profile and feature only that character (1boy, 1girl, solo). It should be creative, detailed, and tailored to the context of the passage, profile, and the book. Avoid mentioning other characters or elements not related to the profile.
  2. **Negative Prompt**: Should include elements to avoid in the image generation to ensure higher quality and relevance. Put negatives on scenery and background attributes. Focus on common issues like poor anatomy, incorrect proportions, unwanted artifacts, etc.
  3. **Incorporate Profile**: Use the profile's name and descriptions to enrich the prompts, ensuring that the profile's unique traits are reflected accurately.
  4. **Book Context**: Utilize the book name to maintain consistency with the book's theme and setting.
  5. **Format**: Provide the output as a JSON object with two fields: "positivePrompt" and "negativePrompt". Do **not** include any Markdown formatting or code block delimiters.
  6. **Format Clues**: Focus on comma separated list of features describing a scene and avoid full sentences
  7. **Examples**: Below are examples of desired output formats to guide your response.
  
  **Example Outputs:**
  ${examplesString}
  
  **Data Provided:**
  
  - **Book Name**: "${bookName}"
  
  - **Passage Content**:
  \`\`\`
  ${textContent}
  \`\`\`
  
  - **Profile**:
  **Profile: ${profile.name}**
  Descriptions:
  ${profile.descriptions.map((desc) => `- ${desc}`).join('\n')}
  
  **Please generate the positive and negative prompts accordingly.**
  `;
  let assistantMessage;
  try {
    // Make a request to OpenAI's ChatGPT
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Use the latest GPT model
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
      ],
      max_tokens: 700, // Adjust as needed
      temperature: 0.7, // Creativity level
    });

    // Extract and parse the response
    assistantMessage = response.choices[0]?.message?.content;

    if (!assistantMessage) {
      throw new Error('No response received from OpenAI.');
    }

    // Remove Markdown code block delimiters if present
    const jsonString = assistantMessage
      .replace(/```json\s*|\s*```/g, '')
      .trim();

    // Attempt to parse the JSON response
    const prompts = JSON.parse(jsonString);

    // Validate the presence of both prompts
    if (!prompts.positivePrompt || !prompts.negativePrompt) {
      throw new Error('Incomplete prompt data received from OpenAI.');
    }

    const promptObj = {
      positivePrompt: prompts.positivePrompt,
      negativePrompt: prompts.negativePrompt,
    };

    console.log(`Generated prompts for ${profile.name}:`, promptObj);
    return promptObj;
  } catch (error: any) {
    console.error('Error generating prompts:', error.message);
    if (error instanceof SyntaxError) {
      console.error(
        'Failed to parse JSON. Original response:',
        assistantMessage
      );
    }
    throw new Error('Failed to generate prompts.');
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
