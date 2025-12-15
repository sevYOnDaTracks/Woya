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
