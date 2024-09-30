import { PrismaClient } from '@prisma/client';
import { Router } from 'express';

const router = Router();
const prisma = new PrismaClient();

router.get('/loras', async (req, res) => {
  try {
    const loras = await prisma.aiModel.findMany({
      where: { type: 'LORA' },
    });
    res.json(loras);
  } catch (error) {
    console.error('Error listing LoRAs:', error);
    res.status(500).json({ error: 'An error occurred while listing LoRAs.' });
  }
});

export default router;
