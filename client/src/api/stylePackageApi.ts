import axios from 'axios';
import { apiUrl } from '../utils/general';
import { StylePackage } from '../utils/types';

const API_URL = apiUrl + '/api/style-packages';

// Get all StylePackages
export const getStylePackages = async (): Promise<StylePackage[]> => {
  const response = await axios.get(API_URL);
  return response.data;
};

// Get a single StylePackage by ID
export const getStylePackage = async (id: number): Promise<StylePackage> => {
  const response = await axios.get(`${API_URL}/${id}`);
  return response.data;
};

// Create a new StylePackage
export const createStylePackage = async (data: {
  name: string;
  characterProfileId: number;
  backgroundProfileId: number;
}): Promise<StylePackage> => {
  const response = await axios.post(API_URL, data);
  return response.data;
};

// Update an existing StylePackage
export const updateStylePackage = async (
  id: number,
  data: {
    name?: string;
    characterProfileId?: number;
    backgroundProfileId?: number;
  }
): Promise<StylePackage> => {
  const response = await axios.put(`${API_URL}/${id}`, data);
  return response.data;
};

// Delete a StylePackage
export const deleteStylePackage = async (id: number): Promise<void> => {
  await axios.delete(`${API_URL}/${id}`);
};
