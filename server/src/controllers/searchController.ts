import axios from 'axios';
import DOMPurify from 'dompurify';
import { Request, Response } from 'express';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('<!DOCTYPE html>');
const domPurify = DOMPurify(window);

export async function searchModels(req: Request, res: Response) {
  const { query } = req.query;

  if (!query || typeof query !== 'string') {
    res
      .status(400)
      .json({ error: 'Query parameter is required and must be a string.' });
    return;
  }

  try {
    const response = await axios.get('https://civitai.com/api/v1/models', {
      params: { query },
    });

    // Sanitize descriptions
    if (response.data && response.data.items) {
      response.data.items.forEach((item: any) => {
        if (item.description) {
          item.description = domPurify.sanitize(item.description);
        }
      });
    }

    res.json(response.data);
  } catch (error: any) {
    console.error('Error fetching data from CivitAI:', error.message || error);
    res.status(500).json({ error: 'An error occurred while fetching data.' });
  }
}
