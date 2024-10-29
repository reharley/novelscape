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
  profile: Profile;
  profileId: number;
  passageId: number;
}

export interface UserSettings {
  id: number;
  passageSpeaker: boolean;
  autoPlay: boolean;
  wpm: number;
  userId: string;
}

export interface Book {
  id: number;
  profiles: Profile[];
  title: string;
  storageUrl: string;
  coverUrl: string;
  userId: string;
  chapters: Chapter[];
  passages: Passage[];
  scenes: Scene[];
  createdAt: Date;
  updatedAt: Date;
  descriptions: Description[];
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
  speakerId?: number;
  speaker?: Profile;
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

export interface ProcessingJob {
  id: number;
  jobType: string;
  targetId: number;
  status: string;
  phase: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  progress: number;
  startTime: string | null;
  endTime: string | null;
  createdAt: string;
  updatedAt: string;
}
