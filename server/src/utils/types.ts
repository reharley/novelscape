import {
  AiModel,
  Book,
  Chapter,
  CivitaiResource,
  Description,
  GenerationData,
  ModelImage,
  Profile,
  ProfileGenerationData,
  Scene,
  StylePackage,
  WeightedModel,
} from '@prisma/client';

export type CivitaiResourceWithModel = CivitaiResource & {
  model: AiModel;
};

export type GenerationDataWithRelations = GenerationData & {
  civitaiResources?: (CivitaiResourceWithModel | null)[] | null;
};

export type ModelImageWithRelations = ModelImage & {
  generationData?: GenerationDataWithRelations | null;
  model?: AiModel | null;
};

export type ProfileWithRelations = Profile & {
  descriptions: Description[];
  image?: ModelImageWithRelations | null;
};

export type SceneWithRelations = Scene & {
  passages?: PassageWithRelations[]; // Include passages if needed
};

export type PassageWithRelations = {
  id: number;
  textContent: string;
  profiles: ProfileWithRelations[];
};

export type PassageWithProfileSpeaker = {
  id: number;
  textContent: string;
  profiles: Profile[];
  speaker: Profile | null;
};

export interface ChapterWithRelations extends Chapter {
  book: Book;
  scenes: SceneWithRelations[];
}

export interface StylePackageWithRelations extends StylePackage {
  backgroundProfile: ProfileGenerationDataWithRelations;
  characterProfile: ProfileGenerationDataWithRelations;
}

export interface ProfileGenerationDataWithRelations
  extends ProfileGenerationData {
  loras: WeightedModelWithRelations[];
  embeddings: WeightedModelWithRelations[];
  negativeEmbeddings: WeightedModelWithRelations[];
  checkpoint: AiModel;
}

export interface WeightedModelWithRelations extends WeightedModel {
  aiModel: AiModel;
}
