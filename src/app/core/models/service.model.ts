export interface WoyaService {
  id?: string;
  title: string;
  description: string;
  category: string;
  city: string;
  price?: number;
  contact: string;
  createdAt: number;
  coverUrl?: string;
}