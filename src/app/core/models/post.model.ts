export type PostVisibility = 'public' | 'clients' | 'providers';
export type PostStatus = 'published' | 'pending' | 'rejected';

export interface Post {
  id: string;
  authorId: string;
  author?: {
    pseudo?: string;
    firstname?: string;
    lastname?: string;
    photoURL?: string;
    city?: string;
    profession?: string;
  };
  body: string;
  address?: string | null;
  phone?: string | null;
  mediaUrls?: string[];
  category?: string | null;
  serviceTitle?: string | null;
  serviceId?: string | null;
  city?: string | null;
  visibility?: PostVisibility;
  status?: PostStatus;
  createdAt?: number;
  updatedAt?: number;
  likeCount?: number;
  commentCount?: number;
  likedByUser?: boolean;
}
