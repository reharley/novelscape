import axios from 'axios';
import { apiUrl } from '../utils/general';
import { ProfileGenerationData } from '../utils/types';

const API_URL = apiUrl + '/api/profile-generation-data';

// Get all ProfileGenerationData
export const getProfileGenerationData = async (): Promise<
  ProfileGenerationData[]
> => {
  const response = await axios.get(API_URL);
  return response.data;
};

// Get a single ProfileGenerationData by ID
export const getProfileGenerationDataById = async (
  id: number
): Promise<ProfileGenerationData> => {
  const response = await axios.get(`${API_URL}/${id}`);
  return response.data;
};

// Create a new ProfileGenerationData
export const createProfileGenerationData = async (data: {
  name: string;
  bookId: number;
  profileId: number;
  prompt: string;
  negativePrompt?: string;
  steps?: number;
  width?: number;
  height?: number;
  checkpointId: number;
  removeBackground?: boolean;
  loras: { id: number }[];
  embeddings: { id: number }[];
  negativeEmbeddings: { id: number }[];
  generationPackageId?: number;
}): Promise<ProfileGenerationData> => {
  const response = await axios.post(API_URL, data);
  return response.data;
};

// Update an existing ProfileGenerationData
export const updateProfileGenerationData = async (
  id: number,
  data: {
    name?: string;
    bookId?: number;
    profileId?: number;
    prompt?: string;
    negativePrompt?: string;
    steps?: number;
    width?: number;
    height?: number;
    checkpointId?: number;
    removeBackground?: boolean;
    loras?: { id: number }[];
    embeddings?: { id: number }[];
    negativeEmbeddings?: { id: number }[];
    generationPackageId?: number;
  }
): Promise<ProfileGenerationData> => {
  const response = await axios.put(`${API_URL}/${id}`, data);
  return response.data;
};

// Delete a ProfileGenerationData
export const deleteProfileGenerationData = async (
  id: number
): Promise<void> => {
  await axios.delete(`${API_URL}/${id}`);
};
