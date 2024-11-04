import { PrismaClient } from '@prisma/client';
import express from 'express';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/', async (req, res) => {
  const { name, characterProfileId, backgroundProfileId } = req.body;
  try {
    const stylePackage = await prisma.stylePackage.create({
      data: {
        name,
        characterProfileId,
        backgroundProfileId,
      },
    });
    res.status(201).json(stylePackage);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const stylePackages = await prisma.stylePackage.findMany({
      include: {
        characterProfile: true,
        backgroundProfile: true,
      },
    });
    res.json(stylePackages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch style packages.' });
  }
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const stylePackage = await prisma.stylePackage.findUnique({
      where: { id: Number(id) },
      include: {
        characterProfile: true,
        backgroundProfile: true,
      },
    });
    if (stylePackage) {
      res.json(stylePackage);
    } else {
      res.status(404).json({ error: 'StylePackage not found.' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch style package.' });
  }
});

router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, characterProfileId, backgroundProfileId } = req.body;
  try {
    const stylePackage = await prisma.stylePackage.update({
      where: { id: Number(id) },
      data: {
        name,
        characterProfileId,
        backgroundProfileId,
      },
    });
    res.json(stylePackage);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.stylePackage.delete({
      where: { id: Number(id) },
    });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete style package.' });
  }
});

export default router;
