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
You are an expert prompt engineer specializing in generating full body portrait prompts for standard diffusion image generation. Your task is to create both positive and negative prompts based on the profile. Output by calling generate_prompts function.

**Guidelines:**
1. **Positive Prompt**: Should vividly describe the full body portrait as a comma separated list of attributes of the specific character from the profile and feature only that character (1boy, 1girl, solo). It should be creative, detailed, and tailored to the context of the profile first, the passage. Do not mention other characters or elements that are not focused on the individual. Do not reference relationships or interactions with other characters.
2. **Negative Prompt**: Focus on common issues like split frame, out of frame, cropped, multiple frame, split panel, multi panel, poor anatomy, incorrect proportions, unwanted artifacts,  etc. Should include elements to avoid in the image generation to ensure higher quality and relevance. Put negatives on scenery and background attributes. 
3. **Incorporate Profile**: Use the profile's name and descriptions to enrich the prompts, ensuring that the profile's unique traits are reflected accurately in the portrait.
4. **Book Context**: Utilize the book name or world to maintain consistency with the book's theme and setting when appropriate.
5. **Format**: Provide the output as a JSON object with two fields: "positivePrompt" and "negativePrompt". Do **not** include any Markdown formatting or code block delimiters.
6. **Format Clues**: Focus on comma separated list of features describing a scene and avoid full sentences
7. **Examples**: Below are examples of desired outputs to guide your response.
**Example Outputs:**
${examplesString}
**Data Provided:**
- **Profile**:
**Character Name: ${profile.name}**
${profile.gender ? 'Gender:' + profile.gender : undefined}
Descriptions:
${profile.descriptions.map((desc) => `- ${desc}`).join('\n')}
`;
  /*
- **Book Name**: "${bookName}"
    
    - **Passage Content**:
    \`\`\`
    ${textContent}
    \`\`\`
    */
  let message;
  try {
    const functions = [
      {
        name: 'generate_prompts',
        description:
          'Generates positive and negative prompts for image generation based on the provided profile.',
        parameters: {
          type: 'object',
          properties: {
            positivePrompt: {
              type: 'string',
              description: 'The positive prompt for image generation.',
            },
            negativePrompt: {
              type: 'string',
              description: 'The negative prompt for image generation.',
            },
          },
          required: ['positivePrompt', 'negativePrompt'],
        },
      },
    ];
    // Make a request to OpenAI's ChatGPT
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // Use the latest GPT model
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Generate prompts for the character ${profile.name}.`,
        },
      ],
      functions: functions,
      function_call: { name: 'generate_prompts' },
      max_tokens: 700, // Adjust as needed
      temperature: 0.3, // Creativity level
    });

    // Extract and parse the response
    message = response.choices[0]?.message;

    if (message?.function_call?.name === 'generate_prompts') {
      const args = JSON.parse(message.function_call.arguments);
      if (!args.positivePrompt || !args.negativePrompt) {
        throw new Error('Incomplete prompt data received from OpenAI.');
      }

      const promptObj = {
        positivePrompt: args.positivePrompt,
        negativePrompt: args.negativePrompt,
      };

      console.log(
        `Generated character prompts for ${profile.name}:`,
        promptObj
      );
      return promptObj;
    } else {
      throw new Error('No function call was made by the assistant.');
    }
  } catch (error: any) {
    console.error('Error generating prompts:', error.message);
    if (error instanceof SyntaxError) {
      console.error('Failed to parse JSON. Original response:', message);
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
    You are an expert prompt engineer specializing in generating prompts for standard diffusion image generation. Your task is to create both positive and negative prompts based on the provided passage content, for background scene images.
  
    **Guidelines:**
  
    1. **Positive Prompt**: Should vividly describe the background scene as a list of attributes incorporating elements solely from the passage content to describe the scene. **NEVER** write character descriptions. **DO NOT INCLUDE CHARACTERS**. No characters should be mentioned in the positive prompt. Focus on the setting, environment, and objects in the scene.
    2. **Negative Prompt**: Should include elements to avoid in the image generation to ensure higher quality and relevance. Should avoid drawing characters/people unless they are in the background. Focus on common issues like poor anatomy, incorrect proportions, unwanted artifacts, etc.
    3. **DO NOT INCLUDE CHARACTERS**: Do not include characters, or character descriptions; focus solely on the background and non-character elements.
    4. **Examples**: Below are examples of desired outputs to guide your response.
  
    **Example Outputs:**
    ${examplesString}
  
    - **Passage Content**:
    \`\`\`
    ${textContent}
    \`\`\`
  
    **Please generate the positive and negative prompts for the background scene accordingly.**
    `;
  const functions = [
    {
      name: 'generate_prompts',
      description:
        'Generates positive and negative prompts for image generation based on the provided passage.',
      parameters: {
        type: 'object',
        properties: {
          positivePrompt: {
            type: 'string',
            description:
              'The positive list of attributes describing the background. **DO NOT INCLUDE CHARACTERS**',
          },
          negativePrompt: {
            type: 'string',
            description: 'The negative prompt for image generation.',
          },
        },
        required: ['positivePrompt', 'negativePrompt'],
      },
    },
  ];
  let message;
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
      functions: functions,
      function_call: { name: 'generate_prompts' },
      max_tokens: 700, // Adjust as needed
      temperature: 0.3, // Creativity level
    });

    // Extract and parse the response
    message = response.choices[0]?.message;

    if (message?.function_call?.name === 'generate_prompts') {
      const args = JSON.parse(message.function_call.arguments);
      if (!args.positivePrompt || !args.negativePrompt) {
        throw new Error('Incomplete prompt data received from OpenAI.');
      }

      console.log('Generated background prompts:', args);

      return {
        positivePrompt: args.positivePrompt,
        negativePrompt: args.negativePrompt,
      };
    } else {
      throw new Error('No function call was made by the assistant.');
    }
  } catch (error: any) {
    console.error('Error generating background prompts:', error.message);
    if (error instanceof SyntaxError) {
      console.error('Failed to parse JSON. Original response:', message);
    }
    throw new Error('Failed to generate background prompts.');
  }
}
// Define interfaces for clarity
interface Entity {
  fullName?: string;
  alias?: string;
  type?: 'PERSON' | 'NON_PERSON';
  gender?: string | null;
  appearance?: string[] | null;
  description?: string;
}
export async function performNERWithAliases(
  contextText: string,
  aliases: string[]
): Promise<Entity[]> {
  // Prepare the list of known aliases
  const aliasList = aliases.map((alias) => `"${alias}"`).join(', ');
  const functions = [
    {
      name: 'extract_entities',
      description: 'Extracts characters from text.',
      parameters: {
        type: 'object',
        properties: {
          entities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                fullName: {
                  type: 'string',
                  description:
                    'The full (first and last) name of the character.',
                },
                type: {
                  type: 'string',
                  description: 'The type of entity extracted',
                  enum: ['PERSON', 'NON_PERSON'],
                },
                alias: {
                  type: 'string',
                  description: 'The alias used in the text (if applicable).',
                },
                gender: {
                  type: ['string', 'null'],
                  description: 'Male, Female, or null when unknown.',
                },
                description: {
                  type: 'string',
                  description: 'A brief summary of the finding in the text.',
                },
                appearance: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Physical appearance of the character in focus being extracted as attributes. Should be on clothing, hair, eyes, weight, build, age, accessories etc. **DO NOT INCLUDE** anything about other characters.',
                },
                actions: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Actions performed by the character as string array of verbs.',
                },
              },
              required: ['description', 'alias', 'type'],
            },
            description: 'The list of extracted entities.',
          },
        },
        required: ['entities'],
      },
    },
  ];
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `
You are an assistant that performs named entity recognition (NER) on a given text. Identify and extract all characters in the passage below. For entities that are aliases of known characters, provide both the full name and the alias. **IGNORE** Family entities if they are clearly identified as such (Potters, The Potters, Dursleys, The Dursleys), not individuals (Mr. Potter, Mr. Dursley). Do your best to identify Characters that are referred to with their last name only (Potter, Mr. Potter) as their full name (one of Harry Potter or James Potter).

Include the following known possible aliases in your analysis:
${aliasList}.

Output the result as a JSON array of entities through extract_entities.`,
      },
      {
        role: 'user',
        content: `Extract entities from the following text:\n\n${contextText}`,
      },
    ],
    functions: functions,
    function_call: { name: 'extract_entities' },
    max_tokens: 1500,
    temperature: 0.3, // Creativity level
  });

  const message = response.choices[0]?.message;
  if (message?.function_call?.name === 'extract_entities') {
    const args = JSON.parse(message.function_call.arguments);
    const entities: Entity[] = args.entities;
    console.log('Extracted entities:', entities);
    return entities;
  } else {
    throw new Error('No function call was made by the assistant.');
  }
}
// **Scene Detection with Accumulated Passages**
export async function detectNewScene(
  contextText: string,
  nextPassageText: string
): Promise<{ newScene: boolean }> {
  const functions = [
    {
      name: 'report_scene',
      description: 'Reports whether a new scene has started.',
      parameters: {
        type: 'object',
        properties: {
          newScene: {
            type: 'boolean',
            description: 'True if a new scene has started, false otherwise.',
          },
        },
        required: ['newScene'],
      },
    },
  ];
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `
You are an assistant that detects scene transitions in text.
When reading a novel, several cues can indicate a scene change. Here are some common ways authors signal that a new scene is beginning:

Chapter Breaks: A common and clear signal. A new chapter typically indicates a significant shift in location, time, or focus.

Line Breaks/White Space: Authors often use line breaks or white space (blank lines) to separate scenes within the same chapter. These breaks indicate a change in time, location, or perspective without needing to start a new chapter.

Change in Setting: A description of a new location, time of day, or environment can signal a scene change. For example, if characters move from indoors to outdoors, or from one place to another, it suggests a scene shift.

Shift in Character Focus: A scene change can occur when the narrative shifts from one character's actions or perspective to another character's. For example, the story might shift from one character in the present to another character in the past or future.

Time Jump: A transition in time, such as moving forward or backward, can signal a new scene. Authors might indicate this with phrases like "Later that evening..." or "The next day...," or even with subtle hints like a character mentioning the passage of time.

Change in Tone or Mood: Sometimes, a shift in the emotional tone or mood of the narrative signals a scene change. For instance, moving from a tense confrontation to a peaceful reflection may mark a new scene.

Dialogue and Action Transitions: A sudden shift in dialogue, where new topics are introduced or different characters speak, can serve as a scene transition. Similarly, when characters begin a new activity or enter a new phase of action, this can indicate a scene shift.

Try and identify if the following passage marks the beginning of a new scene. Consider the accumulated context and the new passage. Look for any of the cues mentioned above that might indicate a scene change.

Prefer medium sized scenes over shorter ones or long ones. If the new passage is a continuation of the previous scene, mark it as not a new scene.`,
      },
      {
        role: 'user',
        content: `
Analyze the following text and determine if it starts a new scene.
Accumulated context:
${contextText}

New passage:
${nextPassageText}`,
      },
    ],
    functions: functions,
    function_call: { name: 'report_scene' },
    temperature: 0.3, // Creativity level
    max_tokens: 5000,
  });

  const message = response.choices[0]?.message;
  if (message?.function_call?.name === 'report_scene') {
    const args = JSON.parse(message.function_call.arguments);
    const newScene = args.newScene;
    console.log('Scene detection result:', newScene);
    return { newScene };
  } else {
    throw new Error('No function call was made by the assistant.');
  }
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
  // Define the function schema for function calling
  const functions = [
    {
      name: 'provide_full_names',
      description: 'Provides full character names extracted from text.',
      parameters: {
        type: 'object',
        properties: {
          fullNames: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'An array of full character names.',
          },
        },
        required: ['fullNames'],
      },
    },
  ];
  const response = await openai.chat.completions.create({
    model: 'gpt-3.5-turbo',
    messages: [
      {
        role: 'system',
        content: `
You are an assistant that performs named entity recognition (NER) to identify complete (full) character names. Extract only the entities of type that are people with their full names present from the following text and provide them as a JSON array of strings.
Ignore any other types of entities.
Focus on extracting full names (e.g. Harry Potter, not just Harry) and avoid partial names or titles.
`,
      },
      {
        role: 'user',
        content: `Extract full character names from the following text:\n\n${textContent}`,
      },
    ],
    max_tokens: 500,
    functions: functions,
    temperature: 0.3, // Creativity level
    function_call: { name: 'provide_full_names' },
  });

  const message = response.choices[0]?.message;

  if (message?.function_call?.name === 'provide_full_names') {
    const args = JSON.parse(message.function_call.arguments);
    const fullNames: string[] = args.fullNames;
    console.log('Extracted full names:', fullNames);
    return fullNames;
  } else {
    throw new Error('No function call was made by the assistant.');
  }
}
