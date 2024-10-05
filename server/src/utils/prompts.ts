import openai from '../config/openai';

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
