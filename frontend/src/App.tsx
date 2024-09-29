import axios from 'axios';
import React, { useEffect, useState } from 'react';

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
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [downloadedLoras, setDownloadedLoras] = useState<string[]>([]);
  const [selectedLoras, setSelectedLoras] = useState<string[]>([]);

  const baseUrl = 'http://localhost:5000';
  useEffect(() => {
    const fetchDownloadedLoras = async () => {
      try {
        const response = await axios.get(baseUrl + '/list-loras');
        const loras = response.data.map((lora: any) => lora.name);
        setDownloadedLoras(loras);
      } catch (error) {
        console.error('Error fetching downloaded LoRas:', error);
      }
    };

    fetchDownloadedLoras();
  }, []);
  useEffect(() => {
    const fetchDownloadedModels = async () => {
      try {
        const response = await axios.get(baseUrl + '/list-models');
        const models = response.data.map((model: any) => model.name);
        setDownloadedModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0]); // Set default selected model
        }
      } catch (error) {
        console.error('Error fetching downloaded models:', error);
      }
    };

    fetchDownloadedModels();
  }, []);
  const handleLoraSelection = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = e.target.options;
    const selected: string[] = [];
    for (let i = 0, l = options.length; i < l; i++) {
      if (options[i].selected) {
        selected.push(options[i].value);
      }
    }
    setSelectedLoras(selected);
  };
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

  const handleLoadModel = async (modelId: number, modelType: string) => {
    if (!window.confirm(`Are you sure you want to load this ${modelType}?`))
      return;
    try {
      const response = await axios.post('/load-model', {
        modelId,
      });
      alert(response.data.message);
    } catch (error: any) {
      console.error(`Error loading ${modelType}:`, error);
      alert(
        `Failed to load the ${modelType}. ${error.response?.data?.error || ''}`
      );
    }
  };

  const handleGenerateImage = async () => {
    if (!prompt) return;
    setLoading(true);
    try {
      const response = await axios.post(baseUrl + '/generate-image', {
        prompt,
        loras: selectedLoras,
        model: selectedModel,
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
        {models.map((model) => (
          <div
            key={model.id}
            style={{ borderBottom: '1px solid #ccc', padding: '10px' }}
          >
            <h2>{model.name}</h2>
            <p>Type: {model.type}</p>
            <p>{model.description}</p>
            <button onClick={() => handleLoadModel(model.id, model.type)}>
              Load {model.type}
            </button>
          </div>
        ))}
      </div>

      {/* Downloaded Models List */}
      <div style={{ marginTop: '20px' }}>
        <h2>Select a Model</h2>
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
        >
          {downloadedModels.map((modelName) => (
            <option key={modelName} value={modelName}>
              {modelName}
            </option>
          ))}
        </select>
      </div>

      {/* LoRa Selection */}
      <div style={{ marginTop: '20px' }}>
        <h2>Select LoRas to Include</h2>
        <select
          multiple
          value={selectedLoras}
          onChange={handleLoraSelection}
          style={{ width: '300px', height: '100px' }}
        >
          {downloadedLoras.map((loraName) => (
            <option key={loraName} value={loraName}>
              {loraName}
            </option>
          ))}
        </select>
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
