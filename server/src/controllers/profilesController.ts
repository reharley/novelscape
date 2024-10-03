import { Request, Response } from 'express';
import prisma from '../config/prisma';

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

    // Image generation logic can be implemented here or delegated to a service
    // For now, returning an empty response as in the original code
    res.json({});
    // Uncomment and implement the image generation logic as needed
    // res.json({ imageUrl: imagePath });
  } catch (error) {
    console.error('Error generating image for profile:', error);
    res.status(500).json({ error: 'Failed to generate image.' });
  }
}

export async function getProfilesForBook(req: Request, res: Response) {
  const { bookId } = req.params;
  try {
    const profiles = await prisma.profile.findMany({
      where: { bookId },
      include: {
        descriptions: true, // Include descriptions
      },
    });
    res.json(profiles);
  } catch (error) {
    console.error('Error fetching profiles:', error);
    res.status(500).json({ error: 'Failed to fetch profiles.' });
  }
}
