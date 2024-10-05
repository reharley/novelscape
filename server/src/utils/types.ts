import {
  AiModel,
  Book,
  CivitaiResource,
  Description,
  GenerationData,
  ModelImage,
  Profile,
  Scene,
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
  book: Book;
  passages?: PassageWithRelations[]; // Include passages if needed
};

export type PassageWithRelations = {
  id: number;
  textContent: string;
  profiles: ProfileWithRelations[];
};
