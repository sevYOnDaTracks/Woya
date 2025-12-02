export interface RequestPost {
  id: string;
  category: string;
  description: string;
  photos: string[];
  ownerId: string;
  ownerPseudo?: string;
  ownerCity?: string;
  createdAt: number;
  status: 'active' | 'closed';
}

