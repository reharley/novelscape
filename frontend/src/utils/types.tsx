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
export interface Book {
  id: string;
  title: string;
  // Add other fields if necessary
}

export interface Profile {
  id: number;
  name: string;
  type: string;
  bookId: string;
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
