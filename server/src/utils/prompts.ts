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
    gender?: string | null;
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
    You are an expert prompt engineer specializing in generating full body portrait prompts for standard diffusion image generation. Your task is to create both positive and negative prompts based on the profile.
    
    **Guidelines:**
    
    1. **Positive Prompt**: Should vividly describe the full body portrait as a comma separated list of attributes of the specific character from the profile and feature only that character (1boy, 1girl, solo). It should be creative, detailed, and tailored to the context of the profile first, the passage. Do not mention other characters or elements that are not focused on the individual. Do not reference relationships or interactions with other characters.
    2. **Negative Prompt**: Focus on common issues like split frame, out of frame, cropped, multiple frame, split panel, multi panel, poor anatomy, incorrect proportions, unwanted artifacts,  etc. Should include elements to avoid in the image generation to ensure higher quality and relevance. Put negatives on scenery and background attributes. 
    3. **Incorporate Profile**: Use the profile's name and descriptions to enrich the prompts, ensuring that the profile's unique traits are reflected accurately in the portrait.
    4. **Book Context**: Utilize the book name or world to maintain consistency with the book's theme and setting when appropriate.
    5. **Format**: Provide the output as a JSON object with two fields: "positivePrompt" and "negativePrompt". Do **not** include any Markdown formatting or code block delimiters.
    6. **Format Clues**: Focus on comma separated list of features describing a scene and avoid full sentences
    7. **Examples**: Below are examples of desired output formats to guide your response.
    
    **Example Outputs:**
    ${examplesString}
    
    **Data Provided:**
    - **Profile**:
    **Profile: ${profile.name}**
    ${profile.gender ? 'Gender:' + profile.gender : undefined}
    Descriptions:
    ${profile.descriptions.map((desc) => `- ${desc}`).join('\n')}
    
    **Please generate the positive and negative prompts accordingly.**
    `;
  /*
- **Book Name**: "${bookName}"
    
    - **Passage Content**:
    \`\`\`
    ${textContent}
    \`\`\`
    */
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

    console.log(`Generated character prompts for ${profile.name}:`, promptObj);
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
        'Conceptart, Concept Art, SamWho, mksks style,  species,overlooking chasm',
      negativePrompt:
        'lowres, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts,signature, watermark, username, blurry, artist name, artifact, grains, humans, 1girl, female, solo',
    },
    {
      positivePrompt:
        'ConceptArt, no humans, scenery, water, sky, day, tree, cloud, waterfall, outdoors, building, nature, river, blue sky',
      negativePrompt:
        'lowres, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts,signature, watermark, username, blurry, artist name, humans, castle, 1girl, solo, female',
    },
    {
      positivePrompt:
        'Concept art, no humans, water puddles, country side, road, rain, cloudy,',
      negativePrompt:
        'lowres, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts,signature, watermark, username, blurry, artist name, humans, castle, 1girl, solo, female',
    },
    {
      positivePrompt:
        '1girl, looking at the viewer, water, pond, lake, shrine, koi',
      negativePrompt:
        'bad anatomy, bad res, bad quality, error,malformed, art by bad-artist, bad-image-v2-39000, bad-hands-5, art by negprompt5, lowres, bad hands, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts,signature, watermark, username, blurry, artist name, (worst quality, low quality, extra digits, loli, loli face:1.3)',
    },
    {
      positivePrompt:
        'no humans, scenery, water, sky, day, world tree, cloud, waterfall, outdoors,huge tree, nature, river, night sky,night,big trees,moon',
      negativePrompt:
        'badhandv4, easynegative, ng_deepnegative_v1_75t, By bad artist -neg',
    },
    {
      positivePrompt:
        'no humans, scenery, water, sky, day, world tree, cloud, waterfall, outdoors,huge tree, nature, river, night sky,night,big trees,moon',
      negativePrompt:
        'badhandv4, easynegative, ng_deepnegative_v1_75t, By bad artist -neg',
    },
    {
      positivePrompt:
        'ConceptArt, no humans, scenery, water, sky, day, world tree, cloud, waterfall, outdoors,huge tree, nature, river, night sky',
      negativePrompt:
        'badhandv4, easynegative, ng_deepnegative_v1_75t, By bad artist -neg',
    },
    {
      positivePrompt:
        'ConceptArt, no humans, scenery, water, sky, day, world tree, cloud, waterfall, outdoors,huge tree, nature, river, night sky,night,big trees,moon',
      negativePrompt:
        'badhandv4, easynegative, ng_deepnegative_v1_75t, By bad artist -neg',
    },
    {
      positivePrompt:
        'ConceptArt, no humans, scenery, sky, night, tree, dark night, outdoors, building, huge kingdom, a large castle, dark sky',
      negativePrompt:
        'lowres, text, error, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, normal quality, jpeg artifacts,signature, watermark, username, blurry, artist name, humans, castle, 1girl, solo, female',
    },
  ];

  const examplesString = examples
    .map((e) => JSON.stringify(e, null, 2))
    .join('\n\n');

  const systemPrompt = `
    You are an expert prompt engineer specializing in generating prompts for standard diffusion image generation. Your task is to create both positive and negative prompts based on the provided passage content, associated profiles (if any), and the book name.
  
    **Guidelines:**
  
    1. **Positive Prompt**: Should vividly describe the background scene as a comma separated list of attributes incorporating elements solely from the passage content to describe the scene. **Never** write character descriptions.
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

    console.log('Generated background prompts:', prompts);

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
// Define interfaces for clarity
interface Entity {
  fullName?: string;
  alias?: string;
  type?: string;
  description?: string;
  descriptionType?: string;
}
export async function performNERWithAliases(
  contextText: string,
  aliases: string[]
): Promise<Entity[]> {
  // Prepare the list of known aliases
  const aliasList = aliases.map((alias) => `"${alias}"`).join(', ');

  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an assistant that performs named entity recognition (NER) on a given text. Identify and extract all named entities, categorizing them as one of the following types: 'Character', 'Building', 'Scene', 'Animal', 'Object'. For entities that are aliases of known characters, provide both the full name and the alias. Only tag Family entities if they are clearly identified as such (Potters, The Potters, Dursleys, The Dursleys), not individuals (Mr. Potter, Mr. Dursley). Do your best to identify Characters that are referred to with their last name only (Potter, Mr. Potter) as their full name (one of Harry Potter or James Potter).

Include the following known possible aliases in your analysis: ${aliasList}.

For each entity, provide:
- fullName: The canonical name of the entity (if applicable).
- alias: The alias used in the text (if applicable).
- type: One of 'Character', 'Family', 'Building', 'Scene', 'Animal', or 'Object'.
- gender: Male, Female, or null when unknown
- description: A brief description of the finding in the text. Emphasize Appearance and Personality traits.
- descriptionType: The type of description provided (Physical Attributes, Personality, Other).

Output the result as a JSON array of entities.`,
      },
      {
        role: 'user',
        content: `Extract entities from the following text:\n\n${contextText}`,
      },
    ],
    max_tokens: 1500,
  });

  let assistantMessage = response.choices[0].message?.content || '';
  assistantMessage = sanitizeAssistantMessage(assistantMessage);

  let entities: Entity[] = [];
  try {
    entities = JSON.parse(assistantMessage);
  } catch (parseError) {
    console.error('JSON parse error (NER):', parseError);
    const jsonMatch = assistantMessage.match(/\[.*\]/s);
    if (jsonMatch) {
      const regex = /\,(?=\s*?[\}\]])/g;
      const cleanMatch = jsonMatch[0].replace(regex, '');
      entities = JSON.parse(cleanMatch);
    } else {
      console.error('Failed to parse NER as JSON.');
    }
  }

  return entities;
}
// **Scene Detection with Accumulated Passages**
export async function detectNewScene(
  contextText: string
): Promise<{ newScene: boolean }> {
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an assistant that detects scene transitions in text. Determine if the following passage indicates the start of a new scene based on the accumulated context. Respond with a JSON object containing a single key "newScene" with a boolean value.`,
      },
      {
        role: 'user',
        content: `Analyze the following text and determine if it starts a new scene:\n\n${contextText}`,
      },
    ],
    max_tokens: 100,
  });

  let assistantMessage = response.choices[0].message?.content || '';
  assistantMessage = sanitizeAssistantMessage(assistantMessage);

  let sceneResult: { newScene?: boolean } = {};
  try {
    sceneResult = JSON.parse(assistantMessage);
  } catch (parseError) {
    console.error('JSON parse error (Scene Detection):', parseError);
    const jsonMatch = assistantMessage.match(/\{.*\}/s);
    if (jsonMatch) {
      const regex = /\,(?=\s*?[\}\]])/g;
      const cleanMatch = jsonMatch[0].replace(regex, '');
      sceneResult = JSON.parse(cleanMatch);
    } else {
      console.error('Failed to parse scene detection as JSON.');
    }
  }

  return { newScene: sceneResult.newScene || false };
}

// **Sanitize Assistant Message**
function sanitizeAssistantMessage(message: string): string {
  return message
    .trim()
    .replace(/```(?:json|)/g, '')
    .replace(/```/g, '')
    .trim();
}

export async function extractFullNames(textContent: string) {
  const canonicalResponse = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `You are an assistant that performs named entity recognition (NER) to identify complete (full) character names. Extract only the entities of type 'Character' with their full names present from the following text and provide them as a JSON array of strings.`,
      },
      {
        role: 'user',
        content: `Extract full character names from the following text:\n\n${textContent}`,
      },
    ],
    max_tokens: 500,
  });

  let assistantMessage = canonicalResponse.choices[0].message?.content || '';
  assistantMessage = sanitizeAssistantMessage(assistantMessage);

  let canonicalEntities: string[] = [];
  try {
    canonicalEntities = JSON.parse(assistantMessage);
  } catch (parseError) {
    console.error('JSON parse error (canonical):', parseError);
    const jsonMatch = assistantMessage.match(/\[.*\]/s);
    if (jsonMatch) {
      const regex = /\,(?=\s*?[\}\]])/g;
      const cleanMatch = jsonMatch[0].replace(regex, '');
      canonicalEntities = JSON.parse(cleanMatch);
    } else {
      console.error('Failed to parse canonical entities as JSON.');
      return; // Skip if unable to parse
    }
  }

  return canonicalEntities;
}
