// src/index.ts

import axios from 'axios';
import cors from 'cors';
import express from 'express';

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.get('/search', async (req, res) => {
  const { query } = req.query;
  try {
    const response = await axios.get('https://civitai.com/api/v1/models', {
      params: { query },
    });

    res.json(response.data);
  } catch (error) {
    console.error('Error fetching data from Civit AI:', error);
    res.status(500).json({ error: 'An error occurred while fetching data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
