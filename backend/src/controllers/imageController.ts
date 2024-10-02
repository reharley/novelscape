import { Request, Response } from 'express';
import openai from '../config/openai';
import prisma from '../config/prisma';
import { generateImage } from '../services/imageService';

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
      width: 512, // Default width
      height: 512, // Default height
      loras: [], // Default or extract loras if associated with profile
      model: null, // Default or extract model if associated with profile
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
 * @desc Generate images for all profiles linked to a specific passage
 * @route POST /api/passages/:passageId/generate-images
 * @access Public
 */
export async function generateImagesForPassage(req: Request, res: Response) {
  const { passageId } = req.params;

  try {
    const passage = await prisma.passage.findUnique({
      where: { id: Number(passageId) },
      include: {
        book: true,
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

    const profiles = passage.profiles;

    if (profiles.length === 0) {
      res.status(400).json({ error: 'No profiles linked to this passage.' });
      return;
    }

    // Prepare an array to hold image generation promises
    const imagePromises = profiles.map(async (profile) => {
      // Retrieve GenerationData via profile.image.generationData
      const generationData = profile.image?.generationData;

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

      if (!negativePrompt) {
        // Gather all profile descriptions
        const profileDescriptions = profiles.map((p) =>
          p.descriptions.join(' ')
        );

        // Generate prompts using ChatGPT
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
        } catch (error: any) {
          console.error(
            `Error generating prompts for profile ID ${profile.id}:`,
            error.message
          );
          finalNegativePrompt =
            'poorly drawn hands, poorly drawn feet, poorly drawn face, out of frame, extra limbs, disfigured, deformed, body out of frame, bad anatomy, watermark, signature, cut off, low contrast, underexposed, overexposed, bad art, beginner, amateur, distorted face, bad quality, land, planet';
          finalPrompt = finalPrompt || '';
        }
      }

      try {
        // Generate the image using GenerationData settings and determined modelFileName
        const imageResult = await generateImage({
          prompt: finalPrompt,
          negative_prompt: finalNegativePrompt,
          steps,
          width: size ? parseInt(size.split('x')[0], 10) : undefined,
          height: size ? parseInt(size.split('x')[1], 10) : undefined,
          loras: loraResources.map((lora) => lora.model.fileName),
          model: modelFileName,
          cfg_scale: cfgScale,
          sampler,
          seed,
          clip_skip: clipSkip,
        });

        return {
          profileId: profile.id,
          profileName: profile.name,
          image: imageResult.image, // Base64 string
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

    // Execute all image generation promises concurrently
    const imageResults = await Promise.all(imagePromises);

    res.json({ passageId: passage.id, images: imageResults });
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

  const examplesString = JSON.stringify(examples, null, 2);

  const systemPrompt = `
  You are an expert prompt engineer specializing in generating prompts for standard diffusion image generation. Your task is to create both positive and negative prompts based on the provided passage content, associated profile, and the book name.
  
  **Guidelines:**
  
  1. **Positive Prompt**: Should vividly describe the scene, the specific character from the profile, and key elements to be depicted in the image. It should be creative, detailed, and tailored to the context of the passage, profile, and the book.
  2. **Negative Prompt**: Should include elements to avoid in the image generation to ensure higher quality and relevance. Focus on common issues like poor anatomy, incorrect proportions, unwanted artifacts, etc.
  3. **Incorporate Profile**: Use the profile's name and descriptions to enrich the prompts, ensuring that the profile's unique traits are reflected accurately.
  4. **Book Context**: Utilize the book name to maintain consistency with the book's theme and setting.
  5. **Format**: Provide the output as a JSON object with two fields: "positivePrompt" and "negativePrompt". Do **not** include any Markdown formatting or code block delimiters.
  6. **Format Clues**: Focus on comma separated list of features describing a scene and avoid full sentences
  7. **Characters**: Only draw 1 character in a scene using positive features 1boy or 1girl and solo for characters and negative for other object types
  8. **Examples**: Below are examples of desired output formats to guide your response.
  
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
      model: 'gpt-4', // Use the latest GPT model
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
