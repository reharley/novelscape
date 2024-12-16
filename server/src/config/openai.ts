import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('OpenAI API key not found.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// const openai = new OpenAI({
//   apiKey: process.env.GROK_API_KEY,
//   baseURL: 'https://api.x.ai/v1',
// });

export default openai;
