export interface AiModel {
  id: number;
  modelId: number;
  name: string;
  fileName: string;
  type: string;
  description?: string;
  baseModel: string;
  baseModelType: string;
  images?: any;
  createdAt: string;
  modelVersions: ModelVersion[];
  updatedAt: string;
}
export interface ModelVersion {
  id: number;
  name: string;
  description?: string;
  images: ModelImage[];
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
  bookId: string;
  chapterId: number;
  createdAt: string;
  updatedAt: string;
  descriptions: Description[];
  scene?: Scene;
  sceneId?: number;
  splitId?: string;
}
export interface Scene {
  id: number;
  order: number;
  bookId: string;
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
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
export interface ModelImage {
  id: number;
  url: string;
  nsfwLevel: number;
  width: number;
  height: number;
  hash: string;
  type: string;
  hasMeta: boolean;
  onSite: boolean;
  createdAt: string;
  updatedAt: string;
  modelId: number;
}

export interface ImageGenerationJob {
  id: number;
  type: string; // e.g., 'chapter', 'scene'
  targetId: number; // ID of the chapter or scene
  status: string; // 'pending', 'in_progress', 'completed', 'completed_with_errors'
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  progress: number; // 0 - 100
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}
