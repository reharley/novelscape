export interface AiModel {
  id: number;
  modelId: number;
  name: string;
  fileName: string;
  type: string;
  description?: string;
  images?: any; // Adjust based on your image data structure
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: number;
  name: string;
  type: string;
  bookId: string;
  imageUrl?: string;
  passageId?: number;
  descriptions: Description[];
  aiModels: AiModel[];
}

export interface Description {
  id: number;
  text: string;
  profileId: number;
  passageId: number;
}

export interface Book {
  id: string;
  title: string;
  profiles: Profile[];
}

export interface Chapter {
  id: number;
  order: number;
  title: string;
}

export interface Passage {
  id: number;
  textContent: string;
  order: number;
  profiles: Profile[];
}

export interface ModelImage {
  id: number;
  url: string;
  modelId: number;
  nsfwLevel: number;
  width: number;
  height: number;
  hash: string;
  type: string;
}

export interface GenerationData {
  id: number;
  prompt: string;
  negativePrompt: string;
  cfgScale: number;
  steps: number;
  sampler: string;
  seed: number;
  size: string;
  createdDate: string;
  clipSkip: number;
  civitaiResources: CivitaiResource[];
  modelImageId: number;
}

export interface CivitaiResource {
  id: number;
  type: string;
  weight?: number;
  modelVersionId: number;
  modelVersionName: string;
}
