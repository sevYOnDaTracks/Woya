export interface WoyaService {
  id?: string;
  title: string;
  description: string;
  category: string;
  city: string;
  price?: number | null;
  contact: string;
  createdAt: number;
  updatedAt?: number;
  coverUrl?: string | null;
  extraImages?: (string | null)[];
  ownerId?: string;
}
