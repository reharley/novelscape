import { Request, Response } from 'express';
import prisma from '../config/prisma.js';

export const getUserSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user.oid;

    let settings = await prisma.userSettings.findUnique({
      where: { userId },
    });

    // If settings do not exist, create default settings
    if (!settings) {
      settings = await prisma.userSettings.create({
        data: {
          userId,
          autoPlay: false,
          wpm: 200,
        },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching user settings:', error);
    res.status(500).json({ message: 'Failed to get user settings.' });
  }
};

export const saveUserSettings = async (req: Request, res: Response) => {
  try {
    const userId = req.user.oid;
    const { autoPlay, wpm } = req.body;

    const settings = await prisma.userSettings.upsert({
      where: { userId },
      update: { autoPlay, wpm },
      create: { userId, autoPlay, wpm },
    });

    res.json({ message: 'Settings saved successfully.', settings });
  } catch (error) {
    console.error('Error saving user settings:', error);
    res.status(500).json({ message: 'Failed to save user settings.' });
  }
};
