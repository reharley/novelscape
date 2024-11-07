export interface AiModel {
  id: number;
  modelId: number;
  name: string;
  fileName: string;
  type: string;
  description?: string;
  baseModel: string;
  baseModelType?: string;
  images: ModelImage[];
  profiles: ProfileAiModel[];
  createdAt: string;
  updatedAt: string;
  CivitaiResource: CivitaiResource[];
  ProfileGenerationData: ProfileGenerationData[];
  Lora: Lora[];
  Embedding: Embedding[];
  NegativeEmbedding: NegativeEmbedding[];
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
  type?: string;
  bookId: string;
  imageUrl?: string;
  passageId?: number;
  descriptions: Description[];
  aiModels: ProfileAiModel[];
  imageId?: number;
  image?: ModelImage;
  aliases: Alias[];
  createdAt: string;
  updatedAt: string;
  imagePackages: ProfileImagePackage[];
  passage: Passage[];
  speakerPassages: Passage[];
  profileGenerationData: ProfileGenerationData[];
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
  ttsAi: boolean;
}

export interface Book {
  id: number;
  title: string;
  profiles: Profile[];
  storageUrl: string;
  coverUrl: string;
  userId: string;
  chapters: Chapter[];
  passages: Passage[];
  scenes: Scene[];
  createdAt: Date;
  updatedAt: Date;
  descriptions: Description[];
  stylePackageId?: number;
  stylePackage?: {
    id: number;
    name: string;
  };
}

export interface Chapter {
  id: number;
  order: number;
  title: string;
  bookId: number;
  processed: boolean;
  speechProcessed: boolean;
  passages: Passage[];
  scenes: Scene[];
  ReadingProgress: ReadingProgress[];
  ProcessingJob: ProcessingJob[];
  book?: Book;
}

export interface Passage {
  id: number;
  textContent: string;
  order: number;
  audioUrl?: string;
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
  profileId?: number;
  Profile?: Profile;
  wordTimestamps: WordTimestamp[];
}

export interface Scene {
  id: number;
  order: number;
  bookId: number;
  chapterId?: number;
  passages: Passage[];
  imageUrl?: string;
  createdAt: string;
  updatedAt: string;
  imagePackages: SceneImagePackage[];
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
  generationDataId: number;
  strength?: number;
  modelId: number;
  modelName: string;
  modelType: string;
  versionId: number;
  versionName: string;
  baseModel: string;
  generationData?: GenerationData;
  model?: AiModel;
}

export interface ModelImage {
  id: number;
  url: string;
  civitaiImageId?: number;
  modelId: number;
  nsfwLevel: number;
  width: number;
  height: number;
  hash: string;
  type: string;
  hasMeta: boolean;
  onSite: boolean;
  createdAt: string;
  updatedAt: string;
  generationData?: GenerationData;
  Profile: Profile[];
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
  bookId: number;
  chapterId?: number;
  errorMessage?: string;
  book?: Book;
  chapter?: Chapter;
}

export interface ProfileGenerationData {
  id: number;
  name: string;
  bookId: number;
  profileId: number;
  prompt: string;
  negativePrompt?: string;
  steps?: number;
  width?: number;
  height?: number;
  checkpointId: number;
  removeBackground: boolean;
  loras: WeightedModel[];
  embeddings: WeightedModel[];
  negativeEmbeddings: WeightedModel[];
  profileAssociations: ProfileImagePackage[];
  sceneAssociations: SceneImagePackage[];
  createdAt: string;
  updatedAt: string;
  generationPackageId?: number;
  generationPackage?: GenerationPackage;
  book?: Book;
  profile?: Profile;
}

export interface WeightedModel {
  id: number;
  aiModelId: number;
  aiModel: AiModel;
  weight?: number;
  profileGenerationDataLoraId?: number;
  profileGenerationDataEmbeddingId?: number;
  profileGenerationDataNegativeEmbeddingId?: number;
}

export interface Lora {
  id: number;
  aiModelId: number;
  name: string;
  weight: number;
  profileGenerationId: number;
  profileGenerationData: ProfileGenerationData;
}

export interface Embedding {
  id: number;
  aiModelId: number;
  name: string;
  profileGenerationId: number;
  profileGenerationData: ProfileGenerationData;
}

export interface NegativeEmbedding {
  id: number;
  aiModelId: number;
  name: string;
  profileGenerationId: number;
  profileGenerationData: ProfileGenerationData;
}

export interface ProfileImagePackage {
  profileId: number;
  profileGenerationId: number;
  profile: Profile;
  profileGeneration: ProfileGenerationData;
}

export interface SceneImagePackage {
  sceneId: number;
  profileGenerationId: number;
  scene: Scene;
  profileGeneration: ProfileGenerationData;
}

export interface ProfileAiModel {
  profileId: number;
  aiModelId: number;
  profile: Profile;
  aiModel: AiModel;
}

export interface GenerationPackage {
  id: number;
  name: string;
  bookId: number;
  profileGenerationData: ProfileGenerationData[];
  createdAt: string;
  updatedAt: string;
}

export interface Alias {
  id: number;
  name: string;
  profileId: number;
  profile?: Profile;
}

export interface User {
  id: string;
  readingProgress: ReadingProgress[];
  roles?: string;
  credits: number;
  UserSettings?: UserSettings;
}

export interface UserSettings {
  id: number;
  autoPlay: boolean;
  wpm: number;
  passageSpeaker: boolean;
  userId: string;
  user?: User;
}

export interface ReadingProgress {
  id: number;
  userId: string;
  bookId: number;
  chapterId: number;
  passageIndex: number;
  user?: User;
  book?: Book;
  chapter?: Chapter;
}

export interface StylePackage {
  id: number;
  name: string;
  characterProfileId: number;
  backgroundProfileId: number;
  characterProfile: ProfileGenerationData;
  backgroundProfile: ProfileGenerationData;
  createdAt: string;
  updatedAt: string;
}

export interface WordTimestamp {
  word: string;
  startTime: number;
  endTime: number;
}
