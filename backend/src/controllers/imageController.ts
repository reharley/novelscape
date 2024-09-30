import { Request, Response } from 'express';
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
