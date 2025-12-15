import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PostsService } from '../../core/services/posts';
import { Post } from '../../core/models/post.model';
import { AuthStore } from '../../core/store/auth.store';
import { ProfilesService } from '../../core/services/profiles';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-posts',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './posts.html',
  styleUrl: './posts.css',
})
export default class PostsPage implements OnInit, OnDestroy {
  posts: Post[] = [];
  loading = true;
  loadingMore = false;
  hasMore = true;
  error = '';

  newPostBody = '';
  creating = false;
  currentUid: string | null = null;
  currentAuthorLabel = '';

  private cursor: any | null = null;
  private authSub?: Subscription;

  constructor(
    private postsService: PostsService,
    private auth: AuthStore,
    private profiles: ProfilesService,
    private router: Router,
  ) {}

  ngOnInit() {
    this.authSub = this.auth.user$.subscribe(user => {
      this.currentUid = user?.uid ?? null;
      this.currentAuthorLabel = this.buildAuthorLabel(user);
    });
    void this.loadInitial();
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  async loadInitial() {
    this.loading = true;
    this.error = '';
    try {
      const { posts, cursor } = await this.postsService.listPosts(PAGE_SIZE);
      this.posts = posts;
      this.cursor = cursor;
      this.hasMore = posts.length === PAGE_SIZE;
      await this.hydrateAuthors(posts);
      await this.hydrateLikes(posts);
    } catch (error) {
      console.error('Unable to load posts', error);
      this.error = 'Impossible de charger les publications pour le moment.';
    } finally {
      this.loading = false;
    }
  }

  async loadMore() {
    if (!this.hasMore || this.loadingMore) return;
    this.loadingMore = true;
    try {
      const { posts, cursor } = await this.postsService.listPosts(PAGE_SIZE, this.cursor);
      this.cursor = cursor;
      this.hasMore = posts.length === PAGE_SIZE;
      this.posts = [...this.posts, ...posts];
      await this.hydrateAuthors(posts);
      await this.hydrateLikes(posts);
    } catch (error) {
      console.error('Unable to load more posts', error);
    } finally {
      this.loadingMore = false;
    }
  }

  async createPost() {
    if (!this.currentUid) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/publications' } });
      return;
    }
    const body = this.newPostBody.trim();
    if (!body) return;
    if (body.length > 500) {
      this.error = 'Le message est trop long (500 caracteres max).';
      return;
    }
    this.creating = true;
    this.error = '';
    try {
      const created = await this.postsService.createPost({ body });
      created.author = this.buildAuthorFromCurrent();
      created.likedByUser = false;
      this.posts = [created, ...this.posts];
      this.newPostBody = '';
    } catch (err) {
      console.error('Unable to publish', err);
      this.error = 'Impossible de publier pour le moment.';
    } finally {
      this.creating = false;
    }
  }

  async toggleLike(post: Post) {
    if (!this.currentUid) {
      this.router.navigate(['/login'], { queryParams: { redirect: '/publications' } });
      return;
    }
    const nextState = !post.likedByUser;
    post.likedByUser = nextState;
    post.likeCount = Math.max(0, (post.likeCount ?? 0) + (nextState ? 1 : -1));
    try {
      await this.postsService.toggleLike(post.id, this.currentUid, nextState);
    } catch (error) {
      console.error('Unable to toggle like', error);
      post.likedByUser = !nextState;
      post.likeCount = Math.max(0, (post.likeCount ?? 0) + (nextState ? -1 : 1));
    }
  }

  trackByPostId(_index: number, post: Post) {
    return post.id;
  }

  formatDate(timestamp?: number) {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  authorName(post: Post) {
    const author = post.author;
    if (!author) return 'Utilisateur';
    if (author.pseudo) return author.pseudo;
    const parts = [author.firstname, author.lastname].filter(Boolean);
    return parts.length ? parts.join(' ') : 'Utilisateur';
  }

  private buildAuthorLabel(user: any) {
    if (!user) return '';
    if (user.pseudo) return user.pseudo;
    const parts = [user.firstname, user.lastname].filter(Boolean);
    return parts.join(' ');
  }

  private buildAuthorFromCurrent() {
    const profile = this.auth.user$.value;
    if (!profile) return undefined;
    return {
      pseudo: profile.pseudo || undefined,
      firstname: profile.firstname || undefined,
      lastname: profile.lastname || undefined,
      photoURL: profile.photoURL || undefined,
      city: (profile as any).city || undefined,
      profession: (profile as any).profession || undefined,
    };
  }

  private async hydrateAuthors(posts: Post[]) {
    const ids = Array.from(new Set(posts.map(p => p.authorId).filter(Boolean)));
    if (!ids.length) return;
    try {
      const profiles = await this.profiles.getProfilesByIds(ids);
      this.posts = this.posts.map(post => ({
        ...post,
        author: profiles[post.authorId] || post.author,
      }));
    } catch (error) {
      console.warn('Unable to hydrate post authors', error);
    }
  }

  private async hydrateLikes(posts: Post[]) {
    if (!this.currentUid || !posts.length) return;
    await Promise.all(
      posts.map(async post => {
        try {
          const liked = await this.postsService.hasUserLiked(post.id, this.currentUid!);
          this.posts = this.posts.map(p =>
            p.id === post.id ? { ...p, likedByUser: liked } : p,
          );
        } catch (error) {
          console.warn('Unable to load like state', error);
        }
      }),
    );
  }
}
