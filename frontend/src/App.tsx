import axios from 'axios';
import React, { useState } from 'react';

interface Model {
  id: number;
  name: string;
  description: string;
  type: string; // Add type field
  // Add other fields as necessary
}

const App: React.FC = () => {
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [modelTypeFilter, setModelTypeFilter] = useState<string>('All');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);

  const baseUrl = 'http://localhost:5000';
  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    try {
      const response = await axios.get(baseUrl + '/search', {
        params: { query },
      });
      // Map over the results to include the type field
      const modelsData = response.data.items.map((item: any) => ({
        id: item.id,
        name: item.name,
        description: item.description,
        type: item.type, // Include the type
        // Add other fields as necessary
      }));
      setModels(modelsData || []);
    } catch (error) {
      console.error('Error fetching models:', error);
      alert('Failed to fetch models.');
    }
    setLoading(false);
  };

  const handleLoadModel = async (modelId: number) => {
    if (!window.confirm('Are you sure you want to load this model?')) return;
    try {
      const response = await axios.post(baseUrl + '/load-model', {
        modelId,
      });
      alert(response.data.message);
    } catch (error: any) {
      console.error('Error loading model:', error);
      alert(`Failed to load the model. ${error.response?.data?.error || ''}`);
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt) return;
    setLoading(true);
    try {
      const response = await axios.post(baseUrl + '/generate-image', {
        prompt,
      });
      setGeneratedImage(`data:image/png;base64,${response.data.image}`);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image.');
    }
    setLoading(false);
  };

  const filteredModels = models.filter((model) => {
    if (modelTypeFilter === 'All') return true;
    return model.type === modelTypeFilter;
  });
  return (
    <div style={{ padding: '20px' }}>
      <h1>CivitAI Model and Lora Search</h1>
      <div>
        <label>
          Filter by Type:
          <select
            value={modelTypeFilter}
            onChange={(e) => setModelTypeFilter(e.target.value)}
          >
            <option value='All'>All</option>
            <option value='Checkpoint'>Checkpoint</option>
            <option value='LoRA'>LoRA</option>
            <option value='TextualInversion'>Embedding</option>
            {/* Add other types as needed */}
          </select>
        </label>
      </div>
      {/* Search Section */}
      <div>
        <input
          type='text'
          placeholder='Search for models or Loras'
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '300px', marginRight: '10px' }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleSearch();
            }
          }}
        />
        <button onClick={handleSearch}>Search</button>
      </div>

      {loading && <p>Loading...</p>}

      {/* Models List */}
      <div style={{ marginTop: '20px' }}>
        {filteredModels.map((model) => (
          <div
            key={model.id}
            style={{ borderBottom: '1px solid #ccc', padding: '10px' }}
          >
            <h2>{model.name}</h2>
            <p>Type: {model.type}</p> {/* Display model type */}
            <p>{model.description}</p>
            <button onClick={() => handleLoadModel(model.id)}>
              Load {model.type}
            </button>
          </div>
        ))}
      </div>

      {/* Text-to-Image Generation Section */}
      <div style={{ marginTop: '40px' }}>
        <h2>Generate Image from Text Prompt</h2>
        <input
          type='text'
          placeholder='Enter your prompt'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ width: '500px', marginRight: '10px' }}
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleGenerateImage();
            }
          }}
        />
        <button onClick={handleGenerateImage}>Generate Image</button>
      </div>

      {/* Display Generated Image */}
      {generatedImage && (
        <div style={{ marginTop: '20px' }}>
          <h3>Generated Image:</h3>
          <img
            src={generatedImage}
            alt='Generated'
            style={{ maxWidth: '100%' }}
          />
        </div>
      )}
    </div>
  );
};

export default App;
