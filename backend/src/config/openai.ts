import OpenAI from 'openai';

if (!process.env.OPENAI_API_KEY) {
  console.error('OpenAI API key not found.');
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
